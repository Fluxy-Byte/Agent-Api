import { z } from "zod";

export const upsertCarteiraSchema = z.object({
  name: z.string().trim().min(1, "Nome da carteira é obrigatório."),
  queueId: z.string().trim().min(1, "Selecione a fila da carteira."),
});

/// Lista completa das carteiras do contato — substitui o conjunto atual
/// (mesma semântica de sincronização do memberUserIds da fila).
export const setTargetCarteirasSchema = z.object({
  carteiraIds: z.array(z.string().trim().min(1)),
});

export type UpsertCarteiraInput = z.infer<typeof upsertCarteiraSchema>;
export type SetTargetCarteirasInput = z.infer<typeof setTargetCarteirasSchema>;
