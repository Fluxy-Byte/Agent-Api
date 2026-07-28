import { z } from "zod";

export const upsertServiceIslandTagSchema = z.object({
  name: z.string().trim().min(1, "Nome da tag é obrigatório."),
});

export type UpsertServiceIslandTagInput = z.infer<typeof upsertServiceIslandTagSchema>;
