import { z } from "zod";

const templateParameterSchema = z.object({ type: z.string(), text: z.string() });

export const campaignContactSchema = z.object({
  phone: z.string().trim().min(8, "Telefone obrigatório."),
  email: z.string().trim().email().optional().or(z.literal("")),
  name: z.string().trim().optional(),
  parametersHeader: z.array(templateParameterSchema).optional(),
  parametersBody: z.array(templateParameterSchema).optional(),
  parametersButton: z.array(templateParameterSchema).optional(),
  buttonSubType: z.string().optional(),
});

export const createCampaignSchema = z.object({
  whatsappChannelId: z.string().trim().min(1, "Selecione um WhatsApp Channel."),
  name: z.string().trim().min(1, "Informe um nome para a campanha."),
  templateName: z.string().trim().min(1, "Selecione um template."),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().trim().min(1, "Template sem idioma definido."),
  dispatchType: z.enum(["CSV", "MANUAL"]).default("CSV"),
  templateHeaderText: z.string().optional(),
  templateBodyText: z.string().optional(),
  contacts: z.array(campaignContactSchema).min(1, "Envie ao menos 1 contato."),
  /// Se preenchido, cada contato atingido com sucesso vira um Ticket nesta
  /// fila (Target sai de AI e vira HUMAN) em vez de continuar com a IA.
  routeToQueueId: z.string().trim().min(1).optional(),
  /// Só válido junto de routeToQueueId — atendente específico assume o
  /// ticket direto (IN_PROGRESS) em vez de cair WAITING na fila.
  routeToUserId: z.string().trim().min(1).optional(),
});

export const listCampaignsQuerySchema = z.object({
  agentId: z.string().trim().optional(),
  whatsappChannelId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
