import { Prisma } from "../../../generated/prisma/client";
import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import { ConflictError, NotFoundError } from "../../domain/errors/app-error";
import { normalizeBrazilianWaId } from "../../domain/utils/phone";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { CreateTargetInput, HistoryQuery, ListTargetsFilter, ListTargetsQuery } from "./target-validation";

function buildTargetWhere(user: AuthUser, filter: ListTargetsFilter): Prisma.TargetWhereInput {
  return {
    organizationId: user.activeOrganizationId!,
    ...(filter.agentId ? { whatsappChannel: { agentId: filter.agentId } } : {}),
    ...(filter.name ? { name: { contains: filter.name, mode: "insensitive" } } : {}),
    ...(filter.phone ? { waId: { contains: filter.phone } } : {}),
    ...(filter.email ? { email: { contains: filter.email, mode: "insensitive" } } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.startDate || filter.endDate
      ? {
          lastInteractionAt: {
            ...(filter.startDate ? { gte: filter.startDate } : {}),
            ...(filter.endDate ? { lte: filter.endDate } : {}),
          },
        }
      : {}),
  };
}

export const targetService = {
  async list(user: AuthUser, query: ListTargetsQuery) {
    const where = buildTargetWhere(user, query);

    const [items, total] = await Promise.all([
      prisma.target.findMany({
        where,
        include: { whatsappChannel: { include: { agent: true } } },
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.target.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  /// Métricas da fileira de cards do topo da tela de Contatos — mesmos
  /// filtros de `list()` (sem paginação), sempre recalculadas na hora.
  async getStats(user: AuthUser, filter: ListTargetsFilter) {
    const where = buildTargetWhere(user, filter);
    const organizationId = user.activeOrganizationId!;

    const [total, active, lastInteraction, topChannel] = await Promise.all([
      prisma.target.count({ where }),
      prisma.target.count({ where: { ...where, status: { not: "FINISHED" } } }),
      prisma.target.findFirst({ where, orderBy: { lastInteractionAt: "desc" }, select: { lastInteractionAt: true } }),
      prisma.target.groupBy({
        by: ["whatsappChannelId"],
        where,
        _count: { _all: true },
        orderBy: { _count: { whatsappChannelId: "desc" } },
        take: 1,
      }),
    ]);

    let primaryAgentName: string | null = null;
    if (topChannel.length > 0) {
      const channel = await prisma.whatsappChannel.findUnique({
        where: { id: topChannel[0].whatsappChannelId },
        include: { agent: { select: { name: true } } },
      });
      primaryAgentName = channel?.agent.name ?? null;
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = await getMongoDb();
    const interactionsToday = await db
      .collection<MessageDocument>(MESSAGES_COLLECTION)
      .countDocuments({ organizationId, createdAt: { gte: since24h } });

    return {
      total,
      active,
      interactionsToday,
      lastInteractionAt: lastInteraction?.lastInteractionAt ?? null,
      primaryAgentName,
    };
  },

  /// Cadastro manual de contato (fora do fluxo normal, que é via webhook
  /// inbound ou disparo de campanha) — usado pelo botão "Novo contato".
  async create(user: AuthUser, input: CreateTargetInput) {
    const channel = await prisma.whatsappChannel.findFirst({
      where: { id: input.whatsappChannelId, organizationId: user.activeOrganizationId! },
    });
    if (!channel) throw new NotFoundError("WhatsApp Channel não encontrado.");

    try {
      return await prisma.target.create({
        data: {
          organizationId: user.activeOrganizationId!,
          whatsappChannelId: channel.id,
          waId: normalizeBrazilianWaId(input.phone),
          name: input.name || undefined,
          email: input.email || undefined,
        },
        include: { whatsappChannel: { include: { agent: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Já existe um contato com esse telefone neste canal.");
      }
      throw error;
    }
  },

  async getById(user: AuthUser, id: string) {
    const target = await prisma.target.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { whatsappChannel: { include: { agent: true } } },
    });
    if (!target) throw new NotFoundError("Contato não encontrado.");

    const tickets = await prisma.ticket.findMany({
      where: { targetId: target.id },
      include: {
        queue: { include: { serviceIsland: { select: { id: true, name: true } } } },
        assignedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { ...target, tickets };
  },

  /// Histórico de conversa, agrupável/filtrável por tipo de mensagem (Texto,
  /// Áudio, Figurinha, Documento, Foto) — conteúdo sempre lido do Mongo, nunca
  /// do Postgres.
  async getHistory(user: AuthUser, id: string, query: HistoryQuery) {
    await this.getById(user, id);

    const db = await getMongoDb();
    const filter: Record<string, unknown> = { targetId: id };
    if (query.messageType) filter.messageType = query.messageType;

    const messages = await db
      .collection<MessageDocument>(MESSAGES_COLLECTION)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .toArray();

    return messages.reverse();
  },
};
