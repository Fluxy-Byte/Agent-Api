import type { Prisma } from "../../../generated/prisma/client";
import { NotFoundError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

type TicketStatusValue = "WAITING" | "IN_PROGRESS" | "CLOSED";
type TicketOutcome = "CONCLUDED" | "CANCELED";

/// "Concluído"/"Cancelado" não existem como status no schema — só CLOSED com
/// um closeReason. Mapeamento combinado com o usuário: RESOLVED/transferências
/// tiveram desfecho real (Concluído); ABANDONED/SESSION_EXPIRED encerraram
/// sem resolução (Cancelado).
const CONCLUDED_REASONS = ["RESOLVED", "TRANSFERRED_QUEUE", "TRANSFERRED_AGENT"] as const;
const CANCELED_REASONS = ["ABANDONED", "SESSION_EXPIRED"] as const;

const TICKET_INCLUDE = {
  target: { select: { id: true, name: true, waId: true } },
  queue: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, name: true, email: true } },
  closeTag: { select: { id: true, name: true } },
} as const;

interface TicketFilter {
  status?: TicketStatusValue[];
  search?: string;
  queueId?: string;
  assignedUserId?: string;
  closeTagId?: string;
  outcome?: TicketOutcome;
  startDate?: Date;
  endDate?: Date;
}

function buildTicketWhere(user: AuthUser, islandId: string, filter: TicketFilter): Prisma.TicketWhereInput {
  const searchNumber = filter.search ? Number(filter.search.replace(/^#/, "")) : NaN;

  return {
    queue: filter.queueId ? { id: filter.queueId, serviceIslandId: islandId } : { serviceIslandId: islandId },
    organizationId: user.activeOrganizationId!,
    ...(filter.status && filter.status.length > 0 ? { status: { in: filter.status } } : {}),
    ...(filter.assignedUserId ? { assignedUserId: filter.assignedUserId } : {}),
    ...(filter.closeTagId ? { closeTagId: filter.closeTagId } : {}),
    ...(filter.outcome
      ? {
          status: "CLOSED" as const,
          closeReason: { in: filter.outcome === "CONCLUDED" ? [...CONCLUDED_REASONS] : [...CANCELED_REASONS] },
        }
      : {}),
    ...(filter.startDate || filter.endDate
      ? {
          createdAt: {
            ...(filter.startDate ? { gte: filter.startDate } : {}),
            ...(filter.endDate ? { lte: filter.endDate } : {}),
          },
        }
      : {}),
    ...(filter.search
      ? {
          OR: [
            ...(Number.isFinite(searchNumber) ? [{ ticketNumber: searchNumber }] : []),
            { target: { name: { contains: filter.search, mode: "insensitive" as const } } },
            { target: { waId: { contains: filter.search } } },
            { assignedUser: { name: { contains: filter.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

/// Tempo de espera (criação até o atendente assumir) e duração do atendimento
/// (assumiu até fechou) — sempre calculado na resposta, nunca persistido.
function withDurations<T extends { createdAt: Date; assignedAt: Date | null; closedAt: Date | null }>(ticket: T) {
  return {
    ...ticket,
    waitDurationMs: ticket.assignedAt ? ticket.assignedAt.getTime() - ticket.createdAt.getTime() : null,
    handlingDurationMs:
      ticket.assignedAt && ticket.closedAt ? ticket.closedAt.getTime() - ticket.assignedAt.getTime() : null,
  };
}

export const serviceIslandService = {
  async list(user: AuthUser) {
    return prisma.serviceIsland.findMany({
      where: { organizationId: user.activeOrganizationId! },
      include: {
        whatsappChannel: true,
        queues: { where: { deletedAt: null }, include: { members: { include: { user: true } } } },
        closeTags: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(user: AuthUser, id: string) {
    const island = await prisma.serviceIsland.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: {
        whatsappChannel: true,
        queues: { where: { deletedAt: null }, include: { members: { include: { user: true } } } },
        closeTags: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!island) throw new NotFoundError("Ilha de atendimento não encontrada.");
    return island;
  },

  async rename(
    user: AuthUser,
    id: string,
    name: string,
    requireCloseTag?: boolean,
    allowActiveDispatch?: boolean,
  ) {
    await this.getById(user, id);
    return prisma.serviceIsland.update({
      where: { id },
      data: {
        name,
        ...(requireCloseTag === undefined ? {} : { requireCloseTag }),
        ...(allowActiveDispatch === undefined ? {} : { allowActiveDispatch }),
      },
    });
  },

  /// Tickets de todas as filas desta ilha, paginado — usado pela aba de
  /// Histórico do Agent Console. Sem `status`/`outcome` = todos os status.
  async listTickets(
    user: AuthUser,
    islandId: string,
    options: TicketFilter & { page?: number; pageSize?: number } = {},
  ) {
    await this.getById(user, islandId);

    const where = buildTicketWhere(user, islandId, options);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 10;

    const [rows, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: TICKET_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ]);

    return { items: rows.map(withDurations), total, page, pageSize };
  },

  /// Métricas dos 4 cards do topo da aba Histórico — mesmos filtros de
  /// `listTickets` (sem paginação).
  async getTicketStats(user: AuthUser, islandId: string, filter: TicketFilter = {}) {
    await this.getById(user, islandId);
    const where = buildTicketWhere(user, islandId, filter);

    const [total, concluded, canceled, inProgress] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: "CLOSED", closeReason: { in: [...CONCLUDED_REASONS] } } }),
      prisma.ticket.count({ where: { ...where, status: "CLOSED", closeReason: { in: [...CANCELED_REASONS] } } }),
      prisma.ticket.count({ where: { ...where, status: { in: ["WAITING", "IN_PROGRESS"] } } }),
    ]);

    return { total, concluded, canceled, inProgress };
  },

  /// Painel "monitoramento em tempo real": contagem de tickets aguardando/em
  /// atendimento por fila, status dos atendentes (online/pausa/offline) e as
  /// listas de tickets ativos da ilha inteira (sem paginação — volume ativo é
  /// naturalmente pequeno, ao contrário do histórico).
  async getMonitoring(user: AuthUser, islandId: string) {
    const island = await this.getById(user, islandId);
    const queueIds = island.queues.map((q) => q.id);

    const [queueCounts, activeTickets, queueMemberRows] = await Promise.all([
      queueIds.length > 0
        ? prisma.ticket.groupBy({
            by: ["queueId", "status"],
            where: { queueId: { in: queueIds }, status: { in: ["WAITING", "IN_PROGRESS"] } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      queueIds.length > 0
        ? prisma.ticket.findMany({
            where: { queueId: { in: queueIds }, status: { in: ["WAITING", "IN_PROGRESS"] } },
            include: TICKET_INCLUDE,
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      queueIds.length > 0
        ? prisma.queueMember.findMany({
            where: { queueId: { in: queueIds } },
            include: { user: { select: { id: true, name: true, email: true } }, queue: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
    ]);

    const queues = island.queues.map((q) => ({
      queueId: q.id,
      queueName: q.name,
      waitingCount: queueCounts.find((c) => c.queueId === q.id && c.status === "WAITING")?._count._all ?? 0,
      inProgressCount: queueCounts.find((c) => c.queueId === q.id && c.status === "IN_PROGRESS")?._count._all ?? 0,
    }));

    // 1 linha por atendente distinto — "fila" mostrada é a primeira em que ele
    // é membro dentro desta ilha (pode estar em mais de uma).
    const uniqueUserIds = Array.from(new Set(queueMemberRows.map((m) => m.userId)));

    const [memberRows, ticketCounts] = await Promise.all([
      uniqueUserIds.length > 0
        ? prisma.member.findMany({
            where: { organizationId: user.activeOrganizationId!, userId: { in: uniqueUserIds } },
            select: { userId: true, status: true, statusUpdatedAt: true },
          })
        : Promise.resolve([]),
      uniqueUserIds.length > 0
        ? prisma.ticket.groupBy({
            by: ["assignedUserId"],
            where: { assignedUserId: { in: uniqueUserIds }, status: "IN_PROGRESS", queueId: { in: queueIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const memberByUserId = new Map(memberRows.map((m) => [m.userId, m]));
    const ticketCountByUserId = new Map(ticketCounts.map((t) => [t.assignedUserId, t._count._all]));

    const attendantList = uniqueUserIds.map((userId) => {
      const first = queueMemberRows.find((m) => m.userId === userId)!;
      const memberInfo = memberByUserId.get(userId);
      return {
        userId,
        name: first.user.name,
        email: first.user.email,
        queueName: first.queue.name,
        status: memberInfo?.status ?? "OFFLINE",
        statusUpdatedAt: memberInfo?.statusUpdatedAt ?? null,
        ticketCount: ticketCountByUserId.get(userId) ?? 0,
      };
    });

    const attendants = { online: 0, paused: 0, offline: 0, total: attendantList.length, list: attendantList };
    for (const a of attendantList) {
      if (a.status === "ONLINE") attendants.online++;
      else if (a.status === "PAUSED") attendants.paused++;
      else attendants.offline++;
    }

    return {
      queues,
      attendants,
      waitingTickets: activeTickets.filter((t) => t.status === "WAITING"),
      inProgressTickets: activeTickets.filter((t) => t.status === "IN_PROGRESS"),
    };
  },
};
