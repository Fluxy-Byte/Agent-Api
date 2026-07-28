import { AGENT_DEFAULT_MESSAGES, DEFAULT_AGENT_PERSONALITY } from "../../domain/constants/agent-default-messages";
import { NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { CreateAgentInput, UpdateAgentInput } from "./agent-validation";

function resolveRequired(value: string | undefined, label: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (!value) throw new ValidationError(`${label} é obrigatória e não pode ficar vazia.`);
  return value;
}

function resolveToggleable(value: string | undefined, fallback: string): string {
  return value === undefined ? fallback : value;
}

async function assertQueueBelongsToOrganization(queueId: string, organizationId: string): Promise<void> {
  const queue = await prisma.queue.findFirst({
    where: { id: queueId, serviceIsland: { organizationId } },
    select: { id: true },
  });
  if (!queue) throw new ValidationError("Fila padrão inválida para esta empresa.");
}

export const agentService = {
  async list(user: AuthUser) {
    return prisma.agent.findMany({
      where: { organizationId: user.activeOrganizationId! },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(user: AuthUser, id: string) {
    const agent = await prisma.agent.findFirst({
      where: { id, organizationId: user.activeOrganizationId! },
    });
    if (!agent) throw new NotFoundError("Agente não encontrado.");
    return agent;
  },

  async create(user: AuthUser, input: CreateAgentInput) {
    if (input.defaultQueueId) {
      await assertQueueBelongsToOrganization(input.defaultQueueId, user.activeOrganizationId!);
    }

    return prisma.agent.create({
      data: {
        organizationId: user.activeOrganizationId!,
        name: input.name,
        isActive: input.isActive ?? true,

        welcomeMessage: resolveToggleable(input.welcomeMessage, AGENT_DEFAULT_MESSAGES.welcomeMessage),
        welcomeEnabled: input.welcomeEnabled ?? true,

        processingMessage: resolveRequired(
          input.processingMessage,
          "Mensagem de processando",
          AGENT_DEFAULT_MESSAGES.processingMessage,
        ),
        transferMessage: resolveRequired(
          input.transferMessage,
          "Mensagem de transbordo",
          AGENT_DEFAULT_MESSAGES.transferMessage,
        ),
        unsupportedFormatMessage: resolveRequired(
          input.unsupportedFormatMessage,
          "Mensagem de formato não suportado",
          AGENT_DEFAULT_MESSAGES.unsupportedFormatMessage,
        ),

        outOfHoursMessage: resolveToggleable(input.outOfHoursMessage, AGENT_DEFAULT_MESSAGES.outOfHoursMessage),
        outOfHoursEnabled: input.outOfHoursEnabled ?? true,

        closingMessage: resolveToggleable(input.closingMessage, AGENT_DEFAULT_MESSAGES.closingMessage),
        closingEnabled: input.closingEnabled ?? true,

        errorMessage: resolveToggleable(input.errorMessage, AGENT_DEFAULT_MESSAGES.errorMessage),
        errorEnabled: input.errorEnabled ?? true,

        defaultQueueId: input.defaultQueueId ?? null,

        personality: resolveToggleable(input.personality, DEFAULT_AGENT_PERSONALITY),
        ragEnabled: input.ragEnabled ?? false,
        ragChunkSize: input.ragChunkSize ?? null,
      },
    });
  },

  async update(user: AuthUser, id: string, input: UpdateAgentInput) {
    const existing = await this.getById(user, id);

    if (input.defaultQueueId) {
      await assertQueueBelongsToOrganization(input.defaultQueueId, user.activeOrganizationId!);
    }

    const nextProcessing =
      input.processingMessage === undefined
        ? existing.processingMessage
        : resolveRequired(input.processingMessage, "Mensagem de processando", existing.processingMessage);
    const nextTransfer =
      input.transferMessage === undefined
        ? existing.transferMessage
        : resolveRequired(input.transferMessage, "Mensagem de transbordo", existing.transferMessage);
    const nextUnsupported =
      input.unsupportedFormatMessage === undefined
        ? existing.unsupportedFormatMessage
        : resolveRequired(
            input.unsupportedFormatMessage,
            "Mensagem de formato não suportado",
            existing.unsupportedFormatMessage,
          );

    return prisma.agent.update({
      where: { id: existing.id },
      data: {
        name: input.name ?? existing.name,
        isActive: input.isActive ?? existing.isActive,

        welcomeMessage: input.welcomeMessage ?? existing.welcomeMessage,
        welcomeEnabled: input.welcomeEnabled ?? existing.welcomeEnabled,

        processingMessage: nextProcessing,
        transferMessage: nextTransfer,
        unsupportedFormatMessage: nextUnsupported,

        outOfHoursMessage: input.outOfHoursMessage ?? existing.outOfHoursMessage,
        outOfHoursEnabled: input.outOfHoursEnabled ?? existing.outOfHoursEnabled,

        closingMessage: input.closingMessage ?? existing.closingMessage,
        closingEnabled: input.closingEnabled ?? existing.closingEnabled,

        errorMessage: input.errorMessage ?? existing.errorMessage,
        errorEnabled: input.errorEnabled ?? existing.errorEnabled,

        defaultQueueId: input.defaultQueueId === undefined ? existing.defaultQueueId : input.defaultQueueId,

        personality: input.personality ?? existing.personality,
        ragEnabled: input.ragEnabled ?? existing.ragEnabled,
        ragChunkSize: input.ragChunkSize === undefined ? existing.ragChunkSize : input.ragChunkSize,
      },
    });
  },
};
