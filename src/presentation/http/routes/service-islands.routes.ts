import { Router } from "express";
import { z } from "zod";
import { queueService } from "../../../application/queue/queue-service";
import { createQueueSchema, upsertQueueSchema } from "../../../application/queue/queue-validation";
import { serviceIslandService } from "../../../application/service-island/service-island-service";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

export const serviceIslandsRouter = Router();
const queuesRouter = Router({ mergeParams: true });

const renameSchema = z.object({ name: z.string().trim().min(1) });

serviceIslandsRouter.get(
  "/",
  apiHandler({ action: PermissionAction.SERVICE_ISLANDS_VIEW }, async (_req, _res, user) => {
    return serviceIslandService.list(user);
  }),
);

serviceIslandsRouter.get(
  "/:id",
  apiHandler({ action: PermissionAction.SERVICE_ISLANDS_VIEW }, async (req, _res, user) => {
    return serviceIslandService.getById(user, String(req.params.id));
  }),
);

serviceIslandsRouter.get(
  "/:id/tickets",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    return serviceIslandService.listTickets(user, String(req.params.id));
  }),
);

serviceIslandsRouter.put(
  "/:id",
  apiHandler({ action: PermissionAction.SERVICE_ISLANDS_WRITE }, async (req, _res, user) => {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const id = String(req.params.id);
    const before = await serviceIslandService.getById(user, id);
    const island = await serviceIslandService.rename(user, id, parsed.data.name);

    await recordAudit(req, user, {
      action: "SERVICE_ISLAND_RENAMED",
      resourceType: "ServiceIsland",
      resourceId: island.id,
      beforeState: before,
      afterState: island,
    });

    return island;
  }),
);

queuesRouter.get(
  "/",
  apiHandler({ action: PermissionAction.QUEUES_VIEW }, async (req, _res, user) => {
    return queueService.list(user, String(req.params.id));
  }),
);

queuesRouter.get(
  "/:queueId",
  apiHandler({ action: PermissionAction.QUEUES_VIEW }, async (req, _res, user) => {
    return queueService.getById(user, String(req.params.id), String(req.params.queueId));
  }),
);

queuesRouter.post(
  "/",
  apiHandler({ action: PermissionAction.QUEUES_WRITE }, async (req, _res, user) => {
    const parsed = createQueueSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const queue = await queueService.create(user, String(req.params.id), parsed.data);
    await recordAudit(req, user, {
      action: "QUEUE_CREATED",
      resourceType: "Queue",
      resourceId: queue.id,
      afterState: queue,
    });

    return queue;
  }),
);

queuesRouter.put(
  "/:queueId",
  apiHandler({ action: PermissionAction.QUEUES_WRITE }, async (req, _res, user) => {
    const parsed = upsertQueueSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const serviceIslandId = String(req.params.id);
    const queueId = String(req.params.queueId);
    const before = await queueService.getById(user, serviceIslandId, queueId);
    const queue = await queueService.update(user, serviceIslandId, queueId, parsed.data);

    await recordAudit(req, user, {
      action: "QUEUE_UPDATED",
      resourceType: "Queue",
      resourceId: queue.id,
      beforeState: before,
      afterState: queue,
    });

    return queue;
  }),
);

serviceIslandsRouter.use("/:id/queues", queuesRouter);
