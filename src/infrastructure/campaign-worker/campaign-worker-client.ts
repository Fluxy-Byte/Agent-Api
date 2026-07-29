import { env } from "../../config/env";
import { UpstreamError } from "../../domain/errors/app-error";

export interface CampaignWorkerContactInput {
  phone: string;
  email?: string;
  name?: string;
  parametersHeader?: { type: string; text: string }[];
  parametersBody?: { type: string; text: string }[];
  parametersButton?: { type: string; text: string }[];
  buttonSubType?: string;
}

export interface CampaignWorkerSendPayload {
  campaignId: string;
  organizationId: string;
  whatsappChannelId: string;
  phoneNumberId: string;
  wabaId: string;
  serviceIslandId: string;
  agentId: string;
  agentName: string;
  templateName: string;
  language: string;
  category: string;
  templateHeaderText?: string;
  templateBodyText?: string;
  contacts: CampaignWorkerContactInput[];
  /// Se preenchido, o Campaign-Worker publica desk.ticket.create pra cada
  /// contato enviado com sucesso (ver process-campaign-send.ts).
  routeToQueueId?: string;
  routeToUserId?: string;
}

/// Chama o Campaign-Worker pra enfileirar o disparo em massa — a Campaign já
/// foi criada de forma síncrona antes desta chamada (ver CampaignService).
export async function sendCampaignToWorker(payload: CampaignWorkerSendPayload): Promise<void> {
  const response = await fetch(`${env.CAMPAIGN_WORKER_URL}/campaign/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": env.INTERNAL_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new UpstreamError(
      (body as { message?: string } | null)?.message ?? "Falha ao enviar a campanha para o Campaign-Worker.",
    );
  }
}
