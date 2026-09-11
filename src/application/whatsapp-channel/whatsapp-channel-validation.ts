import { z } from "zod";

/// Ranges do filtro dos gráficos "Fluxo de conversas"/"Fluxo de mensagens"
/// (Area Chart - Interactive) na tela de detalhe do canal. "years" usa
/// granularidade mensal (últimos 24 meses); os demais, diária — ver
/// resolveSeriesRange em whatsapp-channel-service.ts.
export const SERIES_RANGES = ["years", "3m", "1m", "7d"] as const;
export const seriesRangeSchema = z.enum(SERIES_RANGES).default("3m");
export type SeriesRange = z.infer<typeof seriesRangeSchema>;

export const createWhatsappChannelSchema = z.object({
  /// Não é mais obrigatório: um canal pode nascer sem agente de IA (só
  /// atendimento humano). Quando informado, openAgent nasce true; quando
  /// omitido, openAgent nasce false (ver whatsapp-channel-service.ts).
  agentId: z.string().trim().min(1, "Agente inválido.").optional(),
  phoneNumberId: z.string().trim().min(1, "Phone Number ID é obrigatório."),
  displayNumber: z.string().trim().min(1, "Número de exibição é obrigatório."),
  wabaId: z.string().trim().min(1, "WhatsApp Business Account ID é obrigatório."),
  metaAccessToken: z.string().trim().min(1, "Token de acesso da Meta é obrigatório."),
});

export const updateWhatsappChannelSchema = createWhatsappChannelSchema.partial().extend({
  /// Liga/desliga o roteamento pro agente de IA deste canal especificamente
  /// (ver WhatsappChannel.openAgent no schema). Não pode virar true sem um
  /// agentId (existente ou enviado na mesma requisição) — validado no service.
  openAgent: z.boolean().optional(),
  /// Id da fila (Queue) que recebe o atendimento quando openAgent=false.
  /// null explícito limpa a seleção; omitido não mexe no valor salvo.
  idServiceIslandDefault: z.string().trim().min(1, "Fila inválida.").nullish(),
});

export const wabaLookupSchema = z.object({
  wabaId: z.string().trim().min(1, "WhatsApp Business Account ID é obrigatório."),
  metaAccessToken: z.string().trim().min(1, "Token de acesso da Meta é obrigatório."),
});

export const bulkCreateWhatsappChannelSchema = z.object({
  /// Mesma regra do cadastro individual: opcional. Sem agente, cada canal
  /// criado nasce com openAgent=false (ver whatsapp-channel-service.ts).
  agentId: z.string().trim().min(1, "Agente inválido.").optional(),
  wabaId: z.string().trim().min(1, "WhatsApp Business Account ID é obrigatório."),
  metaAccessToken: z.string().trim().min(1, "Token de acesso da Meta é obrigatório."),
  phoneNumbers: z
    .array(
      z.object({
        phoneNumberId: z.string().trim().min(1),
        displayNumber: z.string().trim().min(1),
      }),
    )
    .min(1, "Selecione ao menos um número para cadastrar."),
});

export type CreateWhatsappChannelInput = z.infer<typeof createWhatsappChannelSchema>;
export type UpdateWhatsappChannelInput = z.infer<typeof updateWhatsappChannelSchema>;
export type WabaLookupInput = z.infer<typeof wabaLookupSchema>;
export type BulkCreateWhatsappChannelInput = z.infer<typeof bulkCreateWhatsappChannelSchema>;
