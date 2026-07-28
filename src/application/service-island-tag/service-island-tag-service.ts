import { Prisma } from "../../../generated/prisma/client";
import { ConflictError, NotFoundError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { UpsertServiceIslandTagInput } from "./service-island-tag-validation";

async function assertServiceIslandBelongsToOrganization(serviceIslandId: string, organizationId: string) {
  const island = await prisma.serviceIsland.findFirst({
    where: { id: serviceIslandId, organizationId },
    select: { id: true },
  });
  if (!island) throw new NotFoundError("Ilha de atendimento não encontrada.");
}

export const serviceIslandTagService = {
  async list(user: AuthUser, serviceIslandId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    return prisma.ticketCloseTag.findMany({
      where: { serviceIslandId },
      orderBy: { createdAt: "asc" },
    });
  },

  async getById(user: AuthUser, serviceIslandId: string, tagId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const tag = await prisma.ticketCloseTag.findFirst({ where: { id: tagId, serviceIslandId } });
    if (!tag) throw new NotFoundError("Tag de fechamento não encontrada.");
    return tag;
  },

  async create(user: AuthUser, serviceIslandId: string, input: UpsertServiceIslandTagInput) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    try {
      return await prisma.ticketCloseTag.create({ data: { serviceIslandId, name: input.name } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Já existe uma tag com esse nome nesta ilha.");
      }
      throw error;
    }
  },

  async update(user: AuthUser, serviceIslandId: string, tagId: string, input: UpsertServiceIslandTagInput) {
    const existing = await this.getById(user, serviceIslandId, tagId);
    try {
      return await prisma.ticketCloseTag.update({ where: { id: existing.id }, data: { name: input.name } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Já existe uma tag com esse nome nesta ilha.");
      }
      throw error;
    }
  },

  async remove(user: AuthUser, serviceIslandId: string, tagId: string) {
    const existing = await this.getById(user, serviceIslandId, tagId);
    await prisma.ticketCloseTag.delete({ where: { id: existing.id } });
    return existing;
  },
};
