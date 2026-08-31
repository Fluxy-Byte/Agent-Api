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

const renameSchema = z.object({
  name: z.string().trim().min(1),
  requireCloseTag: z.boolean().optional(),
  allowActiveDispatch: z.boolean().optional(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const TICKET_STATUS_VALUES = ["WAITING", "IN_PROGRESS", "CLOSED"] as const;
const ticketFilterSchema = z.object({
  /// Lista separada por vírgula, ex: "CLOSED" ou "WAITING,IN_PROGRESS".
  status: z
    .string()
    .optional()
    .transform((v) => v?.split(",").map((s) => s.trim()))
    .pipe(z.array(z.enum(TICKET_STATUS_VALUES)).optional()),
  search: z.string().trim().optional(),
  queueId: z.string().trim().optional(),
  assignedUserId: z.string().trim().optional(),
  closeTagId: z.string().trim().optional(),
  outcome: z.enum(["CONCLUDED", "CANCELED"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const listTicketsQuerySchema = paginationQuerySchema.merge(ticketFilterSchema);

const queueFilterSchema = z.object({
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

const listQueuesQuerySchema = paginationQuerySchema.merge(queueFilterSchema);

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
  "/:id/monitoring",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    return serviceIslandService.getMonitoring(user, String(req.params.id));
  }),
);

serviceIslandsRouter.get(
  "/:id/tickets",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    const parsed = listTicketsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Parâmetros inválidos.", parsed.error.flatten());

    return serviceIslandService.listTickets(user, String(req.params.id), parsed.data);
  }),
);

serviceIslandsRouter.get(
  "/:id/tickets/stats",
  apiHandler({ action: PermissionAction.CONTACTS_VIEW }, async (req, _res, user) => {
    const parsed = ticketFilterSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Parâmetros inválidos.", parsed.error.flatten());

    return serviceIslandService.getTicketStats(user, String(req.params.id), parsed.data);
  }),
);

serviceIslandsRouter.put(
  "/:id",
  apiHandler({ action: PermissionAction.SERVICE_ISLANDS_WRITE }, async (req, _res, user) => {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const id = String(req.params.id);
    const before = await serviceIslandService.getById(user, id);
    const island = await serviceIslandService.rename(
      user,
      id,
      parsed.data.name,
      parsed.data.requireCloseTag,
      parsed.data.allowActiveDispatch,
    );

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
    const parsed = listQueuesQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Parâmetros inválidos.", parsed.error.flatten());

    return queueService.list(user, String(req.params.id), parsed.data);
  }),
);

queuesRouter.get(
  "/stats",
  apiHandler({ action: PermissionAction.QUEUES_VIEW }, async (req, _res, user) => {
    return queueService.getStats(user, String(req.params.id));
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

queuesRouter.delete(
  "/:queueId",
  apiHandler({ action: PermissionAction.QUEUES_WRITE }, async (req, _res, user) => {
    const serviceIslandId = String(req.params.id);
    const queueId = String(req.params.queueId);
    const queue = await queueService.delete(user, serviceIslandId, queueId);

    await recordAudit(req, user, {
      action: "QUEUE_DELETED",
      resourceType: "Queue",
      resourceId: queue.id,
      beforeState: queue,
    });

    return { deleted: true };
  }),
);

tagsRouter.get(
  "/",
  apiHandler({ action: PermissionAction.QUEUES_VIEW }, async (req, _res, user) => {
    const parsed = paginationQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Parâmetros inválidos.", parsed.error.flatten());

    return serviceIslandTagService.list(user, String(req.params.id), parsed.data);
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
