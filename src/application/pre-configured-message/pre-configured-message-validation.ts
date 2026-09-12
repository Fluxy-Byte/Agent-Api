import { z } from "zod";

export const upsertPreConfiguredMessageSchema = z.object({
  name: z.string().trim().min(1, "Nome da mensagem é obrigatório."),
  content: z.string().trim().min(1, "Conteúdo da mensagem é obrigatório."),
  /// Filas em que essa mensagem fica disponível pro atendente — "Selecionar
  /// todas" no formulário só marca as filas existentes no momento do envio,
  /// não é uma flag que reaplica sozinha em filas futuras.
  queueIds: z.array(z.string().trim().min(1)).min(1, "Selecione ao menos uma fila."),
});

export type UpsertPreConfiguredMessageInput = z.infer<typeof upsertPreConfiguredMessageSchema>;
