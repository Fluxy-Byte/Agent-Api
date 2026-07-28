import { NotFoundError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

export const serviceIslandService = {
  async list(user: AuthUser) {
    return prisma.serviceIsland.findMany({
      where: { organizationId: user.activeOrganizationId! },
      include: { whatsappChannel: true, queues: true, closeTags: true },
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

  async rename(user: AuthUser, id: string, name: string, requireCloseTag?: boolean) {
    await this.getById(user, id);
    return prisma.serviceIsland.update({
      where: { id },
      data: { name, ...(requireCloseTag === undefined ? {} : { requireCloseTag }) },
    });
  },

  /// Tickets de todas as filas desta ilha — usado na tela da ilha pra listar
  /// todo o atendimento humano que passou por ela, sem precisar entrar
  /// fila por fila.
  async listTickets(user: AuthUser, islandId: string) {
    await this.getById(user, islandId);

    return prisma.ticket.findMany({
      where: { queue: { serviceIslandId: islandId }, organizationId: user.activeOrganizationId! },
      include: {
        target: { select: { id: true, name: true, waId: true } },
        queue: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true, email: true } },
        closeTag: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};
