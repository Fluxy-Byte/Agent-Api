import { NotFoundError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

type TicketStatusValue = "WAITING" | "IN_PROGRESS" | "CLOSED";

const TICKET_INCLUDE = {
  target: { select: { id: true, name: true, waId: true } },
  queue: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, name: true, email: true } },
  closeTag: { select: { id: true, name: true } },
} as const;

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
        queues: { include: { members: { include: { user: true } } } },
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
        queues: { include: { members: { include: { user: true } } } },
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
  /// Histórico (status=CLOSED) do Agent Console.
  async listTickets(
    user: AuthUser,
    islandId: string,
    options: { status?: TicketStatusValue[]; page?: number; pageSize?: number } = {},
  ) {
    await this.getById(user, islandId);

    const where = {
      queue: { serviceIslandId: islandId },
      organizationId: user.activeOrganizationId!,
      ...(options.status && options.status.length > 0 ? { status: { in: options.status } } : {}),
    };
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

  /// Painel "monitoramento em tempo real": contagem de tickets aguardando/em
  /// atendimento por fila, status dos atendentes (online/pausa/offline) e as
  /// listas de tickets ativos da ilha inteira (sem paginação — volume ativo é
  /// naturalmente pequeno, ao contrário do histórico).
  async getMonitoring(user: AuthUser, islandId: string) {
    const island = await this.getById(user, islandId);
    const queueIds = island.queues.map((q) => q.id);

    const [queueCounts, activeTickets, memberships] = await Promise.all([
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
        ? prisma.queueMember.findMany({ where: { queueId: { in: queueIds } }, select: { userId: true }, distinct: ["userId"] })
        : Promise.resolve([]),
    ]);

    const queues = island.queues.map((q) => ({
      queueId: q.id,
      queueName: q.name,
      waitingCount: queueCounts.find((c) => c.queueId === q.id && c.status === "WAITING")?._count._all ?? 0,
      inProgressCount: queueCounts.find((c) => c.queueId === q.id && c.status === "IN_PROGRESS")?._count._all ?? 0,
    }));

    const memberIds = memberships.map((m) => m.userId);
    const members =
      memberIds.length > 0
        ? await prisma.member.findMany({
            where: { organizationId: user.activeOrganizationId!, userId: { in: memberIds } },
            select: { status: true },
          })
        : [];

    const attendants = { online: 0, paused: 0, offline: 0, total: members.length };
    for (const m of members) {
      if (m.status === "ONLINE") attendants.online++;
      else if (m.status === "PAUSED") attendants.paused++;
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
