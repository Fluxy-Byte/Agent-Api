import { Router } from "express";
import { agentService } from "../../../application/agent/agent-service";
import { createAgentSchema, updateAgentSchema } from "../../../application/agent/agent-validation";
import { ragDocumentService } from "../../../application/rag-document/rag-document-service";
import {
  createRagDocumentSchema,
  presignRagDocumentSchema,
} from "../../../application/rag-document/rag-document-validation";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

export const agentsRouter = Router();

agentsRouter.get(
  "/",
  apiHandler({ action: PermissionAction.AGENTS_VIEW }, async (_req, _res, user) => {
    return agentService.list(user);
  }),
);

agentsRouter.get(
  "/:id",
  apiHandler({ action: PermissionAction.AGENTS_VIEW }, async (req, _res, user) => {
    return agentService.getById(user, String(req.params.id));
  }),
);

agentsRouter.post(
  "/",
  apiHandler({ action: PermissionAction.AGENTS_WRITE }, async (req, _res, user) => {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const agent = await agentService.create(user, parsed.data);
    await recordAudit(req, user, {
      action: "AGENT_CREATED",
      resourceType: "Agent",
      resourceId: agent.id,
      afterState: agent,
    });

    return agent;
  }),
);

agentsRouter.put(
  "/:id",
  apiHandler({ action: PermissionAction.AGENTS_WRITE }, async (req, _res, user) => {
    const parsed = updateAgentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const id = String(req.params.id);
    const before = await agentService.getById(user, id);
    const agent = await agentService.update(user, id, parsed.data);

    await recordAudit(req, user, {
      action: "AGENT_UPDATED",
      resourceType: "Agent",
      resourceId: agent.id,
      beforeState: before,
      afterState: agent,
    });

    return agent;
  }),
);

agentsRouter.post(
  "/:id/rag/presign",
  apiHandler({ action: PermissionAction.AGENTS_WRITE }, async (req, _res, user) => {
    const parsed = presignRagDocumentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    return ragDocumentService.presign(user, String(req.params.id), parsed.data);
  }),
);

agentsRouter.get(
  "/:id/rag/documents",
  apiHandler({ action: PermissionAction.AGENTS_VIEW }, async (req, _res, user) => {
    return ragDocumentService.list(user, String(req.params.id));
  }),
);

agentsRouter.post(
  "/:id/rag/documents",
  apiHandler({ action: PermissionAction.AGENTS_WRITE }, async (req, _res, user) => {
    const parsed = createRagDocumentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const agentId = String(req.params.id);
    const document = await ragDocumentService.create(user, agentId, parsed.data);

    await recordAudit(req, user, {
      action: "RAG_DOCUMENT_CREATED",
      resourceType: "RagDocument",
      resourceId: document.id,
      afterState: document,
    });

    return document;
  }),
);

agentsRouter.delete(
  "/:id/rag/documents/:documentId",
  apiHandler({ action: PermissionAction.AGENTS_WRITE }, async (req, _res, user) => {
    await ragDocumentService.delete(user, String(req.params.id), String(req.params.documentId));
    return { deleted: true };
  }),
);
