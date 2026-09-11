import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import {
  getPhoneNumberStatus,
  getTemplateVariableCount,
  listWabaPhoneNumbers,
  listWabaTemplates,
} from "../../infrastructure/meta/meta-graph-client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type {
  BulkCreateWhatsappChannelInput,
  CreateWhatsappChannelInput,
  SeriesRange,
  UpdateWhatsappChannelInput,
} from "./whatsapp-channel-validation";

/// Alimenta os gráficos "Fluxo de conversas"/"Fluxo de mensagens" (Area Chart
/// - Interactive do shadcn) na tela de detalhe do canal. Ranges curtos (7
/// dias, 1 mês, 3 meses) vêm com granularidade diária; "years" (últimos 24
/// meses) vem com granularidade mensal — não faria sentido plotar ~730 pontos
/// diários num gráfico de 2 anos.
const DAY_MS = 24 * 60 * 60 * 1000;

function resolveSeriesRange(range: SeriesRange): { start: Date; end: Date; granularity: "day" | "month" } {
  const now = new Date();
  // Exclusivo, início do dia seguinte (UTC) — garante que o dia corrente
  // inteiro entra no range, sem depender da hora exata da consulta.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  switch (range) {
    case "7d":
      return { start: new Date(end.getTime() - 7 * DAY_MS), end, granularity: "day" };
    case "1m":
      return { start: new Date(end.getTime() - 30 * DAY_MS), end, granularity: "day" };
    case "3m":
      return { start: new Date(end.getTime() - 90 * DAY_MS), end, granularity: "day" };
    case "years":
      return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1)), end, granularity: "month" };
  }
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/// Gera a lista de chaves de bucket (dias ou meses) do range inteiro, mesmo
/// os sem nenhum dado — sem isso o gráfico ficaria com buracos em vez de 0.
function buildBucketKeys(start: Date, end: Date, granularity: "day" | "month"): string[] {
  const keys: string[] = [];
  if (granularity === "day") {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    while (cursor < end) {
      keys.push(dayKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor < end) {
      keys.push(monthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return keys;
}

async function assertAgentBelongsToOrganization(agentId: string, organizationId: string): Promise<void> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!agent) throw new ValidationError("Agente inválido para esta empresa.");
}

/// A fila só pode ser escolhida como idServiceIslandDefault se pertencer à
/// própria ilha do canal (e estiver ativa, não soft-deletada).
async function assertQueueBelongsToChannelIsland(queueId: string, whatsappChannelId: string): Promise<void> {
  const queue = await prisma.queue.findFirst({
    where: { id: queueId, deletedAt: null, serviceIsland: { whatsappChannelId } },
    select: { id: true },
  });
  if (!queue) throw new ValidationError("Fila inválida para a ilha de atendimento deste canal.");
}

/// Cria o WhatsappChannel + sua ilha de atendimento (1:1) + a fila "Default"
/// da ilha, sempre na mesma transação — toda ilha nasce com essa fila (nunca
/// pode ser excluída, ver queue-service.ts). Como a ilha acabou de nascer, a
/// Default é a ÚNICA fila dela: já fica marcada de cara como a fila de
/// encaminhamento do canal (idServiceIslandDefault), usada quando
/// openAgent=false.
async function createChannelWithIsland(
  tx: typeof prisma,
  data: {
    organizationId: string;
    agentId: string | null;
    openAgent: boolean;
    phoneNumberId: string;
    displayNumber: string;
    wabaId: string;
    metaAccessToken: string;
  },
) {
  const channel = await tx.whatsappChannel.create({
    data: {
      organizationId: data.organizationId,
      agentId: data.agentId,
      openAgent: data.openAgent,
      phoneNumberId: data.phoneNumberId,
      displayNumber: data.displayNumber,
      wabaId: data.wabaId,
      metaAccessToken: data.metaAccessToken,
    },
  });

  const serviceIsland = await tx.serviceIsland.create({
    data: {
      organizationId: data.organizationId,
      whatsappChannelId: channel.id,
      name: `Ilha de atendimento - ${data.displayNumber}`,
    },
  });

  const defaultQueue = await tx.queue.create({
    data: { serviceIslandId: serviceIsland.id, name: "Default", isDefault: true },
  });

  const updatedChannel = await tx.whatsappChannel.update({
    where: { id: channel.id },
    data: { idServiceIslandDefault: defaultQueue.id },
  });

  return { ...updatedChannel, serviceIsland: { ...serviceIsland, queues: [defaultQueue] } };
}

export const whatsappChannelService = {
  async list(user: AuthUser) {
    return prisma.whatsappChannel.findMany({
      where: { organizationId: user.activeOrganizationId! },
      include: { serviceIsland: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(user: AuthUser, id: string) {
    const channel = await prisma.whatsappChannel.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { serviceIsland: true },
    });
    if (!channel) throw new NotFoundError("WhatsApp Channel não encontrado.");
    return channel;
  },

  /// Cada WhatsApp Channel tem, por regra, exatamente uma ilha de atendimento —
  /// criada automaticamente aqui, na mesma transação (com sua fila Default),
  /// para que nunca exista um canal sem ilha nem uma ilha sem fila.
  async create(user: AuthUser, input: CreateWhatsappChannelInput) {
    if (input.agentId) {
      await assertAgentBelongsToOrganization(input.agentId, user.activeOrganizationId!);
    }

    const existing = await prisma.whatsappChannel.findFirst({
      where: { phoneNumberId: input.phoneNumberId },
      select: { id: true },
    });
    if (existing) throw new ConflictError("Já existe um WhatsApp Channel com este Phone Number ID.");

    return prisma.$transaction((tx) =>
      createChannelWithIsland(tx as unknown as typeof prisma, {
        organizationId: user.activeOrganizationId!,
        agentId: input.agentId ?? null,
        // Selecionou agente na criação ⇒ já nasce mandando pra IA. Sem
        // agente ⇒ nasce só no atendimento humano (fila Default, ver acima).
        openAgent: !!input.agentId,
        phoneNumberId: input.phoneNumberId,
        displayNumber: input.displayNumber,
        wabaId: input.wabaId,
        metaAccessToken: input.metaAccessToken,
      }),
    );
  },

  async update(user: AuthUser, id: string, input: UpdateWhatsappChannelInput) {
    const existing = await this.getById(user, id);

    if (input.agentId) {
      await assertAgentBelongsToOrganization(input.agentId, user.activeOrganizationId!);
    }

    if (input.phoneNumberId) {
      const conflict = await prisma.whatsappChannel.findFirst({
        where: { id: { not: existing.id }, phoneNumberId: input.phoneNumberId },
        select: { id: true },
      });
      if (conflict) throw new ConflictError("Já existe um WhatsApp Channel com este Phone Number ID.");
    }

    const nextAgentId = input.agentId ?? existing.agentId;
    const nextOpenAgent = input.openAgent ?? existing.openAgent;
    if (nextOpenAgent && !nextAgentId) {
      throw new ValidationError("Não é possível ativar o agente para este canal sem um agente vinculado.");
    }

    if (input.idServiceIslandDefault) {
      await assertQueueBelongsToChannelIsland(input.idServiceIslandDefault, existing.id);
    }

    return prisma.whatsappChannel.update({
      where: { id: existing.id },
      data: {
        agentId: nextAgentId,
        openAgent: nextOpenAgent,
        idServiceIslandDefault:
          input.idServiceIslandDefault === undefined ? existing.idServiceIslandDefault : input.idServiceIslandDefault,
        phoneNumberId: input.phoneNumberId ?? existing.phoneNumberId,
        displayNumber: input.displayNumber ?? existing.displayNumber,
        wabaId: input.wabaId ?? existing.wabaId,
        // Campo em branco = não mexe no token salvo (não existe forma de
        // "limpar" o token por essa rota — só sobrescrever com um novo).
        metaAccessToken: input.metaAccessToken ?? existing.metaAccessToken,
      },
      include: { serviceIsland: true },
    });
  },

  /// Consulta a Graph API com o WABA ID informado e devolve todos os números
  /// cadastrados nele, marcando os que já viraram WhatsApp Channel em
  /// qualquer empresa (phoneNumberId é único na plataforma inteira).
  async lookupWaba(wabaId: string, accessToken: string) {
    const numbers = await listWabaPhoneNumbers(wabaId, accessToken);

    const existing = await prisma.whatsappChannel.findMany({
      where: { phoneNumberId: { in: numbers.map((n) => n.id) } },
      select: { phoneNumberId: true },
    });
    const existingIds = new Set(existing.map((e) => e.phoneNumberId));

    return numbers.map((n) => ({
      phoneNumberId: n.id,
      displayNumber: n.display_phone_number,
      verifiedName: n.verified_name,
      alreadyRegistered: existingIds.has(n.id),
    }));
  },

  /// Cadastra em lote os números que o usuário manteve na lista do modal de
  /// busca por WABA — ignora silenciosamente qualquer número que já tenha
  /// virado canal entre a busca e o clique em "Cadastrar" (corrida rara).
  async bulkCreate(user: AuthUser, input: BulkCreateWhatsappChannelInput) {
    if (input.agentId) {
      await assertAgentBelongsToOrganization(input.agentId, user.activeOrganizationId!);
    }

    const existing = await prisma.whatsappChannel.findMany({
      where: { phoneNumberId: { in: input.phoneNumbers.map((p) => p.phoneNumberId) } },
      select: { phoneNumberId: true },
    });
    const existingIds = new Set(existing.map((e) => e.phoneNumberId));
    const toCreate = input.phoneNumbers.filter((p) => !existingIds.has(p.phoneNumberId));
    const skipped = input.phoneNumbers.filter((p) => existingIds.has(p.phoneNumberId));

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const number of toCreate) {
        const result = await createChannelWithIsland(tx as unknown as typeof prisma, {
          organizationId: user.activeOrganizationId!,
          agentId: input.agentId ?? null,
          // Mesma regra do cadastro individual: só nasce mandando pra IA se
          // um agente foi selecionado na busca por WABA.
          openAgent: !!input.agentId,
          phoneNumberId: number.phoneNumberId,
          displayNumber: number.displayNumber,
          wabaId: input.wabaId,
          metaAccessToken: input.metaAccessToken,
        });
        results.push(result);
      }
      return results;
    });

    return { created, skipped };
  },

  /// Templates aprovados/ativos no WABA da Meta ligado a este canal, já com a
  /// contagem de variáveis por componente — usado na etapa de escolha de
  /// template do disparo de campanha.
  async listTemplates(user: AuthUser, id: string) {
    const channel = await this.getById(user, id);
    if (!channel.metaAccessToken) {
      throw new ValidationError("Este canal ainda não tem um token de acesso da Meta cadastrado.");
    }

    const templates = await listWabaTemplates(channel.wabaId, channel.metaAccessToken);

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      language: t.language,
      status: t.status,
      components: t.components,
      variableCount: getTemplateVariableCount(t.components),
    }));
  },

  /// Status/qualidade do número na Meta (tela de detalhe do canal) — consulta
  /// ao vivo, nunca cacheada, pra sempre refletir o estado atual.
  async getPhoneStatus(user: AuthUser, id: string) {
    const channel = await this.getById(user, id);
    if (!channel.metaAccessToken) {
      throw new ValidationError("Este canal ainda não tem um token de acesso da Meta cadastrado.");
    }

    return getPhoneNumberStatus(channel.phoneNumberId, channel.metaAccessToken);
  },

  /// Quantidade de MessagingSession (nossa definição de "conversa" — uma
  /// janela de atendimento aberta pelo cliente) na janela do range pedido,
  /// pra alimentar o gráfico "Fluxo de conversas" (Area Chart - Interactive)
  /// da tela de detalhe do canal. Sempre devolve todos os buckets do range,
  /// com 0 nos que não tiveram conversa nenhuma.
  async getConversationsSeries(user: AuthUser, id: string, range: SeriesRange) {
    const channel = await this.getById(user, id);
    const { start, end, granularity } = resolveSeriesRange(range);

    const sessions = await prisma.messagingSession.findMany({
      where: { whatsappChannelId: channel.id, startedAt: { gte: start, lt: end } },
      select: { startedAt: true },
    });

    const keyOf = granularity === "day" ? dayKey : monthKey;
    const counts = new Map<string, number>();
    for (const session of sessions) {
      const key = keyOf(session.startedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return {
      range,
      granularity,
      points: buildBucketKeys(start, end, granularity).map((date) => ({ date, count: counts.get(date) ?? 0 })),
    };
  },

  /// Volumetria de MENSAGENS (não de conversas — uma conversa pode ter várias
  /// mensagens) na janela do range pedido: quantas o canal recebeu (INBOUND,
  /// do cliente) e quantas enviou (OUTBOUND, IA/atendente/sistema/campanha).
  /// Alimenta o gráfico "Fluxo de mensagens". Agregado no Mongo (coleção
  /// compartilhada `messages`) em vez de trazer documento por documento, já
  /// que o volume de mensagens tende a ser bem maior que o de sessões.
  async getMessagesSeries(user: AuthUser, id: string, range: SeriesRange) {
    const channel = await this.getById(user, id);
    const { start, end, granularity } = resolveSeriesRange(range);
    const dateFormat = granularity === "day" ? "%Y-%m-%d" : "%Y-%m";

    const db = await getMongoDb();
    const rows = await db
      .collection<MessageDocument>(MESSAGES_COLLECTION)
      .aggregate<{ _id: { date: string; direction: "INBOUND" | "OUTBOUND" }; count: number }>([
        { $match: { whatsappChannelId: channel.id, createdAt: { $gte: start, $lt: end } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: dateFormat, date: "$createdAt", timezone: "UTC" } },
              direction: "$direction",
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const sentByKey = new Map<string, number>();
    const receivedByKey = new Map<string, number>();
    for (const row of rows) {
      if (row._id.direction === "OUTBOUND") sentByKey.set(row._id.date, row.count);
      else if (row._id.direction === "INBOUND") receivedByKey.set(row._id.date, row.count);
    }

    return {
      range,
      granularity,
      points: buildBucketKeys(start, end, granularity).map((date) => ({
        date,
        sent: sentByKey.get(date) ?? 0,
        received: receivedByKey.get(date) ?? 0,
      })),
    };
  },

  /// Alimenta o card "Gastos" do dashboard — quantidade de mensagens de
  /// campanha (disparo ativo) enviadas por categoria de template
  /// (Marketing/Utilidade/Autenticação). A Meta cobra valores diferentes por
  /// categoria, é a base pra estimar gasto. A contagem total de campanhas
  /// já existe (mais completa) na tela de Campanhas — não duplicar aqui.
  async getCampaignReport(user: AuthUser, id: string) {
    const channel = await this.getById(user, id);

    const byCategory = await prisma.campaign.groupBy({
      by: ["category"],
      where: { whatsappChannelId: channel.id },
      _count: { _all: true },
      _sum: { totalSent: true },
    });

    return {
      byCategory: byCategory.map((row) => ({
        category: row.category,
        campaignCount: row._count._all,
        messagesSent: row._sum.totalSent ?? 0,
      })),
    };
  },
};
