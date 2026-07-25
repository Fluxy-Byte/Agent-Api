import { NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { CreateQueueInput, UpdateQueueInput } from "./queue-validation";

async function assertServiceIslandBelongsToOrganization(serviceIslandId: string, organizationId: string) {
  const island = await prisma.serviceIsland.findFirst({
    where: { id: serviceIslandId, organizationId },
    select: { id: true },
  });
  if (!island) throw new NotFoundError("Ilha de atendimento não encontrada.");
}

async function assertUsersBelongToOrganization(userIds: string[], organizationId: string) {
  if (userIds.length === 0) return;
  const members = await prisma.member.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true },
  });
  const validIds = new Set(members.map((m) => m.userId));
  const invalid = userIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new ValidationError(`Usuário(s) fora desta empresa: ${invalid.join(", ")}`);
  }
}

async function syncQueueMembers(tx: typeof prisma, queueId: string, userIds: string[] | undefined) {
  if (userIds === undefined) return;

  await tx.queueMember.deleteMany({ where: { queueId, userId: { notIn: userIds.length ? userIds : ["__none__"] } } });

  for (const userId of userIds) {
    await tx.queueMember.upsert({
      where: { queueId_userId: { queueId, userId } },
      create: { queueId, userId },
      update: {},
    });
  }
}

export const queueService = {
  async list(user: AuthUser, serviceIslandId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    return prisma.queue.findMany({
      where: { serviceIslandId },
      include: { members: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(user: AuthUser, serviceIslandId: string, queueId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const queue = await prisma.queue.findFirst({
      where: { id: queueId, serviceIslandId },
      include: { members: { include: { user: true } } },
    });
    if (!queue) throw new NotFoundError("Fila não encontrada.");
    return queue;
  },

  async create(user: AuthUser, serviceIslandId: string, input: CreateQueueInput) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    if (input.memberUserIds) {
      await assertUsersBelongToOrganization(input.memberUserIds, user.activeOrganizationId!);
    }

    return prisma.$transaction(async (tx) => {
      const queue = await tx.queue.create({
        data: {
          serviceIslandId,
          name: input.name,
          isActive: input.isActive ?? true,
          businessHoursEnabled: input.businessHoursEnabled ?? false,
          businessHoursStart: input.businessHoursStart ?? null,
          businessHoursEnd: input.businessHoursEnd ?? null,
          businessDays: input.businessDays ?? [1, 2, 3, 4, 5],
        },
      });

      await syncQueueMembers(tx as unknown as typeof prisma, queue.id, input.memberUserIds);

      return tx.queue.findUniqueOrThrow({ where: { id: queue.id }, include: { members: { include: { user: true } } } });
    });
  },

  async update(user: AuthUser, serviceIslandId: string, queueId: string, input: UpdateQueueInput) {
    const existing = await this.getById(user, serviceIslandId, queueId);
    if (input.memberUserIds) {
      await assertUsersBelongToOrganization(input.memberUserIds, user.activeOrganizationId!);
    }

    return prisma.$transaction(async (tx) => {
      await tx.queue.update({
        where: { id: existing.id },
        data: {
          name: input.name ?? existing.name,
          isActive: input.isActive ?? existing.isActive,
          businessHoursEnabled: input.businessHoursEnabled ?? existing.businessHoursEnabled,
          businessHoursStart:
            input.businessHoursStart === undefined ? existing.businessHoursStart : input.businessHoursStart,
          businessHoursEnd: input.businessHoursEnd === undefined ? existing.businessHoursEnd : input.businessHoursEnd,
          businessDays: input.businessDays ?? existing.businessDays,
        },
      });

      await syncQueueMembers(tx as unknown as typeof prisma, existing.id, input.memberUserIds);

      return tx.queue.findUniqueOrThrow({
        where: { id: existing.id },
        include: { members: { include: { user: true } } },
      });
    });
  },
};
