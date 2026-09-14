import { Router } from "express";
import { reportService } from "../../../application/report/report-service";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { apiHandler } from "../middlewares/api-handler";

export const reportsRouter = Router();

reportsRouter.get(
  "/overview",
  apiHandler({ action: PermissionAction.REPORTS_VIEW }, async (_req, _res, user) => {
    return reportService.getOverview(user);
  }),
);
