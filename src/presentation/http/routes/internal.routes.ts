import { Router } from "express";
import { z } from "zod";
import { campaignService } from "../../../application/campaign/campaign-service";
import { env } from "../../../config/env";
import { ragDocumentService } from "../../../application/rag-document/rag-document-service";
import { AppError } from "../../../domain/errors/app-error";
import { prisma } from "../../../infrastructure/database/prisma/client";
import { requireInternalApiKey } from "../middlewares/internal-auth";

export const internalRouter = Router();
internalRouter.use(requireInternalApiKey);

const metadataSchema = z.object({ metadata: z.record(z.string(), z.unknown()) });

const metropoleWelcomeSchema = z.object({
  phone: z.string().trim().min(8),
  name: z.string().trim().min(1),
});

const ragDocumentStatusSchema = z.object({
  status: z.enum(["READY", "FAILED"]),
  chunkCount: z.number().int().optional(),
  errorMessage: z.string().optional(),
});

/// Usada pelo AI-Worker (tool de handoff) para decidir/confirmar a fila de
/// destino de um ticket, a partir da ilha ligada ao WhatsApp Channel do contato.
internalRouter.get("/service-islands/:id/queues", async (req, res) => {
  const queues = await prisma.queue.findMany({
    where: { serviceIslandId: String(req.params.id), isActive: true },
    orderBy: { createdAt: "asc" },
  });

  res.json({ success: true, result: queues, message: null });
});

/// Usada pelo AI-Worker para sincronizar o snapshot de metadados aprendido
/// durante a conversa (merge, não substitui o que já existe).
internalRouter.patch("/targets/:id/metadata", async (req, res) => {
  const parsed = metadataSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, result: null, message: "Dados inválidos." });
    return;
  }

  const target = await prisma.target.findUnique({ where: { id: String(req.params.id) } });
  if (!target) {
    res.status(404).json({ success: false, result: null, message: "Contato não encontrado." });
    return;
  }

  const mergedMetadata = { ...((target.metadata as object) ?? {}), ...parsed.data.metadata };

  const updated = await prisma.target.update({
    where: { id: target.id },
    data: { metadata: mergedMetadata as object },
  });

  res.json({ success: true, result: updated, message: null });
});

/// Chamada pela Metrópole (server-to-server) sempre que um lead novo se
/// cadastra com WhatsApp pelo formulário de contato do site — dispara a
/// campanha ativa de boas-vindas (template configurado via env) pro contato.
/// Sem sessão de usuário: o canal/template vêm da config do ambiente, não do
/// corpo da requisição, pra a Metrópole não poder disparar template arbitrário.
internalRouter.post("/campaigns/metropole-welcome", async (req, res) => {
  const parsed = metropoleWelcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, result: null, message: "Dados inválidos." });
    return;
  }

  if (!env.METROPOLE_WHATSAPP_CHANNEL_ID) {
    res.status(503).json({
      success: false,
      result: null,
      message: "WhatsApp Channel da Metrópole ainda não configurado (METROPOLE_WHATSAPP_CHANNEL_ID).",
    });
    return;
  }

  try {
    const campaign = await campaignService.triggerSystemCampaign({
      whatsappChannelId: env.METROPOLE_WHATSAPP_CHANNEL_ID,
      phone: parsed.data.phone,
      name: parsed.data.name,
      templateName: env.METROPOLE_WELCOME_TEMPLATE_NAME,
      language: env.METROPOLE_WELCOME_TEMPLATE_LANGUAGE,
      category: env.METROPOLE_WELCOME_TEMPLATE_CATEGORY,
    });
    res.status(202).json({ success: true, result: campaign, message: null });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 502;
    const message = error instanceof Error ? error.message : "Falha ao disparar a campanha de boas-vindas.";
    res.status(statusCode).json({ success: false, result: null, message });
  }
});

/// Chamada pelo worker Python (AI-Worker/max) ao terminar de processar (ou
/// falhar) a ingestão de um documento de RAG — ver rag-document-service.ts.
internalRouter.patch("/rag-documents/:id/status", async (req, res) => {
  const parsed = ragDocumentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, result: null, message: "Dados inválidos." });
    return;
  }

  try {
    const updated = await ragDocumentService.updateStatus(String(req.params.id), parsed.data);
    res.json({ success: true, result: updated, message: null });
  } catch {
    res.status(404).json({ success: false, result: null, message: "Documento não encontrado." });
  }
});
