import { z } from "zod";

const optionalMessage = z.string().trim().optional();

export const createAgentSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  isActive: z.boolean().optional(),

  welcomeMessage: optionalMessage,
  welcomeEnabled: z.boolean().optional(),

  processingMessage: optionalMessage,
  transferMessage: optionalMessage,
  unsupportedFormatMessage: optionalMessage,

  outOfHoursMessage: optionalMessage,
  outOfHoursEnabled: z.boolean().optional(),

  closingMessage: optionalMessage,
  closingEnabled: z.boolean().optional(),

  errorMessage: optionalMessage,
  errorEnabled: z.boolean().optional(),

  defaultQueueId: z.string().trim().min(1).nullable().optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
