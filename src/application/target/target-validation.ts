import { z } from "zod";

export const listTargetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agentId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const historyQuerySchema = z.object({
  messageType: z.enum(["TEXT", "AUDIO", "IMAGE", "DOCUMENT", "STICKER"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type ListTargetsQuery = z.infer<typeof listTargetsQuerySchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
