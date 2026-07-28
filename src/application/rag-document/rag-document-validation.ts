import { z } from "zod";

/// Só os formatos que a ingestão (unstructured, no worker Python) sabe
/// extrair texto — mesmo conjunto do input de arquivo no modal do console.
const ALLOWED_RAG_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const presignRagDocumentSchema = z.object({
  fileName: z.string().trim().min(1, "Nome do arquivo é obrigatório."),
  contentType: z.enum(ALLOWED_RAG_CONTENT_TYPES),
});

export const createRagDocumentSchema = z.object({
  fileName: z.string().trim().min(1, "Nome do arquivo é obrigatório."),
  s3Key: z.string().trim().min(1, "Arquivo não foi enviado."),
  categories: z.array(z.string().trim().min(1)).default([]),
  chunkSize: z.number().int().min(100, "Tamanho de chunk mínimo é 100 caracteres.").max(4000, "Tamanho de chunk máximo é 4000 caracteres."),
});

export type PresignRagDocumentInput = z.infer<typeof presignRagDocumentSchema>;
export type CreateRagDocumentInput = z.infer<typeof createRagDocumentSchema>;
