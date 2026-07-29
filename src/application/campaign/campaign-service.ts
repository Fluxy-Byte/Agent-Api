import { NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { sendCampaignToWorker } from "../../infrastructure/campaign-worker/campaign-worker-client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { CreateCampaignInput, ListCampaignsQuery } from "./campaign-validation";

async function resolveWhatsappChannel(id: string, organizationId: string) {
  const channel = await prisma.whatsappChannel.findFirst({
    where: { id, organizationId },
    include: { agent: true, serviceIsland: true },
  });
  if (!channel) throw new NotFoundError("WhatsApp Channel não encontrado.");
  if (!channel.serviceIsland) throw new NotFoundError("Ilha de atendimento do canal não encontrada.");
  return channel;
}

/// routeToQueueId precisa ser uma fila da ilha deste canal; routeToUserId
/// (se vier) precisa ser um atendente daquela fila especificamente — evita
/// atribuir a campanha a alguém sem acesso pra ver o ticket depois.
async function assertRouteToHumanIsValid(
  serviceIslandId: string,
  routeToQueueId: string | undefined,
  routeToUserId: string | undefined,
) {
  if (!routeToQueueId) {
    if (routeToUserId) throw new ValidationError("routeToUserId exige routeToQueueId.");
    return;
  }

  const queue = await prisma.queue.findFirst({ where: { id: routeToQueueId, serviceIslandId } });
  if (!queue) throw new ValidationError("Fila de destino inválida para este canal.");

  if (routeToUserId) {
    const member = await prisma.queueMember.findFirst({ where: { queueId: routeToQueueId, userId: routeToUserId } });
    if (!member) throw new ValidationError("O atendente selecionado não pertence a essa fila.");
  }
}

export const campaignService = {
  /// Cria a Campaign de forma síncrona (retorna o id na hora, já com quem
  /// disparou) e só então chama o Campaign-Worker, que enfileira o envio em
  /// massa. Se a chamada ao worker falhar, a campanha fica órfã em
  /// PROCESSING — mesmo comportamento de falha do app antigo.
  async create(user: AuthUser, input: CreateCampaignInput) {
    const channel = await resolveWhatsappChannel(input.whatsappChannelId, user.activeOrganizationId!);

    const contacts = input.contacts.map((c) => ({ ...c, email: c.email || undefined }));
    const semTelefone = contacts.some((c) => !c.phone);
    if (semTelefone) throw new ValidationError("Todo contato precisa ter telefone preenchido.");

    await assertRouteToHumanIsValid(channel.serviceIsland!.id, input.routeToQueueId, input.routeToUserId);

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: user.activeOrganizationId!,
        whatsappChannelId: channel.id,
        name: input.name,
        category: input.category,
        templateName: input.templateName,
        language: input.language,
        dispatchType: input.dispatchType,
        expectedContacts: contacts.length,
        createdByUserId: user.id,
        createdByName: user.name,
        createdByEmail: user.email,
        routeToQueueId: input.routeToQueueId,
        routeToUserId: input.routeToUserId,
      },
    });

    await sendCampaignToWorker({
      campaignId: campaign.id,
      organizationId: user.activeOrganizationId!,
      whatsappChannelId: channel.id,
      phoneNumberId: channel.phoneNumberId,
      wabaId: channel.wabaId,
      serviceIslandId: channel.serviceIsland!.id,
      agentId: channel.agent.id,
      agentName: channel.agent.name,
      templateName: input.templateName,
      language: input.language,
      category: input.category,
      templateHeaderText: input.templateHeaderText,
      templateBodyText: input.templateBodyText,
      contacts,
      routeToQueueId: input.routeToQueueId,
      routeToUserId: input.routeToUserId,
    });

    return this.toListItem(campaign, channel);
  },

  async list(user: AuthUser, query: ListCampaignsQuery) {
    const where = {
      organizationId: user.activeOrganizationId!,
      ...(query.whatsappChannelId ? { whatsappChannelId: query.whatsappChannelId } : {}),
      ...(query.agentId ? { whatsappChannel: { agentId: query.agentId } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: { whatsappChannel: { include: { agent: true } } },
        orderBy: { sentAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.campaign.count({ where }),
    ]);

    return {
      items: rows.map((c) => this.toListItem(c, c.whatsappChannel)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async getById(user: AuthUser, id: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { whatsappChannel: { include: { agent: true } } },
    });
    if (!campaign) throw new NotFoundError("Campanha não encontrada.");

    const targets = await prisma.campaignTarget.findMany({
      where: { campaignId: campaign.id },
      include: { target: { select: { name: true, waId: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      ...this.toListItem(campaign, campaign.whatsappChannel),
      targets: targets.map((t) => ({
        id: t.id,
        targetId: t.targetId,
        targetName: t.target.name,
        targetPhone: t.target.waId,
        status: t.status,
        messageId: t.messageId,
        variables: t.variables,
        createdAt: t.createdAt,
      })),
    };
  },

  toListItem(
    c: {
      id: string;
      name: string;
      category: string | null;
      templateName: string;
      status: string;
      dispatchType: string;
      expectedContacts: number;
      totalContacts: number;
      totalSent: number;
      totalFailures: number;
      whatsappChannelId: string;
      createdByName: string | null;
      createdByEmail: string | null;
      sentAt: Date;
    },
    channel: { displayNumber: string; agentId: string; agent: { name: string } },
  ) {
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      templateName: c.templateName,
      status: c.status,
      dispatchType: c.dispatchType,
      expectedContacts: c.expectedContacts,
      totalContacts: c.totalContacts,
      totalSent: c.totalSent,
      totalFailures: c.totalFailures,
      whatsappChannelId: c.whatsappChannelId,
      whatsappChannelDisplayNumber: channel.displayNumber,
      agentId: channel.agentId,
      agentName: channel.agent.name,
      createdByName: c.createdByName,
      createdByEmail: c.createdByEmail,
      sentAt: c.sentAt,
    };
  },
};
