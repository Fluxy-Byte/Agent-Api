import { assertQueueWithDlq, getRabbitChannel } from "../queue/rabbitmq/connection";

export interface RagIngestPayload {
  ragDocumentId: string;
  agentId: string;
  organizationId: string;
  s3Key: string;
  fileName: string;
  categories: string[];
  chunkSize: number;
  /// Decifrado — o worker usa pra gerar os embeddings deste agente em vez do
  /// OPENAI_API_KEY do próprio env. null = agente sem token configurado
  /// ainda, worker cai pro fallback do env.
  openaiToken: string | null;
}

/// Mesma sanitização de Inbound-Service/publisher.ts#resolveAgentQueueName e
/// de AI-Worker/*/consumer.py#_sanitize_agent_name — as três precisam bater,
/// senão o documento cai numa fila que nenhum worker consome.
export function resolveAgentRagQueueName(agentName: string): string {
  const sanitized = agentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `task.agent.${sanitized}.rag`;
}

/// Enfileira a ingestão (extrair texto, quebrar em chunks, gerar embeddings)
/// na fila do PRÓPRIO agente — a mesma instância do AI-Worker que responde as
/// mensagens dele (AGENT_NAME) consome task.agent.<nome>.rag e avisa o
/// resultado via PATCH /internal/rag-documents/:id/status. Se a instância
/// estiver fora do ar, a mensagem fica na fila até ela subir.
export async function publishRagIngest(agentName: string, payload: RagIngestPayload): Promise<void> {
  const channel = await getRabbitChannel();
  const queue = resolveAgentRagQueueName(agentName);
  await assertQueueWithDlq(channel, queue);
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), { persistent: true });
}
