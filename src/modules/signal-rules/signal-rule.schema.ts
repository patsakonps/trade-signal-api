import { z } from "zod";

export const createSignalRuleSchema = z.object({
  name: z.string().min(1).max(100),
  exchange: z.string().default("BINANCE"),
  symbol: z.string().min(3).max(30).transform((value) => value.toUpperCase()),
  timeframe: z.string().min(1).max(10).default("4h"),
  indicatorType: z.enum(["BUILT_IN", "CUSTOM_SCRIPT"]).default("BUILT_IN"),
  indicatorKey: z.string().min(2).max(80),
  indicatorTemplateId: z.string().optional().nullable(),
  condition: z.string().min(1).max(60).default("BUY_OR_SELL"),
  enabled: z.boolean().default(true),
  paramsJson: z.record(z.unknown()).default({})
});

export const updateSignalRuleSchema = createSignalRuleSchema.partial();
