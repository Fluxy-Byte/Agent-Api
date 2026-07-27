/// Contrato da collection `messages` no Mongo (banco compartilhado entre
/// Inbound-Service, Outbound-Worker, Campaign-Worker e este serviço). Um documento
/// por MENSAGEM individual (não por turno pergunta/resposta) — mesmo quando várias
/// mensagens são agrupadas para processamento pela IA, cada uma é gravada
/// separadamente aqui, preservando o histórico completo. Fonte de verdade de
/// escrita: Inbound-Service (mensagens do cliente), Outbound-Worker (mensagens
/// enviadas) e Campaign-Worker (disparos de template de campanha). Este serviço
/// só lê.
export interface MessageDocument {
  _id?: unknown;
  organizationId: string;
  targetId: string;
  whatsappChannelId: string;
  messagingSessionId: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "CUSTOMER" | "AGENT_AI" | "ATTENDANT" | "SYSTEM" | "CAMPAIGN";
  messageType: "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "STICKER";
  externalMessageId?: string;
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  waStatus?: "sent" | "delivered" | "read" | "failed";
  // Só preenchidos quando senderType === "CAMPAIGN" — identifica de qual campanha e
  // template veio o disparo, pra UI do histórico de conversa mostrar o rótulo certo.
  campaignId?: string;
  templateName?: string;
  createdAt: Date;
}

export const MESSAGES_COLLECTION = "messages";
