import { Router } from "express";
import { reportService } from "../../../application/report/report-service";
import { reportOverviewFilterSchema } from "../../../application/report/report-validation";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";

export const reportsRouter = Router();

reportsRouter.get(
  "/overview",
  apiHandler({ action: PermissionAction.REPORTS_VIEW }, async (req, _res, user) => {
    const parsed = reportOverviewFilterSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Filtro inválido.", parsed.error.flatten());

    return reportService.getOverview(user, parsed.data);
  }),
);
