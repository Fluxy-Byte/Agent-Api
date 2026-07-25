import { Router } from "express";
import { targetService } from "../../../application/target/target-service";
import { historyQuerySchema, listTargetsQuerySchema } from "../../../application/target/target-validation";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";

export const targetsRouter = Router();

targetsRouter.get(
  "/",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    const parsed = listTargetsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Filtros inválidos.", parsed.error.flatten());

    return targetService.list(user, parsed.data);
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
