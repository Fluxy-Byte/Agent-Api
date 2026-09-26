import { Router } from "express";
import { carteiraService } from "../../../application/carteira/carteira-service";
import { setTargetCarteirasSchema } from "../../../application/carteira/carteira-validation";
import { targetService } from "../../../application/target/target-service";
import {
  createTargetSchema,
  historyQuerySchema,
  listTargetsFilterSchema,
  listTargetsQuerySchema,
  updateBlockedAgentsSchema,
  updateMetadataSchema,
} from "../../../application/target/target-validation";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

export const targetsRouter = Router();

targetsRouter.get(
  "/",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    const parsed = listTargetsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Filtros inválidos.", parsed.error.flatten());

    return targetService.list(user, parsed.data);
  }),
);

// Precisa vir ANTES de "/:id", senão o Express casaria "stats"/"metadata-keys" como id.
targetsRouter.get(
  "/stats",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    const parsed = listTargetsFilterSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Filtros inválidos.", parsed.error.flatten());

    return targetService.getStats(user, parsed.data);
  }),
);

targetsRouter.get(
  "/metadata-keys",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (_req, _res, user) => {
    return targetService.getMetadataKeys(user);
  }),
);

targetsRouter.post(
  "/",
  apiHandler({ action: PermissionAction.CONTACTS_WRITE }, async (req, _res, user) => {
    const parsed = createTargetSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const target = await targetService.create(user, parsed.data);
    await recordAudit(req, user, {
      action: "TARGET_CREATED",
      resourceType: "Target",
      resourceId: target.id,
      afterState: target,
    });

    return target;
  }),
);

targetsRouter.get(
  "/:id",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    return targetService.getById(user, String(req.params.id));
  }),
);

targetsRouter.get(
  "/:id/history",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Filtros inválidos.", parsed.error.flatten());

    return targetService.getHistory(user, String(req.params.id), parsed.data);
  }),
);

targetsRouter.post(
  "/:id/crm-card",
  apiHandler({ action: PermissionAction.CONTACTS_WRITE }, async (req, _res, user) => {
    const card = await targetService.createCrmCard(user, String(req.params.id));
    await recordAudit(req, user, {
      action: "CRM_CARD_CREATED",
      resourceType: "CardCrm",
      resourceId: card.id,
      afterState: { targetId: card.targetId, stagesCrmId: card.stagesCrmId },
    });

    return card;
  }),
);

targetsRouter.patch(
  "/:id/blocked-agents",
  apiHandler({ action: PermissionAction.CONTACTS_WRITE }, async (req, _res, user) => {
    const parsed = updateBlockedAgentsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const targetId = String(req.params.id);
    const before = await targetService.getById(user, targetId);
    const target = await targetService.updateBlockedAgents(user, targetId, parsed.data);

    await recordAudit(req, user, {
      action: "TARGET_BLOCKED_AGENTS_UPDATED",
      resourceType: "Target",
      resourceId: target.id,
      beforeState: { blockedAgentIds: before.blockedAgentIds },
      afterState: { blockedAgentIds: target.blockedAgentIds },
    });

    return target;
  }),
);

targetsRouter.patch(
  "/:id/metadata",
  apiHandler({ action: PermissionAction.CONTACTS_WRITE }, async (req, _res, user) => {
    const parsed = updateMetadataSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const targetId = String(req.params.id);
    const before = await targetService.getById(user, targetId);
    const target = await targetService.updateMetadata(user, targetId, parsed.data);

    await recordAudit(req, user, {
      action: "TARGET_METADATA_UPDATED",
      resourceType: "Target",
      resourceId: target.id,
      beforeState: { metadata: before.metadata },
      afterState: { metadata: target.metadata },
    });

    return target;
  }),
);

targetsRouter.get(
  "/:id/carteiras",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    return carteiraService.listForTarget(user, String(req.params.id));
  }),
);

targetsRouter.put(
  "/:id/carteiras",
  apiHandler({ action: PermissionAction.CONTACTS_WRITE }, async (req, _res, user) => {
    const parsed = setTargetCarteirasSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const targetId = String(req.params.id);
    const carteiras = await carteiraService.setForTarget(user, targetId, parsed.data);
    await recordAudit(req, user, {
      action: "TARGET_CARTEIRAS_UPDATED",
      resourceType: "Target",
      resourceId: targetId,
      afterState: { carteiraIds: parsed.data.carteiraIds },
    });

    return carteiras;
  }),
);
