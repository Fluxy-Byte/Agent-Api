import type { Prisma } from "../../../generated/prisma/client";
import { NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { CreateQueueInput, UpdateQueueInput } from "./queue-validation";

interface QueueFilter {
  search?: string;
  isActive?: boolean;
}

function buildQueueWhere(serviceIslandId: string, filter: QueueFilter): Prisma.QueueWhereInput {
  return {
    serviceIslandId,
    // Fila soft-deleted nunca aparece pro usuário, em nenhuma listagem —
    // só continua existindo no banco pros tickets antigos dela.
    deletedAt: null,
    ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
    ...(filter.search ? { name: { contains: filter.search, mode: "insensitive" as const } } : {}),
  };
}

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
  async list(
    user: AuthUser,
    serviceIslandId: string,
    options: QueueFilter & { page?: number; pageSize?: number } = {},
  ) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 10;
    const where = buildQueueWhere(serviceIslandId, options);

    const [items, total] = await Promise.all([
      prisma.queue.findMany({
        where,
        include: { members: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.queue.count({ where }),
    ]);

    return { items, total, page, pageSize };
  },

  /// Contagens gerais da ilha (não são afetadas pelos filtros da lista) —
  /// total de filas, ativas e inativas.
  async getStats(user: AuthUser, serviceIslandId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);

    const [total, active] = await Promise.all([
      prisma.queue.count({ where: { serviceIslandId, deletedAt: null } }),
      prisma.queue.count({ where: { serviceIslandId, deletedAt: null, isActive: true } }),
    ]);

    return { total, active, inactive: total - active };
  },

  async getById(user: AuthUser, serviceIslandId: string, queueId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const queue = await prisma.queue.findFirst({
      where: { id: queueId, serviceIslandId, deletedAt: null },
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

  /// Ticket.queueId tem onDelete: Cascade — excluir de verdade uma fila com
  /// tickets apagaria esse histórico de atendimento junto. Por isso, fila com
  /// pelo menos 1 ticket (mesmo encerrado) leva soft delete (deletedAt) em
  /// vez de DELETE: a linha continua no banco pros tickets antigos, mas some
  /// de toda listagem (buildQueueWhere/getStats/getById já filtram
  /// deletedAt: null). Só fila nunca usada é excluída de verdade.
  async delete(user: AuthUser, serviceIslandId: string, queueId: string) {
    const existing = await this.getById(user, serviceIslandId, queueId);

    // Fila Default nasce junto com a ilha (ver whatsapp-channel-service.ts) e
    // pode estar vinculada como idServiceIslandDefault de algum canal —
    // nunca pode ser excluída, nem soft nem hard delete.
    if (existing.isDefault) {
      throw new ValidationError("A fila Default de uma ilha de atendimento não pode ser excluída.");
    }

    const ticketCount = await prisma.ticket.count({ where: { queueId: existing.id } });
    if (ticketCount > 0) {
      await prisma.$transaction([
        prisma.queue.update({ where: { id: existing.id }, data: { deletedAt: new Date() } }),
        // Sem isso, o agente continuaria roteando handoff pra uma fila que
        // sumiu da UI — ninguém veria os tickets caindo lá.
        prisma.agent.updateMany({ where: { defaultQueueId: existing.id }, data: { defaultQueueId: null } }),
      ]);
      return { ...existing, softDeleted: true as const };
    }

    await prisma.queue.delete({ where: { id: existing.id } });
    return { ...existing, softDeleted: false as const };
  },
};
