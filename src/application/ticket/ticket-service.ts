import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

const TICKET_INCLUDE = {
  target: { select: { id: true, name: true, waId: true, email: true, metadata: true } },
  queue: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, name: true, email: true } },
  closeTag: { select: { id: true, name: true } },
  messagingSession: { select: { id: true, lastCustomerMessageAt: true } },
} as const;

export const ticketService = {
  /// Ticket + conversa completa (Mongo, por messagingSessionId, sem limite —
  /// é 1 ticket só) — usado pelo Dialog de detalhe do ticket na aba de
  /// Histórico da Ilha de Atendimento (Agent Console).
  async getById(user: AuthUser, id: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: TICKET_INCLUDE,
    });
    if (!ticket) throw new NotFoundError("Ticket não encontrado.");

    const db = await getMongoDb();
    const history = await db
      .collection<MessageDocument>(MESSAGES_COLLECTION)
      .find({ messagingSessionId: ticket.messagingSessionId })
      .sort({ createdAt: 1 })
      .toArray();

    return {
      ...ticket,
      waitDurationMs: ticket.assignedAt ? ticket.assignedAt.getTime() - ticket.createdAt.getTime() : null,
      handlingDurationMs:
        ticket.assignedAt && ticket.closedAt ? ticket.closedAt.getTime() - ticket.assignedAt.getTime() : null,
      history,
    };
  },

  /// Reabre um ticket encerrado — mesmo id, mesmo atendente, mesma fila (não
  /// cria um novo). Só permitido dentro da janela de 24h da última mensagem
  /// do cliente (mesma regra de sessão usada em toda a plataforma) e se não
  /// existir outro ticket já aberto pra essa mesma conversa.
  async reopen(user: AuthUser, id: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { messagingSession: { select: { id: true, lastCustomerMessageAt: true } } },
    });
    if (!ticket) throw new NotFoundError("Ticket não encontrado.");
    if (ticket.status !== "CLOSED") throw new ValidationError("Só é possível reabrir um ticket encerrado.");

    const elapsed = Date.now() - ticket.messagingSession.lastCustomerMessageAt.getTime();
    if (elapsed > SESSION_WINDOW_MS) {
      throw new ValidationError("A janela de 24h da conversa expirou — não é possível reabrir este ticket.");
    }

    const conflicting = await prisma.ticket.findFirst({
      where: { messagingSessionId: ticket.messagingSessionId, status: { not: "CLOSED" }, id: { not: ticket.id } },
    });
    if (conflicting) {
      throw new ConflictError("Já existe um ticket aberto para esta conversa — não é possível reabrir outro.");
    }

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: "IN_PROGRESS", closedAt: null, closeReason: null, closeTagId: null },
      }),
      prisma.target.update({ where: { id: ticket.targetId }, data: { status: "HUMAN" } }),
    ]);

    return this.getById(user, id);
  },
};
