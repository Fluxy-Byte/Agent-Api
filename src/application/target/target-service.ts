import { Prisma } from "../../../generated/prisma/client";
import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/contracts/message-document";
import { ConflictError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { normalizeBrazilianWaId } from "../../domain/utils/phone";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type {
  CreateTargetInput,
  HistoryQuery,
  ListTargetsFilter,
  ListTargetsQuery,
  UpdateBlockedAgentsInput,
} from "./target-validation";

function buildTargetWhere(user: AuthUser, filter: ListTargetsFilter): Prisma.TargetWhereInput {
  return {
    organizationId: user.activeOrganizationId!,
    ...(filter.agentId ? { whatsappChannel: { agentId: filter.agentId } } : {}),
    ...(filter.name ? { name: { contains: filter.name, mode: "insensitive" } } : {}),
    ...(filter.phone ? { waId: { contains: filter.phone } } : {}),
    ...(filter.email ? { email: { contains: filter.email, mode: "insensitive" } } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.startDate || filter.endDate
      ? {
          lastInteractionAt: {
            ...(filter.startDate ? { gte: filter.startDate } : {}),
            ...(filter.endDate ? { lte: filter.endDate } : {}),
          },
        }
      : {}),
  };
}

export const targetService = {
  async list(user: AuthUser, query: ListTargetsQuery) {
    const where = buildTargetWhere(user, query);

    const [items, total] = await Promise.all([
      prisma.target.findMany({
        where,
        include: { whatsappChannel: { include: { agent: true } } },
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.target.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  /// Métricas da fileira de cards do topo da tela de Contatos — mesmos
  /// filtros de `list()` (sem paginação), sempre recalculadas na hora.
  async getStats(user: AuthUser, filter: ListTargetsFilter) {
    const where = buildTargetWhere(user, filter);

    const [total, active, lastInteraction, topChannel, matchingTargets] = await Promise.all([
      prisma.target.count({ where }),
      prisma.target.count({ where: { ...where, status: { not: "FINISHED" } } }),
      prisma.target.findFirst({ where, orderBy: { lastInteractionAt: "desc" }, select: { lastInteractionAt: true } }),
      prisma.target.groupBy({
        by: ["whatsappChannelId"],
        where,
        _count: { _all: true },
        orderBy: { _count: { whatsappChannelId: "desc" } },
        take: 1,
      }),
      prisma.target.findMany({ where, select: { id: true } }),
    ]);

    let primaryAgentName: string | null = null;
    if (topChannel.length > 0) {
      const channel = await prisma.whatsappChannel.findUnique({
        where: { id: topChannel[0].whatsappChannelId },
        include: { agent: { select: { name: true } } },
      });
      primaryAgentName = channel?.agent.name ?? null;
    }

    // Contagem de mensagens (não de Target) numa janela rolante de 24h — por
    // isso precisa resolver os ids dos Target que batem com o filtro atual
    // (mesmo `where` do resto do card) em vez de só filtrar por
    // organizationId, senão esse número ignora canal/agente/busca aplicados
    // na tela enquanto os outros cards respeitam.
    const targetIds = matchingTargets.map((t) => t.id);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = await getMongoDb();
    const messagesCollection = db.collection<MessageDocument>(MESSAGES_COLLECTION);

    // interactionsToday = volume de MENSAGENS (cada documento é uma
    // mensagem individual) na janela; contactsInteractedToday = quantidade
    // de CONTATOS distintos (Target.id únicos) com pelo menos uma mensagem
    // na mesma janela — são métricas diferentes de propósito, por isso os
    // dois cards em vez de um só.
    const [interactionsToday, distinctTargetIds] =
      targetIds.length === 0
        ? [0, []]
        : await Promise.all([
            messagesCollection.countDocuments({ targetId: { $in: targetIds }, createdAt: { $gte: since24h } }),
            messagesCollection.distinct("targetId", { targetId: { $in: targetIds }, createdAt: { $gte: since24h } }),
          ]);
    const contactsInteractedToday = distinctTargetIds.length;

    return {
      total,
      active,
      interactionsToday,
      contactsInteractedToday,
      lastInteractionAt: lastInteraction?.lastInteractionAt ?? null,
      primaryAgentName,
    };
  },

  /// Cadastro manual de contato (fora do fluxo normal, que é via webhook
  /// inbound ou disparo de campanha) — usado pelo botão "Novo contato".
  async create(user: AuthUser, input: CreateTargetInput) {
    const channel = await prisma.whatsappChannel.findFirst({
      where: { id: input.whatsappChannelId, organizationId: user.activeOrganizationId! },
    });
    if (!channel) throw new NotFoundError("WhatsApp Channel não encontrado.");

    try {
      return await prisma.target.create({
        data: {
          organizationId: user.activeOrganizationId!,
          whatsappChannelId: channel.id,
          waId: normalizeBrazilianWaId(input.phone),
          name: input.name || undefined,
          email: input.email || undefined,
        },
        include: { whatsappChannel: { include: { agent: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Já existe um contato com esse telefone neste canal.");
      }
      throw error;
    }
  },

  async getById(user: AuthUser, id: string) {
    const target = await prisma.target.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
      include: { whatsappChannel: { include: { agent: true } } },
    });
    if (!target) throw new NotFoundError("Contato não encontrado.");

    const tickets = await prisma.ticket.findMany({
      where: { targetId: target.id },
      include: {
        queue: { include: { serviceIsland: { select: { id: true, name: true } } } },
        assignedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { ...target, tickets };
  },

  /// Histórico de conversa, agrupável/filtrável por tipo de mensagem (Texto,
  /// Áudio, Figurinha, Documento, Foto) — conteúdo sempre lido do Mongo, nunca
  /// do Postgres.
  async getHistory(user: AuthUser, id: string, query: HistoryQuery) {
    await this.getById(user, id);

    const db = await getMongoDb();
    const filter: Record<string, unknown> = { targetId: id };
    if (query.messageType) filter.messageType = query.messageType;

    const messages = await db
      .collection<MessageDocument>(MESSAGES_COLLECTION)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .toArray();

    return messages.reverse();
  },

  /// Só Supervisor/Gerente (CONTACTS_WRITE) chegam aqui. Bloqueia este
  /// contato de falar com os agentes listados — quando o agente do canal
  /// atual está na lista, o Inbound-Service responde com
  /// Agent.blockedMessage em vez de rotear pra IA/atendente.
  async updateBlockedAgents(user: AuthUser, id: string, input: UpdateBlockedAgentsInput) {
    const organizationId = user.activeOrganizationId!;

    const target = await prisma.target.findFirst({ where: { id, organizationId } });
    if (!target) throw new NotFoundError("Contato não encontrado.");

    if (input.blockedAgentIds.length > 0) {
      const validCount = await prisma.agent.count({
        where: { id: { in: input.blockedAgentIds }, organizationId },
      });
      if (validCount !== input.blockedAgentIds.length) {
        throw new ValidationError("Um ou mais agentes selecionados são inválidos para esta empresa.");
      }
    }

    return prisma.target.update({
      where: { id: target.id },
      data: { blockedAgentIds: input.blockedAgentIds },
    });
  },
};
