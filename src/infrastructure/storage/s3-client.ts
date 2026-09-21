import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env";

const client = new S3Client({
  endpoint: env.SEAWEEDFS_S3_ENDPOINT,
  region: env.SEAWEEDFS_S3_REGION,
  credentials: {
    accessKeyId: env.SEAWEEDFS_S3_ACCESS_KEY,
    secretAccessKey: env.SEAWEEDFS_S3_SECRET_KEY,
  },
  // SeaweedFS (como o MinIO) não faz roteamento por subdomínio de bucket —
  // precisa de path-style (host/bucket/key), não bucket.host/key.
  forcePathStyle: true,
});

/// Gera uma URL presignada de PUT pro upload de um documento de RAG ir direto
/// do navegador pro S3, sem passar o arquivo pelo Agent-Api. A chave já sai
/// prefixada (mesmo padrão de SEAWEEDFS_S3_PREFIX usado por outros serviços)
/// e organizada por agente, pra nunca colidir entre agentes/organizações.
export async function createRagDocumentUploadUrl(input: {
  organizationId: string;
  agentId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; s3Key: string }> {
  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const s3Key = `${env.SEAWEEDFS_S3_PREFIX}/rag-documents/${input.organizationId}/${input.agentId}/${Date.now()}-${safeFileName}`;

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.SEAWEEDFS_S3_BUCKET,
      Key: s3Key,
      ContentType: input.contentType,
    }),
    { expiresIn: 300 },
  );

  return { uploadUrl, s3Key };
}

/// Prefixo das chaves dos anexos de um card do CRM — usado tanto pra gerar a
/// chave quanto pra validar (crm-service.ts) que a chave confirmada pelo
/// front realmente pertence a este card/empresa.
export function crmAttachmentKeyPrefix(organizationId: string, cardId: string): string {
  return `${env.SEAWEEDFS_S3_PREFIX}/crm-attachments/${organizationId}/${cardId}/`;
}

/// URL presignada de PUT pro anexo de um card ir direto do navegador pro S3.
export async function createCrmAttachmentUploadUrl(input: {
  organizationId: string;
  cardId: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; s3Key: string }> {
  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const s3Key = `${crmAttachmentKeyPrefix(input.organizationId, input.cardId)}${Date.now()}-${safeFileName}`;

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: env.SEAWEEDFS_S3_BUCKET, Key: s3Key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );

  return { uploadUrl, s3Key };
}

/// URL presignada de leitura (1h) — o bucket não precisa ser público.
export function createDownloadUrl(s3Key: string): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: env.SEAWEEDFS_S3_BUCKET, Key: s3Key }), {
    expiresIn: 3600,
  });
}
