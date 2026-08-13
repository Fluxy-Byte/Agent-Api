import { Router } from "express";
import { ticketService } from "../../../application/ticket/ticket-service";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { apiHandler } from "../middlewares/api-handler";

export const ticketsRouter = Router();

ticketsRouter.get(
  "/:id",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    return ticketService.getById(user, String(req.params.id));
  }),
);
