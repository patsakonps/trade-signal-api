import { z } from "zod";

const optionalPercentSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().min(0).max(100).optional()
);

export const backtestRequestSchema = z.object({
  ruleId: z.string().trim().min(1),
  candlesLimit: z.coerce.number().int().min(80).max(1000).default(500),
  initialCapital: z.coerce.number().positive().max(1_000_000_000).default(10_000),
  positionSizePct: z.coerce.number().positive().max(100).default(20),
  feePct: z.coerce.number().min(0).max(5).default(0.1),
  slippagePct: z.coerce.number().min(0).max(5).default(0.05),
  stopLossPct: optionalPercentSchema,
  takeProfitPct: optionalPercentSchema,
  tradeMode: z.enum(["LONG_ONLY", "LONG_SHORT"]).default("LONG_ONLY")
});

export const compareRequestSchema = backtestRequestSchema.omit({ ruleId: true }).extend({
  ruleIds: z.array(z.string().trim().min(1)).max(30).optional()
});

export type BacktestRequest = z.infer<typeof backtestRequestSchema>;
export type CompareRequest = z.infer<typeof compareRequestSchema>;
