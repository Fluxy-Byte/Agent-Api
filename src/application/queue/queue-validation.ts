import { z } from "zod";

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário deve estar no formato HH:mm")
  .optional();

export const upsertQueueSchema = z.object({
  name: z.string().trim().min(1, "Nome da fila é obrigatório.").optional(),
  isActive: z.boolean().optional(),
  businessHoursEnabled: z.boolean().optional(),
  businessHoursStart: timeString,
  businessHoursEnd: timeString,
  businessDays: z.array(z.number().int().min(0).max(6)).optional(),
  /// Lista completa de userIds que devem ficar atrelados à fila — substitui o
  /// conjunto atual inteiro (sincronização idempotente), não é um "add".
  memberUserIds: z.array(z.string().trim().min(1)).optional(),
});

export const createQueueSchema = upsertQueueSchema.extend({
  name: z.string().trim().min(1, "Nome da fila é obrigatório."),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof upsertQueueSchema>;
