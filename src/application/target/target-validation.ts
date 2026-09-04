import { z } from "zod";

export const listTargetsFilterSchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  status: z.enum(["AI", "HUMAN", "FINISHED"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const listTargetsQuerySchema = listTargetsFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "waId", "status", "lastInteractionAt"]).default("lastInteractionAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const historyQuerySchema = z.object({
  messageType: z.enum(["TEXT", "AUDIO", "IMAGE", "DOCUMENT", "STICKER"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const createTargetSchema = z.object({
  whatsappChannelId: z.string().trim().min(1, "Selecione um canal."),
  phone: z.string().trim().min(8, "Telefone obrigatório."),
  name: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
});

export const updateBlockedAgentsSchema = z.object({
  blockedAgentIds: z.array(z.string().trim().min(1)),
});

export type ListTargetsFilter = z.infer<typeof listTargetsFilterSchema>;
export type ListTargetsQuery = z.infer<typeof listTargetsQuerySchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type CreateTargetInput = z.infer<typeof createTargetSchema>;
export type UpdateBlockedAgentsInput = z.infer<typeof updateBlockedAgentsSchema>;
