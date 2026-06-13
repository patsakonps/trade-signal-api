import { z } from "zod";

export const telegramSettingSchema = z.object({
  chatId: z.string().trim().min(1).max(80).optional().nullable(),
  enabled: z.boolean().default(false)
});

export const telegramTestSchema = z.object({
  chatId: z.string().trim().min(1).max(80).optional()
});
