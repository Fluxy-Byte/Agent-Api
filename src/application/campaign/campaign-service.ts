import { NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { sendCampaignToWorker } from "../../infrastructure/campaign-worker/campaign-worker-client";
import { prisma } from "../../infrastructure/database/prisma/client";
import { listWabaTemplates } from "../../infrastructure/meta/meta-graph-client";
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

interface DispatchTemplateParameter {
  type: string;
  text: string;
}

export interface DispatchContactInput {
  phone: string;
  name?: string;
  email?: string;
  /// Qualquer campo do contato que não seja telefone/nome/email vira metadado
  /// livre — mergeado em Target.metadata pelo Campaign-Worker (nunca apaga o
  /// que já existia).
  metadata?: Record<string, string>;
  parametersHeader?: DispatchTemplateParameter[];
  parametersBody?: DispatchTemplateParameter[];
  parametersButton?: DispatchTemplateParameter[];
  buttonSubType?: string;
}

export interface DispatchInput {
  organizationId: string;
  whatsappChannelId: string;
  campaignName: string;
  templateName: string;
  /// category/language são opcionais — se não vierem (caso do disparo padronizado,
  /// que só conhece o nome do template), são resolvidos consultando a Meta.
  category?: string;
  language?: string;
  dispatchType?: "CSV" | "MANUAL";
  templateHeaderText?: string;
  templateBodyText?: string;
  routeToQueueId?: string;
  routeToUserId?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdByEmail?: string;
  /// Usado pelo disparo ativo do Desk — suprime a transferMessage genérica do
  /// agente quando o ticket nasce a partir desse disparo.
  skipTransferMessage?: boolean;
  contacts: DispatchContactInput[];
}

export const campaignService = {
  /// Ponto único de disparo ativo de template — usado pelo fluxo de sessão
  /// (create, abaixo), pela integração da Metrópole (triggerSystemCampaign,
  /// abaixo) e pela rota /internal/campaigns/dispatch (chamável por qualquer
  /// serviço confiável, incluindo a futura API externa e o disparo pelo Desk).
  /// Cria a Campaign de forma síncrona e só então chama o Campaign-Worker, que
  /// enfileira o envio em massa. Se a chamada ao worker falhar, a campanha fica
  /// órfã em PROCESSING — mesmo comportamento de falha do app antigo.
  async dispatch(params: DispatchInput) {
    const channel = await resolveWhatsappChannel(params.whatsappChannelId, params.organizationId);

    const semTelefone = params.contacts.some((c) => !c.phone);
    if (semTelefone) throw new ValidationError("Todo contato precisa ter telefone preenchido.");

    await assertRouteToHumanIsValid(channel.serviceIsland!.id, params.routeToQueueId, params.routeToUserId);

    let { category, language } = params;
    if (!category || !language) {
      if (!channel.metaAccessToken) {
        throw new ValidationError("Este canal ainda não tem um token de acesso da Meta cadastrado.");
      }

      const templates = await listWabaTemplates(channel.wabaId, channel.metaAccessToken);
      const matches = templates.filter(
        (t) => t.name === params.templateName && t.status === "APPROVED" && (!language || t.language === language),
      );

      if (matches.length === 0) {
        throw new ValidationError(
          `Nenhum template aprovado chamado "${params.templateName}" foi encontrado neste canal${language ? ` no idioma ${language}` : ""}.`,
        );
      }
      if (matches.length > 1) {
        throw new ValidationError(
          `Existem ${matches.length} templates aprovados chamados "${params.templateName}" em idiomas diferentes — informe "language" para desambiguar.`,
        );
      }

      category = category ?? matches[0].category;
      language = language ?? matches[0].language;
    }

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: params.organizationId,
        whatsappChannelId: channel.id,
        name: params.campaignName,
        category,
        templateName: params.templateName,
        language,
        dispatchType: params.dispatchType ?? "MANUAL",
        expectedContacts: params.contacts.length,
        createdByUserId: params.createdByUserId,
        createdByName: params.createdByName,
        createdByEmail: params.createdByEmail,
        routeToQueueId: params.routeToQueueId,
        routeToUserId: params.routeToUserId,
      },
    });

    await sendCampaignToWorker({
      campaignId: campaign.id,
      organizationId: params.organizationId,
      whatsappChannelId: channel.id,
      phoneNumberId: channel.phoneNumberId,
      wabaId: channel.wabaId,
      serviceIslandId: channel.serviceIsland!.id,
      agentId: channel.agent.id,
      agentName: channel.agent.name,
      templateName: params.templateName,
      language,
      category,
      templateHeaderText: params.templateHeaderText,
      templateBodyText: params.templateBodyText,
      contacts: params.contacts,
      routeToQueueId: params.routeToQueueId,
      routeToUserId: params.routeToUserId,
      skipTransferMessage: params.skipTransferMessage,
    });

    return this.toListItem(campaign, channel);
  },

  /// Disparo de campanha sem sessão de usuário (chamado via /internal/*, ex:
  /// a Metrópole avisando um novo cadastro) — sempre dispara pra 1 único
  /// contato, resolve o canal só pelo id (o caller já é confiável, autenticado
  /// por x-internal-api-key) em vez de por organizationId de uma sessão.
  async triggerSystemCampaign(input: {
    whatsappChannelId: string;
    phone: string;
    name: string;
    templateName: string;
    language: string;
    category: string;
    createdByName?: string;
  }) {
    const channel = await prisma.whatsappChannel.findUnique({ where: { id: input.whatsappChannelId } });
    if (!channel) throw new NotFoundError("WhatsApp Channel configurado para a Metrópole não encontrado.");

    return this.dispatch({
      organizationId: channel.organizationId,
      whatsappChannelId: channel.id,
      campaignName: `Boas-vindas — ${input.name}`,
      templateName: input.templateName,
      language: input.language,
      category: input.category,
      dispatchType: "MANUAL",
      createdByName: input.createdByName ?? "Integração Metrópole",
      contacts: [
        {
          phone: input.phone,
          name: input.name,
          parametersBody: [{ type: "text", text: input.name }],
        },
      ],
    });
  },

  /// Cria a Campaign a partir do formulário de sessão do Agent Console —
  /// category/language já vêm explícitos do frontend (que consultou a Meta
  /// antes), então dispatch() não precisa resolver nada.
  async create(user: AuthUser, input: CreateCampaignInput) {
    const contacts = input.contacts.map((c) => ({ ...c, email: c.email || undefined }));

    return this.dispatch({
      organizationId: user.activeOrganizationId!,
      whatsappChannelId: input.whatsappChannelId,
      campaignName: input.name,
      templateName: input.templateName,
      category: input.category,
      language: input.language,
      dispatchType: input.dispatchType,
      templateHeaderText: input.templateHeaderText,
      templateBodyText: input.templateBodyText,
      routeToQueueId: input.routeToQueueId,
      routeToUserId: input.routeToUserId,
      createdByUserId: user.id,
      createdByName: user.name,
      createdByEmail: user.email,
      contacts,
    });
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
