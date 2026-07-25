import type { Prisma } from "../../../generated/prisma/client";
import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import { NotFoundError } from "../../domain/errors/app-error";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { HistoryQuery, ListTargetsQuery } from "./target-validation";

export const targetService = {
  async list(user: AuthUser, query: ListTargetsQuery) {
    const where: Prisma.TargetWhereInput = {
      organizationId: user.activeOrganizationId!,
      ...(query.agentId ? { whatsappChannel: { agentId: query.agentId } } : {}),
      ...(query.name ? { name: { contains: query.name, mode: "insensitive" } } : {}),
      ...(query.phone ? { waId: { contains: query.phone } } : {}),
      ...(query.email ? { email: { contains: query.email, mode: "insensitive" } } : {}),
      ...(query.startDate || query.endDate
        ? {
            lastInteractionAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.target.findMany({
        where,
        include: { whatsappChannel: { include: { agent: true } } },
        orderBy: { lastInteractionAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.target.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  async getById(user: AuthUser, id: string) {
    const target = await prisma.target.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { whatsappChannel: { include: { agent: true } } },
    });
    if (!target) throw new NotFoundError("Contato não encontrado.");

    const tickets = await prisma.ticket.findMany({
      where: { targetId: target.id },
      include: { queue: true },
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
      .sort({ createdAt: 1 })
      .limit(query.limit)
      .toArray();

    return messages;
  },
};
