/// Contrato da collection `messages` no Mongo (banco compartilhado entre
/// Inbound-Service, Outbound-Worker e este serviço). Um documento por
/// MENSAGEM individual (não por turno pergunta/resposta) — mesmo quando várias
/// mensagens são agrupadas para processamento pela IA, cada uma é gravada
/// separadamente aqui, preservando o histórico completo. Fonte de verdade de
/// escrita: Inbound-Service (mensagens do cliente) e Outbound-Worker
/// (mensagens enviadas). Este serviço só lê.
export interface MessageDocument {
  _id?: unknown;
  organizationId: string;
  targetId: string;
  whatsappChannelId: string;
  messagingSessionId: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "CUSTOMER" | "AGENT_AI" | "ATTENDANT" | "SYSTEM";
  messageType: "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "STICKER";
  externalMessageId?: string;
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  waStatus?: "sent" | "delivered" | "read" | "failed";
  createdAt: Date;
}

export const MESSAGES_COLLECTION = "messages";
