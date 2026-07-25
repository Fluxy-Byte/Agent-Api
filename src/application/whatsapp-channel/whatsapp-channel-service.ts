import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { CreateWhatsappChannelInput, UpdateWhatsappChannelInput } from "./whatsapp-channel-validation";

async function assertAgentBelongsToOrganization(agentId: string, organizationId: string): Promise<void> {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, organizationId }, select: { id: true } });
  if (!agent) throw new ValidationError("Agente inválido para esta empresa.");
}

export const whatsappChannelService = {
  async list(user: AuthUser) {
    return prisma.whatsappChannel.findMany({
      where: { organizationId: user.activeOrganizationId! },
      include: { serviceIsland: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(user: AuthUser, id: string) {
    const channel = await prisma.whatsappChannel.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { serviceIsland: true },
    });
    if (!channel) throw new NotFoundError("WhatsApp Channel não encontrado.");
    return channel;
  },

  /// Cada WhatsApp Channel tem, por regra, exatamente uma ilha de atendimento —
  /// criada automaticamente aqui, na mesma transação, para que nunca exista um
  /// canal sem ilha.
  async create(user: AuthUser, input: CreateWhatsappChannelInput) {
    await assertAgentBelongsToOrganization(input.agentId, user.activeOrganizationId!);

    const existing = await prisma.whatsappChannel.findFirst({
      where: { OR: [{ phoneNumberId: input.phoneNumberId }, { wabaId: input.wabaId }] },
      select: { id: true },
    });
    if (existing) throw new ConflictError("Já existe um WhatsApp Channel com este Phone Number ID ou WABA ID.");

    return prisma.$transaction(async (tx) => {
      const channel = await tx.whatsappChannel.create({
        data: {
          organizationId: user.activeOrganizationId!,
          agentId: input.agentId,
          phoneNumberId: input.phoneNumberId,
          displayNumber: input.displayNumber,
          wabaId: input.wabaId,
        },
      });

      const serviceIsland = await tx.serviceIsland.create({
        data: {
          organizationId: user.activeOrganizationId!,
          whatsappChannelId: channel.id,
          name: `Ilha de atendimento - ${input.displayNumber}`,
        },
      });

      return { ...channel, serviceIsland };
    });
  },

  async update(user: AuthUser, id: string, input: UpdateWhatsappChannelInput) {
    const existing = await this.getById(user, id);

    if (input.agentId) {
      await assertAgentBelongsToOrganization(input.agentId, user.activeOrganizationId!);
    }

    if (input.phoneNumberId || input.wabaId) {
      const conflict = await prisma.whatsappChannel.findFirst({
        where: {
          id: { not: existing.id },
          OR: [
            input.phoneNumberId ? { phoneNumberId: input.phoneNumberId } : undefined,
            input.wabaId ? { wabaId: input.wabaId } : undefined,
          ].filter(Boolean) as object[],
        },
        select: { id: true },
      });
      if (conflict) throw new ConflictError("Já existe um WhatsApp Channel com este Phone Number ID ou WABA ID.");
    }

    return prisma.whatsappChannel.update({
      where: { id: existing.id },
      data: {
        agentId: input.agentId ?? existing.agentId,
        phoneNumberId: input.phoneNumberId ?? existing.phoneNumberId,
        displayNumber: input.displayNumber ?? existing.displayNumber,
        wabaId: input.wabaId ?? existing.wabaId,
      },
      include: { serviceIsland: true },
    });
  },
};
