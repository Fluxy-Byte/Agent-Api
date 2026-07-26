import { Router } from "express";
import { whatsappChannelService } from "../../../application/whatsapp-channel/whatsapp-channel-service";
import {
  bulkCreateWhatsappChannelSchema,
  createWhatsappChannelSchema,
  updateWhatsappChannelSchema,
  wabaLookupSchema,
} from "../../../application/whatsapp-channel/whatsapp-channel-validation";
import { PermissionAction } from "../../../domain/enums/permission-action";
import { ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

export const whatsappChannelsRouter = Router();

whatsappChannelsRouter.get(
  "/",
  apiHandler({ action: PermissionAction.WABAS_VIEW }, async (_req, _res, user) => {
    return whatsappChannelService.list(user);
  }),
);

whatsappChannelsRouter.get(
  "/:id",
  apiHandler({ action: PermissionAction.WABAS_VIEW }, async (req, _res, user) => {
    return whatsappChannelService.getById(user, String(req.params.id));
  }),
);

whatsappChannelsRouter.post(
  "/",
  apiHandler({ action: PermissionAction.WABAS_WRITE }, async (req, _res, user) => {
    const parsed = createWhatsappChannelSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const channel = await whatsappChannelService.create(user, parsed.data);
    await recordAudit(req, user, {
      action: "WHATSAPP_CHANNEL_CREATED",
      resourceType: "WhatsappChannel",
      resourceId: channel.id,
      afterState: channel,
    });

    return channel;
  }),
);

whatsappChannelsRouter.post(
  "/waba-lookup",
  apiHandler({ action: PermissionAction.WABAS_WRITE }, async (req) => {
    const parsed = wabaLookupSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    return whatsappChannelService.lookupWaba(parsed.data.wabaId);
  }),
);

whatsappChannelsRouter.post(
  "/bulk",
  apiHandler({ action: PermissionAction.WABAS_WRITE }, async (req, _res, user) => {
    const parsed = bulkCreateWhatsappChannelSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const result = await whatsappChannelService.bulkCreate(user, parsed.data);

    for (const channel of result.created) {
      await recordAudit(req, user, {
        action: "WHATSAPP_CHANNEL_CREATED",
        resourceType: "WhatsappChannel",
        resourceId: channel.id,
        afterState: channel,
      });
    }

    return result;
  }),
);

whatsappChannelsRouter.put(
  "/:id",
  apiHandler({ action: PermissionAction.WABAS_WRITE }, async (req, _res, user) => {
    const parsed = updateWhatsappChannelSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const id = String(req.params.id);
    const before = await whatsappChannelService.getById(user, id);
    const channel = await whatsappChannelService.update(user, id, parsed.data);

    await recordAudit(req, user, {
      action: "WHATSAPP_CHANNEL_UPDATED",
      resourceType: "WhatsappChannel",
      resourceId: channel.id,
      beforeState: before,
      afterState: channel,
    });

    return channel;
  }),
);
