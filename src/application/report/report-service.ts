import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/// Disparo = CampaignTarget que chegou de fato no contato (SENT/DELIVERED/
/// READ) — FAILED nunca chegou, então não entra na conta de "teve retorno".
const REACHED_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

interface QueueMetric {
  queueId: string;
  queueName: string;
  serviceIslandName: string;
  ticketCount: number;
  /// null = nenhum ticket fechado com assignedAt (sem amostra pra calcular).
  avgHandlingMs: number | null;
}

interface ChannelGrowth {
  channelId: string;
  displayNumber: string;
  agentName: string | null;
  currentPeriodContacts: number;
  previousPeriodContacts: number;
  /// null = sem base de comparação (0 contatos no período anterior) — canal
  /// novo ou que só passou a receber contatos agora.
  growthPercent: number | null;
}

interface TopAttendant {
  userId: string;
  name: string;
  email: string;
  closedTicketCount: number;
}

interface WeekdayResponseMetric {
  weekday: string;
  total: number;
  responded: number;
  responseRate: number | null;
}

/// Segunda a Domingo, na ordem pedida pelo produto — não é a ordem de
/// Date#getDay() (0=domingo), por isso o mapeamento explícito abaixo.
const WEEKDAY_LABELS_MON_TO_SUN = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/// Date#getDay() -> índice em WEEKDAY_LABELS_MON_TO_SUN (0=domingo vira o
/// último rótulo, 1=segunda vira o primeiro, etc.).
function weekdayLabelIndex(jsGetDay: number): number {
  return (jsGetDay + 6) % 7;
}

export const reportService = {
  /// Cards "Contatos com agente" / "Contatos em atendimento humano" —
  /// contagem organization-wide, sem os filtros da tela de Contatos (a tela
  /// de Relatórios não tem os mesmos filtros).
  async getContactsByStatus(user: AuthUser) {
    const organizationId = user.activeOrganizationId!;
    const [withAgent, withHuman] = await Promise.all([
      prisma.target.count({ where: { organizationId, status: "AI" } }),
      prisma.target.count({ where: { organizationId, status: "HUMAN" } }),
    ]);
    return { withAgent, withHuman };
  },

  /// Duração média de conversa = média de (lastInteractionAt -
  /// firstInteractionAt) entre os contatos que já tiveram alguma interação.
  async getAvgConversationDuration(user: AuthUser) {
    const organizationId = user.activeOrganizationId!;
    const targets = await prisma.target.findMany({
      where: { organizationId, lastInteractionAt: { not: null } },
      select: { firstInteractionAt: true, lastInteractionAt: true },
    });

    if (targets.length === 0) return { avgDurationMs: null, sampleSize: 0 };

    const totalMs = targets.reduce(
      (sum, t) => sum + (t.lastInteractionAt!.getTime() - t.firstInteractionAt.getTime()),
      0,
    );
    return { avgDurationMs: Math.round(totalMs / targets.length), sampleSize: targets.length };
  },

  /// Fila com mais tickets (volume de interação), fila mais lenta e mais
  /// rápida — duração do atendimento = mesmo handlingDurationMs usado no
  /// monitoramento (assignedAt -> closedAt, só tickets fechados e assumidos),
  /// não o tempo de vida total do ticket (que incluiria espera na fila).
  async getQueueMetrics(user: AuthUser) {
    const organizationId = user.activeOrganizationId!;

    const [queues, tickets] = await Promise.all([
      prisma.queue.findMany({
        where: { serviceIsland: { organizationId }, deletedAt: null },
        select: { id: true, name: true, serviceIsland: { select: { name: true } } },
      }),
      prisma.ticket.findMany({
        where: { organizationId },
        select: { queueId: true, status: true, assignedAt: true, closedAt: true },
      }),
    ]);

    const byQueue = new Map<string, { count: number; handlingSumMs: number; handlingSamples: number }>();
    for (const ticket of tickets) {
      const entry = byQueue.get(ticket.queueId) ?? { count: 0, handlingSumMs: 0, handlingSamples: 0 };
      entry.count += 1;
      if (ticket.status === "CLOSED" && ticket.assignedAt && ticket.closedAt) {
        entry.handlingSumMs += ticket.closedAt.getTime() - ticket.assignedAt.getTime();
        entry.handlingSamples += 1;
      }
      byQueue.set(ticket.queueId, entry);
    }

    const ranked: QueueMetric[] = queues.map((queue) => {
      const entry = byQueue.get(queue.id);
      return {
        queueId: queue.id,
        queueName: queue.name,
        serviceIslandName: queue.serviceIsland.name,
        ticketCount: entry?.count ?? 0,
        avgHandlingMs: entry && entry.handlingSamples > 0 ? Math.round(entry.handlingSumMs / entry.handlingSamples) : null,
      };
    });

    const mostInteractions = ranked.reduce<QueueMetric | null>(
      (max, q) => (q.ticketCount > (max?.ticketCount ?? -1) ? q : max),
      null,
    );

    const withHandling = ranked.filter((q) => q.avgHandlingMs !== null);
    const slowest = withHandling.reduce<QueueMetric | null>(
      (max, q) => (q.avgHandlingMs! > (max?.avgHandlingMs ?? -1) ? q : max),
      null,
    );
    const fastest = withHandling.reduce<QueueMetric | null>(
      (min, q) => (q.avgHandlingMs! < (min?.avgHandlingMs ?? Infinity) ? q : min),
      null,
    );

    return { mostInteractions, slowest, fastest };
  },

  /// Top 5 canais por crescimento de contatos novos: últimos 30 dias vs os
  /// 30 dias anteriores. Canal sem contato nenhum nos dois períodos fica de
  /// fora do ranking (sem sinal pra comparar).
  async getTopChannelsByGrowth(user: AuthUser): Promise<ChannelGrowth[]> {
    const organizationId = user.activeOrganizationId!;
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - THIRTY_DAYS_MS);
    const previousPeriodStart = new Date(now.getTime() - 2 * THIRTY_DAYS_MS);

    const [channels, currentCounts, previousCounts] = await Promise.all([
      prisma.channel.findMany({
        where: { organizationId },
        select: { id: true, displayNumber: true, agent: { select: { name: true } } },
      }),
      prisma.target.groupBy({
        by: ["whatsappChannelId"],
        where: { organizationId, createdAt: { gte: currentPeriodStart, lte: now } },
        _count: { _all: true },
      }),
      prisma.target.groupBy({
        by: ["whatsappChannelId"],
        where: { organizationId, createdAt: { gte: previousPeriodStart, lt: currentPeriodStart } },
        _count: { _all: true },
      }),
    ]);

    const currentMap = new Map(currentCounts.map((c) => [c.whatsappChannelId, c._count._all]));
    const previousMap = new Map(previousCounts.map((c) => [c.whatsappChannelId, c._count._all]));

    const ranked: ChannelGrowth[] = channels
      .map((channel) => {
        const current = currentMap.get(channel.id) ?? 0;
        const previous = previousMap.get(channel.id) ?? 0;
        return {
          channelId: channel.id,
          displayNumber: channel.displayNumber,
          agentName: channel.agent?.name ?? null,
          currentPeriodContacts: current,
          previousPeriodContacts: previous,
          growthPercent: previous > 0 ? ((current - previous) / previous) * 100 : null,
        };
      })
      .filter((c) => c.currentPeriodContacts > 0 || c.previousPeriodContacts > 0);

    // Sem base de comparação (growthPercent null) = crescimento "infinito"
    // (saiu do zero) — vai pro topo, ordenado entre si pelo volume atual.
    ranked.sort((a, b) => {
      const aScore = a.growthPercent ?? Infinity;
      const bScore = b.growthPercent ?? Infinity;
      if (aScore !== bScore) return bScore - aScore;
      return b.currentPeriodContacts - a.currentPeriodContacts;
    });

    return ranked.slice(0, 5);
  },

  /// Top 5 atendentes por tickets encerrados (status CLOSED, independente do
  /// motivo de fechamento) — organization-wide, não recorta por fila/ilha.
  async getTopAttendantsByClosedTickets(user: AuthUser): Promise<TopAttendant[]> {
    const organizationId = user.activeOrganizationId!;

    const grouped = await prisma.ticket.groupBy({
      by: ["assignedUserId"],
      where: { organizationId, status: "CLOSED", assignedUserId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { assignedUserId: "desc" } },
      take: 5,
    });

    const userIds = grouped.map((g) => g.assignedUserId!).filter(Boolean);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return grouped.map((g) => ({
      userId: g.assignedUserId!,
      name: userMap.get(g.assignedUserId!)?.name ?? "Atendente removido",
      email: userMap.get(g.assignedUserId!)?.email ?? "",
      closedTicketCount: g._count._all,
    }));
  },

  /// Total de campanhas, quantos disparos de fato chegaram no contato, o
  /// total de contatos que passaram por alguma campanha (sucesso ou falha de
  /// envio), e qual fração dos disparos alcançados teve resposta do cliente
  /// depois.
  /// "Resposta" = mensagem do cliente (senderType CUSTOMER) depois do horário
  /// do disparo e antes do PRÓXIMO disparo pro mesmo contato (se houver) —
  /// assim uma resposta é atribuída ao disparo que efetivamente a motivou,
  /// mesmo quando o mesmo contato recebeu várias campanhas.
  async getCampaignMetrics(user: AuthUser) {
    const organizationId = user.activeOrganizationId!;

    // totalContacts/totalFailures vêm da MESMA query ao vivo do CampaignTarget
    // que gera reachedContacts (em vez dos contadores acumulados em Campaign),
    // pra nunca destoar entre si — os contadores da Campaign só sobem e nunca
    // são ajustados quando um Target é apagado (o CampaignTarget dele some
    // em cascata, mas o contador da campanha fica com o valor antigo).
    const [totalCampaigns, allDispatches] = await Promise.all([
      prisma.campaign.count({ where: { organizationId } }),
      prisma.campaignTarget.findMany({
        where: { campaign: { organizationId } },
        select: { targetId: true, createdAt: true, status: true, respondedCampaign: true },
      }),
    ]);

    const totalContacts = allDispatches.length;
    const dispatches = allDispatches.filter((d) => (REACHED_STATUSES as readonly string[]).includes(d.status));
    const reachedContacts = dispatches.length;
    const totalFailures = totalContacts - reachedContacts;
    // Saldo de envio: alcançados - total de contatos processados. Sempre <= 0
    // (nunca alcançamos mais do que processamos) — quanto mais perto de 0,
    // melhor a entrega; bem negativo indica muita falha de envio.
    const reachDelta = reachedContacts - totalContacts;

    // Dia da semana do DISPARO (CampaignTarget.createdAt) x quantos daquele
    // dia já têm respondedCampaign=true (ver Inbound-Service/campaign-response-service.ts,
    // quem preenche essa flag). Só entre os disparos que de fato chegaram
    // (REACHED_STATUSES) — um FAILED nunca chega a ser respondido.
    const weekdayBuckets = WEEKDAY_LABELS_MON_TO_SUN.map((weekday) => ({ weekday, total: 0, responded: 0 }));
    for (const d of dispatches) {
      const bucket = weekdayBuckets[weekdayLabelIndex(d.createdAt.getDay())];
      bucket.total += 1;
      if (d.respondedCampaign) bucket.responded += 1;
    }
    const responsesByWeekday: WeekdayResponseMetric[] = weekdayBuckets.map((b) => ({
      ...b,
      responseRate: b.total > 0 ? (b.responded / b.total) * 100 : null,
    }));

    if (reachedContacts === 0) {
      return {
        totalCampaigns,
        reachedContacts,
        totalContacts,
        totalFailures,
        reachDelta,
        respondedDispatches: 0,
        responseRate: null as number | null,
        responsesByWeekday,
      };
    }

    const dispatchesByTarget = new Map<string, number[]>();
    for (const d of dispatches) {
      const list = dispatchesByTarget.get(d.targetId) ?? [];
      list.push(d.createdAt.getTime());
      dispatchesByTarget.set(d.targetId, list);
    }

    const targetIds = [...dispatchesByTarget.keys()];
    const db = await getMongoDb();
    const messagesCollection = db.collection<MessageDocument>(MESSAGES_COLLECTION);
    const customerMessages = await messagesCollection
      .find(
        { organizationId, targetId: { $in: targetIds }, senderType: "CUSTOMER" },
        { projection: { targetId: 1, createdAt: 1 } },
      )
      .toArray();

    const repliesByTarget = new Map<string, number[]>();
    for (const m of customerMessages) {
      const list = repliesByTarget.get(m.targetId) ?? [];
      list.push(new Date(m.createdAt).getTime());
      repliesByTarget.set(m.targetId, list);
    }

    let respondedDispatches = 0;
    for (const [targetId, times] of dispatchesByTarget) {
      const sortedDispatches = [...times].sort((a, b) => a - b);
      const replies = (repliesByTarget.get(targetId) ?? []).sort((a, b) => a - b);

      sortedDispatches.forEach((dispatchTime, i) => {
        const windowEnd = i + 1 < sortedDispatches.length ? sortedDispatches[i + 1] : Infinity;
        if (replies.some((r) => r > dispatchTime && r < windowEnd)) respondedDispatches += 1;
      });
    }

    return {
      totalCampaigns,
      reachedContacts,
      totalContacts,
      totalFailures,
      reachDelta,
      respondedDispatches,
      responseRate: (respondedDispatches / reachedContacts) * 100,
      responsesByWeekday,
    };
  },

  async getOverview(user: AuthUser) {
    const [
      contactsByStatus,
      avgConversationDuration,
      queueMetrics,
      channelCount,
      topChannelsByGrowth,
      topAttendantsByClosedTickets,
      campaignMetrics,
    ] = await Promise.all([
      this.getContactsByStatus(user),
      this.getAvgConversationDuration(user),
      this.getQueueMetrics(user),
      prisma.channel.count({ where: { organizationId: user.activeOrganizationId! } }),
      this.getTopChannelsByGrowth(user),
      this.getTopAttendantsByClosedTickets(user),
      this.getCampaignMetrics(user),
    ]);

    return {
      contactsByStatus,
      avgConversationDuration,
      queueMetrics,
      channelCount,
      topChannelsByGrowth,
      topAttendantsByClosedTickets,
      campaignMetrics,
    };
  },
};
