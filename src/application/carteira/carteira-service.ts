import { NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { SetTargetCarteirasInput, UpsertCarteiraInput } from "./carteira-validation";

async function assertServiceIslandBelongsToOrganization(serviceIslandId: string, organizationId: string) {
  const island = await prisma.serviceIsland.findFirst({
    where: { id: serviceIslandId, organizationId },
    select: { id: true },
  });
  if (!island) throw new NotFoundError("Ilha de atendimento não encontrada.");
}

/// Só fila desta ilha, não excluída e com carteiraEnabled pode receber carteira.
async function assertQueueAcceptsCarteira(queueId: string, serviceIslandId: string) {
  const queue = await prisma.queue.findFirst({
    where: { id: queueId, serviceIslandId, deletedAt: null },
    select: { carteiraEnabled: true },
  });
  if (!queue) throw new ValidationError("Fila inválida para esta ilha.");
  if (!queue.carteiraEnabled) throw new ValidationError("Esta fila não está liberada para carteira.");
}

/// targetIds pode ter milhares de ids — a listagem devolve só a contagem.
function toListItem<T extends { targetIds: string[] }>({ targetIds, ...carteira }: T) {
  return { ...carteira, targetCount: targetIds.length };
}

const CARTEIRA_QUEUE_SELECT = { select: { id: true, name: true, carteiraEnabled: true } } as const;

export const carteiraService = {
  async list(user: AuthUser, serviceIslandId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const carteiras = await prisma.carteira.findMany({
      where: { queue: { serviceIslandId, deletedAt: null } },
      include: { queue: CARTEIRA_QUEUE_SELECT },
      orderBy: { createdAt: "asc" },
    });
    return carteiras.map(toListItem);
  },

  async getById(user: AuthUser, serviceIslandId: string, carteiraId: string) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    const carteira = await prisma.carteira.findFirst({
      where: { id: carteiraId, queue: { serviceIslandId } },
      include: { queue: CARTEIRA_QUEUE_SELECT },
    });
    if (!carteira) throw new NotFoundError("Carteira não encontrada.");
    return toListItem(carteira);
  },

  async create(user: AuthUser, serviceIslandId: string, input: UpsertCarteiraInput) {
    await assertServiceIslandBelongsToOrganization(serviceIslandId, user.activeOrganizationId!);
    await assertQueueAcceptsCarteira(input.queueId, serviceIslandId);

    const carteira = await prisma.carteira.create({
      data: { name: input.name, queueId: input.queueId },
      include: { queue: CARTEIRA_QUEUE_SELECT },
    });
    return toListItem(carteira);
  },

  async update(user: AuthUser, serviceIslandId: string, carteiraId: string, input: UpsertCarteiraInput) {
    const existing = await this.getById(user, serviceIslandId, carteiraId);
    // Mantém a fila atual mesmo se ela tiver sido desliberada depois — só
    // trocar pra outra fila exige que a nova esteja liberada.
    if (input.queueId !== existing.queueId) await assertQueueAcceptsCarteira(input.queueId, serviceIslandId);

    const carteira = await prisma.carteira.update({
      where: { id: existing.id },
      data: { name: input.name, queueId: input.queueId },
      include: { queue: CARTEIRA_QUEUE_SELECT },
    });
    return toListItem(carteira);
  },

  async remove(user: AuthUser, serviceIslandId: string, carteiraId: string) {
    const existing = await this.getById(user, serviceIslandId, carteiraId);
    await prisma.carteira.delete({ where: { id: existing.id } });
    return existing;
  },

  /// Todas as carteiras da empresa (de qualquer ilha), marcando as que já
  /// contêm o contato — alimenta o modal de checkboxes da tela do contato.
  async listForTarget(user: AuthUser, targetId: string) {
    const organizationId = user.activeOrganizationId!;
    const target = await prisma.target.findFirst({ where: { id: targetId, organizationId }, select: { id: true } });
    if (!target) throw new NotFoundError("Contato não encontrado.");

    const carteiras = await prisma.carteira.findMany({
      where: { queue: { deletedAt: null, serviceIsland: { organizationId } } },
      select: {
        id: true,
        name: true,
        targetIds: true,
        queue: { select: { id: true, name: true, serviceIsland: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    return carteiras.map(({ targetIds, ...carteira }) => ({ ...carteira, checked: targetIds.includes(target.id) }));
  },

  async setForTarget(user: AuthUser, targetId: string, input: SetTargetCarteirasInput) {
    const carteiras = await this.listForTarget(user, targetId);
    const validIds = new Set(carteiras.map((c) => c.id));
    const invalid = input.carteiraIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) throw new ValidationError("Uma ou mais carteiras selecionadas são inválidas.");

    const wanted = new Set(input.carteiraIds);
    const toAdd = carteiras.filter((c) => wanted.has(c.id) && !c.checked).map((c) => c.id);
    const toRemove = carteiras.filter((c) => !wanted.has(c.id) && c.checked).map((c) => c.id);

    // array_append/array_remove direto no banco: não sobrescreve o array
    // inteiro, então não perde contato adicionado em paralelo por outra pessoa.
    await prisma.$transaction([
      ...(toAdd.length > 0
        ? [
            prisma.$executeRaw`
              UPDATE "Carteira" SET "targetIds" = array_append("targetIds", ${targetId}), "updatedAt" = now()
              WHERE id = ANY(${toAdd}::text[]) AND NOT (${targetId} = ANY("targetIds"))
            `,
          ]
        : []),
      ...(toRemove.length > 0
        ? [
            prisma.$executeRaw`
              UPDATE "Carteira" SET "targetIds" = array_remove("targetIds", ${targetId}), "updatedAt" = now()
              WHERE id = ANY(${toRemove}::text[])
            `,
          ]
        : []),
    ]);

    return this.listForTarget(user, targetId);
  },
};
