import { z } from "zod";

export const indicatorTemplateCreateSchema = z.object({
  name: z.string().min(1).max(80),
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscore only"),
  script: z.string().min(20),
  paramsJson: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true)
});

export const indicatorTemplateUpdateSchema = indicatorTemplateCreateSchema.partial().extend({
  key: indicatorTemplateCreateSchema.shape.key.optional()
});
