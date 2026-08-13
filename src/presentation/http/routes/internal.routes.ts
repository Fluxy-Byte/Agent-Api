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

const templateParameterSchema = z.object({ type: z.string(), text: z.string() });

const dispatchContactSchema = z.object({
  numberContact: z.string().trim().min(8, "Telefone obrigatório."),
  nameContact: z.string().trim().optional(),
  emailContact: z.string().trim().email().optional().or(z.literal("")),
  metadata: z.record(z.string(), z.string()).optional(),
  parametersHeader: z.array(templateParameterSchema).optional(),
  parametersBody: z.array(templateParameterSchema).optional(),
  parametersButton: z.array(templateParameterSchema).optional(),
});

/// Contrato interno único de disparo — usado hoje pela futura API externa
/// (Fluxy Agents) e, mais adiante, pelo disparo ativo do Desk. organizationId
/// vem explícito no body porque não há sessão de usuário aqui (o caller já é
/// confiável, autenticado por x-internal-api-key).
const campaignDispatchSchema = z.object({
  organizationId: z.string().trim().min(1),
  whatsappChannelId: z.string().trim().min(1),
  campaignName: z.string().trim().min(1),
  templateName: z.string().trim().min(1),
  language: z.string().trim().optional(),
  idAttendant: z.string().trim().min(1).optional(),
  idQueue: z.string().trim().min(1).optional(),
  createdByName: z.string().trim().optional(),
  skipTransferMessage: z.boolean().optional(),
  /// Texto cru do HEADER/BODY do template (com {{n}}) — só pra gravar no
  /// histórico de conversa a mensagem já com as variáveis substituídas.
  templateHeaderText: z.string().optional(),
  templateBodyText: z.string().optional(),
  contacts: z.array(dispatchContactSchema).min(1, "Envie ao menos 1 contato."),
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

/// Ponto único de disparo ativo, chamável por qualquer serviço confiável
/// (x-internal-api-key) — hoje usado pela API externa Fluxy Agents, e serve
/// de base para o futuro disparo ativo pelo Desk. organizationId vem
/// explícito no body (sem sessão de usuário).
internalRouter.post("/campaigns/dispatch", async (req, res) => {
  const parsed = campaignDispatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ success: false, result: null, message: "Dados inválidos.", errors: parsed.error.flatten() });
    return;
  }

  try {
    const campaign = await campaignService.dispatch({
      organizationId: parsed.data.organizationId,
      whatsappChannelId: parsed.data.whatsappChannelId,
      campaignName: parsed.data.campaignName,
      templateName: parsed.data.templateName,
      language: parsed.data.language,
      routeToQueueId: parsed.data.idQueue,
      routeToUserId: parsed.data.idAttendant,
      createdByName: parsed.data.createdByName,
      skipTransferMessage: parsed.data.skipTransferMessage,
      templateHeaderText: parsed.data.templateHeaderText,
      templateBodyText: parsed.data.templateBodyText,
      contacts: parsed.data.contacts.map((c) => ({
        phone: c.numberContact,
        name: c.nameContact,
        email: c.emailContact || undefined,
        metadata: c.metadata,
        parametersHeader: c.parametersHeader,
        parametersBody: c.parametersBody,
        parametersButton: c.parametersButton,
      })),
    });
    res.status(202).json({ success: true, result: campaign, message: null });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 502;
    const message = error instanceof Error ? error.message : "Falha ao disparar a campanha.";
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
