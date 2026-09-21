import { z } from "zod";

export const createStageSchema = z.object({
  nameStage: z.string().trim().min(1, "Nome do estágio obrigatório."),
  position: z.coerce.number().int().min(1, "Posição precisa ser um número inteiro a partir de 1."),
});

export const updateStageSchema = z.object({
  nameStage: z.string().trim().min(1, "Nome do estágio obrigatório."),
});

export const moveCardSchema = z.object({
  stagesCrmId: z.string().trim().min(1, "Selecione um estágio."),
});

export const updatePrioritySchema = z.object({
  statusPriority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], { message: "Prioridade inválida." }),
});

export const presignAttachmentSchema = z.object({
  fileName: z.string().trim().min(1, "Nome do arquivo é obrigatório."),
  contentType: z.string().trim().min(1).default("application/octet-stream"),
});

export const addAttachmentSchema = z.object({
  s3Key: z.string().trim().min(1, "Arquivo não foi enviado."),
});

export const createCommentSchema = z.object({
  comment: z.string().trim().min(1, "Escreva um comentário.").max(2000, "Comentário muito longo (máx. 2000 caracteres)."),
});

export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;
export type PresignAttachmentInput = z.infer<typeof presignAttachmentSchema>;
export type AddAttachmentInput = z.infer<typeof addAttachmentSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
