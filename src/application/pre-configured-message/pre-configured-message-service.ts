import { Prisma } from "../../../generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { UpsertPreConfiguredMessageInput } from "./pre-configured-message-validation";

async function assertServiceIslandBelongsToOrganization(serviceIslandId: string, organizationId: string) {
  const island = await prisma.serviceIsland.findFirst({
    where: { id: serviceIslandId, organizationId },
    select: { id: true },
  });
  if (!island) throw new NotFoundError("Ilha de atendimento não encontrada.");
}

/// Garante que toda fila selecionada pertence de fato a esta ilha — evita
/// vincular a mensagem a uma fila de outra ilha/organização.
async function assertQueuesBelongToIsland(queueIds: string[], serviceIslandId: string) {
  const count = await prisma.queue.count({ where: { id: { in: queueIds }, serviceIslandId } });
  if (count !== queueIds.length) throw new ValidationError("Uma ou mais filas selecionadas são inválidas para esta ilha.");
}

const PRE_CONFIGURED_MESSAGE_INCLUDE = {
  queues: { select: { id: true, name: true } },
} as const;

export const preConfiguredMessageService = {
  async list(user: AuthUser, serviceIslandId: string, options: { page?: number; pageSize?: number } = {}) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 10;
    const where = { serviceIslandId };

    const [items, total] = await Promise.all([
      prisma.preConfiguredMessage.findMany({
        where,
        include: PRE_CONFIGURED_MESSAGE_INCLUDE,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.preConfiguredMessage.count({ where }),
    ]);

    return { items, total, page, pageSize };
  },

  async getById(user: AuthUser, serviceIslandId: string, messageId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const message = await prisma.preConfiguredMessage.findFirst({
      where: { id: messageId, serviceIslandId },
      include: PRE_CONFIGURED_MESSAGE_INCLUDE,
    });
    if (!message) throw new NotFoundError("Mensagem pré-configurada não encontrada.");
    return message;
  },

  async create(user: AuthUser, serviceIslandId: string, input: UpsertPreConfiguredMessageInput) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    await assertQueuesBelongToIsland(input.queueIds, serviceIslandId);

    try {
      return await prisma.preConfiguredMessage.create({
        data: {
          serviceIslandId,
          name: input.name,
          content: input.content,
          queues: { connect: input.queueIds.map((id) => ({ id })) },
        },
        include: PRE_CONFIGURED_MESSAGE_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Já existe uma mensagem com esse nome nesta ilha.");
      }
      throw error;
    }
  },

  async update(user: AuthUser, serviceIslandId: string, messageId: string, input: UpsertPreConfiguredMessageInput) {
    const existing = await this.getById(user, serviceIslandId, messageId);
    await assertQueuesBelongToIsland(input.queueIds, serviceIslandId);

    try {
      return await prisma.preConfiguredMessage.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          content: input.content,
          queues: { set: input.queueIds.map((id) => ({ id })) },
        },
        include: PRE_CONFIGURED_MESSAGE_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Já existe uma mensagem com esse nome nesta ilha.");
      }
      throw error;
    }
  },

  async remove(user: AuthUser, serviceIslandId: string, messageId: string) {
    const existing = await this.getById(user, serviceIslandId, messageId);
    await prisma.preConfiguredMessage.delete({ where: { id: existing.id } });
    return existing;
  },
};
