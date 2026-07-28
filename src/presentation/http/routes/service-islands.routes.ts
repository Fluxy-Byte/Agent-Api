import { Router } from "express";
import { z } from "zod";
import { queueService } from "../../../application/queue/queue-service";
import { createQueueSchema, upsertQueueSchema } from "../../../application/queue/queue-validation";
import { serviceIslandService } from "../../../application/service-island/service-island-service";
import { serviceIslandTagService } from "../../../application/service-island-tag/service-island-tag-service";
import { upsertServiceIslandTagSchema } from "../../../application/service-island-tag/service-island-tag-validation";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

export const serviceIslandsRouter = Router();
const queuesRouter = Router({ mergeParams: true });
const tagsRouter = Router({ mergeParams: true });

const renameSchema = z.object({ name: z.string().trim().min(1), requireCloseTag: z.boolean().optional() });

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
    const island = await serviceIslandService.rename(user, id, parsed.data.name, parsed.data.requireCloseTag);

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

tagsRouter.get(
  "/",
  apiHandler({ action: PermissionAction.QUEUES_VIEW }, async (req, _res, user) => {
    return serviceIslandTagService.list(user, String(req.params.id));
  }),
);

tagsRouter.post(
  "/",
  apiHandler({ action: PermissionAction.QUEUES_WRITE }, async (req, _res, user) => {
    const parsed = upsertServiceIslandTagSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const tag = await serviceIslandTagService.create(user, String(req.params.id), parsed.data);
    await recordAudit(req, user, {
      action: "SERVICE_ISLAND_TAG_CREATED",
      resourceType: "TicketCloseTag",
      resourceId: tag.id,
      afterState: tag,
    });

    return tag;
  }),
);

tagsRouter.put(
  "/:tagId",
  apiHandler({ action: PermissionAction.QUEUES_WRITE }, async (req, _res, user) => {
    const parsed = upsertServiceIslandTagSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const serviceIslandId = String(req.params.id);
    const tagId = String(req.params.tagId);
    const before = await serviceIslandTagService.getById(user, serviceIslandId, tagId);
    const tag = await serviceIslandTagService.update(user, serviceIslandId, tagId, parsed.data);

    await recordAudit(req, user, {
      action: "SERVICE_ISLAND_TAG_UPDATED",
      resourceType: "TicketCloseTag",
      resourceId: tag.id,
      beforeState: before,
      afterState: tag,
    });

    return tag;
  }),
);

tagsRouter.delete(
  "/:tagId",
  apiHandler({ action: PermissionAction.QUEUES_WRITE }, async (req, _res, user) => {
    const serviceIslandId = String(req.params.id);
    const tagId = String(req.params.tagId);
    const before = await serviceIslandTagService.getById(user, serviceIslandId, tagId);
    const tag = await serviceIslandTagService.remove(user, serviceIslandId, tagId);

    await recordAudit(req, user, {
      action: "SERVICE_ISLAND_TAG_DELETED",
      resourceType: "TicketCloseTag",
      resourceId: tag.id,
      beforeState: before,
    });

    return tag;
  }),
);

serviceIslandsRouter.use("/:id/queues", queuesRouter);
serviceIslandsRouter.use("/:id/tags", tagsRouter);
