import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import { listWabaPhoneNumbers } from "../../infrastructure/meta/meta-graph-client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type {
  BulkCreateWhatsappChannelInput,
  CreateWhatsappChannelInput,
  UpdateWhatsappChannelInput,
} from "./whatsapp-channel-validation";

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
      where: { phoneNumberId: input.phoneNumberId },
      select: { id: true },
    });
    if (existing) throw new ConflictError("Já existe um WhatsApp Channel com este Phone Number ID.");

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

    if (input.phoneNumberId) {
      const conflict = await prisma.whatsappChannel.findFirst({
        where: { id: { not: existing.id }, phoneNumberId: input.phoneNumberId },
        select: { id: true },
      });
      if (conflict) throw new ConflictError("Já existe um WhatsApp Channel com este Phone Number ID.");
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

  /// Consulta a Graph API com o WABA ID informado e devolve todos os números
  /// cadastrados nele, marcando os que já viraram WhatsApp Channel em
  /// qualquer empresa (phoneNumberId é único na plataforma inteira).
  async lookupWaba(wabaId: string) {
    const numbers = await listWabaPhoneNumbers(wabaId);

    const existing = await prisma.whatsappChannel.findMany({
      where: { phoneNumberId: { in: numbers.map((n) => n.id) } },
      select: { phoneNumberId: true },
    });
    const existingIds = new Set(existing.map((e) => e.phoneNumberId));

    return numbers.map((n) => ({
      phoneNumberId: n.id,
      displayNumber: n.display_phone_number,
      verifiedName: n.verified_name,
      alreadyRegistered: existingIds.has(n.id),
    }));
  },

  /// Cadastra em lote os números que o usuário manteve na lista do modal de
  /// busca por WABA — ignora silenciosamente qualquer número que já tenha
  /// virado canal entre a busca e o clique em "Cadastrar" (corrida rara).
  async bulkCreate(user: AuthUser, input: BulkCreateWhatsappChannelInput) {
    await assertAgentBelongsToOrganization(input.agentId, user.activeOrganizationId!);

    const existing = await prisma.whatsappChannel.findMany({
      where: { phoneNumberId: { in: input.phoneNumbers.map((p) => p.phoneNumberId) } },
      select: { phoneNumberId: true },
    });
    const existingIds = new Set(existing.map((e) => e.phoneNumberId));
    const toCreate = input.phoneNumbers.filter((p) => !existingIds.has(p.phoneNumberId));
    const skipped = input.phoneNumbers.filter((p) => existingIds.has(p.phoneNumberId));

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const number of toCreate) {
        const channel = await tx.whatsappChannel.create({
          data: {
            organizationId: user.activeOrganizationId!,
            agentId: input.agentId,
            phoneNumberId: number.phoneNumberId,
            displayNumber: number.displayNumber,
            wabaId: input.wabaId,
          },
        });

        const serviceIsland = await tx.serviceIsland.create({
          data: {
            organizationId: user.activeOrganizationId!,
            whatsappChannelId: channel.id,
            name: `Ilha de atendimento - ${number.displayNumber}`,
          },
        });

        results.push({ ...channel, serviceIsland });
      }
      return results;
    });

    return { created, skipped };
  },
};
