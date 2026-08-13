import { Router } from "express";
import { targetService } from "../../../application/target/target-service";
import {
  createTargetSchema,
  historyQuerySchema,
  listTargetsFilterSchema,
  listTargetsQuerySchema,
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

// Precisa vir ANTES de "/:id", senão o Express casaria "stats" como id.
targetsRouter.get(
  "/stats",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    const parsed = listTargetsFilterSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Filtros inválidos.", parsed.error.flatten());

    return targetService.getStats(user, parsed.data);
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
