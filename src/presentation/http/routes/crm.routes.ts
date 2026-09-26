import { Router } from "express";
import { crmFunnelService } from "../../../application/crm/crm-funnel-service";
import { crmService } from "../../../application/crm/crm-service";
import {
  addAttachmentSchema,
  createCommentSchema,
  createStageSchema,
  funnelFieldSchema,
  moveCardSchema,
  presignAttachmentSchema,
  updatePrioritySchema,
  updateStageSchema,
} from "../../../application/crm/crm-validation";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

export const crmRouter = Router();

crmRouter.get(
  "/",
  apiHandler({ action: PermissionAction.CRM_VIEW }, async (_req, _res, user) => {
    return crmService.getBoard(user);
  }),
);

crmRouter.post(
  "/stages",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = createStageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const stage = await crmService.createStage(user, parsed.data);
    await recordAudit(req, user, {
      action: "CRM_STAGE_CREATED",
      resourceType: "StagesCrm",
      resourceId: stage.id,
      afterState: stage,
    });

    return stage;
  }),
);

crmRouter.patch(
  "/stages/:id",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = updateStageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const stage = await crmService.updateStage(user, String(req.params.id), parsed.data);
    await recordAudit(req, user, {
      action: "CRM_STAGE_UPDATED",
      resourceType: "StagesCrm",
      resourceId: stage.id,
      afterState: { nameStage: stage.nameStage },
    });

    return stage;
  }),
);

crmRouter.delete(
  "/stages/:id",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const stage = await crmService.deleteStage(user, String(req.params.id));
    await recordAudit(req, user, {
      action: "CRM_STAGE_DELETED",
      resourceType: "StagesCrm",
      resourceId: stage.id,
      beforeState: stage,
    });

    return stage;
  }),
);

crmRouter.get(
  "/cards/:id",
  apiHandler({ action: PermissionAction.CRM_VIEW }, async (req, _res, user) => {
    return crmService.getCard(user, String(req.params.id));
  }),
);

crmRouter.patch(
  "/cards/:id/priority",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = updatePrioritySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const before = await crmService.findCard(user, String(req.params.id));
    const card = await crmService.updatePriority(user, before.id, parsed.data);
    await recordAudit(req, user, {
      action: "CRM_CARD_PRIORITY_UPDATED",
      resourceType: "CardCrm",
      resourceId: card.id,
      beforeState: { statusPriority: before.statusPriority },
      afterState: { statusPriority: card.statusPriority },
    });

    return { id: card.id, statusPriority: card.statusPriority };
  }),
);

crmRouter.post(
  "/cards/:id/attachments/presign",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = presignAttachmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    return crmService.presignAttachment(user, String(req.params.id), parsed.data);
  }),
);

crmRouter.post(
  "/cards/:id/attachments",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = addAttachmentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const card = await crmService.addAttachment(user, String(req.params.id), parsed.data);
    await recordAudit(req, user, {
      action: "CRM_CARD_ATTACHMENT_ADDED",
      resourceType: "CardCrm",
      resourceId: card.id,
      afterState: { s3Key: parsed.data.s3Key },
    });

    return { id: card.id, attachments: card.attachments };
  }),
);

// Comentar só exige poder ver o CRM — qualquer usuário com acesso ao card.
crmRouter.post(
  "/cards/:id/comments",
  apiHandler({ action: PermissionAction.CRM_VIEW }, async (req, _res, user) => {
    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    return crmService.addComment(user, String(req.params.id), parsed.data);
  }),
);

crmRouter.patch(
  "/cards/:id/move",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = moveCardSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const card = await crmService.moveCard(user, String(req.params.id), parsed.data);
    await recordAudit(req, user, {
      action: "CRM_CARD_MOVED",
      resourceType: "CardCrm",
      resourceId: card.id,
      afterState: { stagesCrmId: card.stagesCrmId },
    });

    return card;
  }),
);

// ---------- FUNIL DE CONVERSÕES ----------

crmRouter.get(
  "/funnel",
  apiHandler({ action: PermissionAction.CRM_VIEW }, async (_req, _res, user) => {
    return crmFunnelService.getFunnel(user);
  }),
);

crmRouter.post(
  "/funnel/fields",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = funnelFieldSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const field = await crmFunnelService.createField(user, parsed.data);
    await recordAudit(req, user, {
      action: "CRM_FUNNEL_FIELD_CREATED",
      resourceType: "FieldsFunil",
      resourceId: field.id,
      afterState: field,
    });

    return field;
  }),
);

crmRouter.patch(
  "/funnel/fields/:id",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const parsed = funnelFieldSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const field = await crmFunnelService.updateField(user, String(req.params.id), parsed.data);
    await recordAudit(req, user, {
      action: "CRM_FUNNEL_FIELD_UPDATED",
      resourceType: "FieldsFunil",
      resourceId: field.id,
      afterState: field,
    });

    return field;
  }),
);

crmRouter.delete(
  "/funnel/fields/:id",
  apiHandler({ action: PermissionAction.CRM_WRITE }, async (req, _res, user) => {
    const field = await crmFunnelService.deleteField(user, String(req.params.id));
    await recordAudit(req, user, {
      action: "CRM_FUNNEL_FIELD_DELETED",
      resourceType: "FieldsFunil",
      resourceId: field.id,
      beforeState: field,
    });

    return field;
  }),
);

crmRouter.get(
  "/funnel/fields/:id/targets",
  apiHandler({ action: PermissionAction.CRM_VIEW }, async (req, _res, user) => {
    return crmFunnelService.getFieldTargets(user, String(req.params.id));
  }),
);
