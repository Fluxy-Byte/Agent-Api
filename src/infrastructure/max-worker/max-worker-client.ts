import { env } from "../../config/env";
import { UpstreamError } from "../../domain/errors/app-error";

export interface RagIngestPayload {
  ragDocumentId: string;
  agentId: string;
  organizationId: string;
  s3Key: string;
  fileName: string;
  categories: string[];
  chunkSize: number;
}

/// Dispara a ingestão (extrair texto, quebrar em chunks, gerar embeddings) no
/// worker Python genérico — fire-and-forget, ele responde 202 na hora e avisa
/// via PATCH /internal/rag-documents/:id/status quando terminar.
export async function sendRagDocumentToWorker(payload: RagIngestPayload): Promise<void> {
  const response = await fetch(`${env.MAX_WORKER_URL}/rag/ingest`, {
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
      (body as { message?: string } | null)?.message ?? "Falha ao enviar o documento para processamento.",
    );
  }
}
