import { z } from "zod";

export const reportOverviewFilterSchema = z.object({
  whatsappChannelId: z.string().trim().optional(),
});

export type ReportOverviewFilter = z.infer<typeof reportOverviewFilterSchema>;
