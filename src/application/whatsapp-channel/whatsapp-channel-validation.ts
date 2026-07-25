import { z } from "zod";

export const createWhatsappChannelSchema = z.object({
  agentId: z.string().trim().min(1, "Agente é obrigatório."),
  phoneNumberId: z.string().trim().min(1, "Phone Number ID é obrigatório."),
  displayNumber: z.string().trim().min(1, "Número de exibição é obrigatório."),
  wabaId: z.string().trim().min(1, "WhatsApp Business Account ID é obrigatório."),
});

export const updateWhatsappChannelSchema = createWhatsappChannelSchema.partial();

export type CreateWhatsappChannelInput = z.infer<typeof createWhatsappChannelSchema>;
export type UpdateWhatsappChannelInput = z.infer<typeof updateWhatsappChannelSchema>;
