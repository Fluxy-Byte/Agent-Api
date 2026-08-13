import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import { NotFoundError } from "../../domain/errors/app-error";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

export const ticketService = {
  /// Ticket + conversa completa (Mongo, por messagingSessionId, sem limite —
  /// é 1 ticket só) — usado pelo Dialog de detalhe do ticket na aba de
  /// Histórico da Ilha de Atendimento (Agent Console).
  async getById(user: AuthUser, id: string) {
    const ticket = await prisma.ticket.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: {
        target: { select: { id: true, name: true, waId: true, email: true, metadata: true } },
        queue: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true, email: true } },
        closeTag: { select: { id: true, name: true } },
      },
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
};
