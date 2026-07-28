import { agentService } from "../agent/agent-service";
import { NotFoundError } from "../../domain/errors/app-error";
import { createRagDocumentUploadUrl } from "../../infrastructure/storage/s3-client";
import { sendRagDocumentToWorker } from "../../infrastructure/max-worker/max-worker-client";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { CreateRagDocumentInput, PresignRagDocumentInput } from "./rag-document-validation";

export const ragDocumentService = {
  async presign(user: AuthUser, agentId: string, input: PresignRagDocumentInput) {
    const agent = await agentService.getById(user, agentId);
    return createRagDocumentUploadUrl({
      organizationId: user.activeOrganizationId!,
      agentId: agent.id,
      fileName: input.fileName,
      contentType: input.contentType,
    });
  },

  async list(user: AuthUser, agentId: string) {
    await agentService.getById(user, agentId);
    return prisma.ragDocument.findMany({
      where: { agentId, organizationId: user.activeOrganizationId! },
      orderBy: { createdAt: "desc" },
    });
  },

  /// Cria o registro (PROCESSING) de forma síncrona e delega a extração/chunking/
  /// embedding pro worker Python — mesmo desenho do CampaignService (cria antes de
  /// enfileirar). Se a chamada ao worker falhar, o documento fica órfão em
  /// PROCESSING — aceitável pro escopo, mesmo comportamento já aceito no Campaign.
  async create(user: AuthUser, agentId: string, input: CreateRagDocumentInput) {
    const agent = await agentService.getById(user, agentId);

    const document = await prisma.ragDocument.create({
      data: {
        agentId: agent.id,
        organizationId: user.activeOrganizationId!,
        fileName: input.fileName,
        s3Key: input.s3Key,
        categories: input.categories,
        chunkSize: input.chunkSize,
      },
    });

    await sendRagDocumentToWorker({
      ragDocumentId: document.id,
      agentId: agent.id,
      organizationId: user.activeOrganizationId!,
      s3Key: input.s3Key,
      fileName: input.fileName,
      categories: input.categories,
      chunkSize: input.chunkSize,
    });

    return document;
  },

  async delete(user: AuthUser, agentId: string, documentId: string) {
    await agentService.getById(user, agentId);
    const document = await prisma.ragDocument.findFirst({
      where: { id: documentId, agentId, organizationId: user.activeOrganizationId! },
    });
    if (!document) throw new NotFoundError("Documento não encontrado.");
    await prisma.ragDocument.delete({ where: { id: document.id } });
  },

  /// Chamado pelo worker (rota interna) ao terminar a ingestão.
  async updateStatus(
    documentId: string,
    data: { status: "READY" | "FAILED"; chunkCount?: number; errorMessage?: string },
  ) {
    const document = await prisma.ragDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundError("Documento não encontrado.");

    return prisma.ragDocument.update({
      where: { id: document.id },
      data: {
        status: data.status,
        chunkCount: data.chunkCount ?? document.chunkCount,
        errorMessage: data.errorMessage ?? null,
      },
    });
  },
};
