import { NotFoundError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

export const serviceIslandService = {
  async list(user: AuthUser) {
    return prisma.serviceIsland.findMany({
      where: { organizationId: user.activeOrganizationId! },
      include: { whatsappChannel: true, queues: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(user: AuthUser, id: string) {
    const island = await prisma.serviceIsland.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { whatsappChannel: true, queues: { include: { members: { include: { user: true } } } } },
    });
    if (!island) throw new NotFoundError("Ilha de atendimento não encontrada.");
    return island;
  },

  async rename(user: AuthUser, id: string, name: string) {
    await this.getById(user, id);
    return prisma.serviceIsland.update({ where: { id }, data: { name } });
  },
};
