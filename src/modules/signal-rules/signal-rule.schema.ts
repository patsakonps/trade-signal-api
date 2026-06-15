import { z } from "zod";

import { supportedTimeframeSet } from "../market/timeframes";
const supportedConditions = new Set(["BUY_OR_SELL", "BUY", "SELL", "GREEN", "RED", "YELLOW", "BLUE", "WHITE", "ZONE_CHANGED", "OVERSOLD", "OVERBOUGHT"]);

export const createSignalRuleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  exchange: z.string().trim().default("BINANCE"),
  symbol: z.string().trim().min(3).max(30).transform((value) => value.toUpperCase()),
  timeframe: z.string().trim().default("4h").refine((value) => supportedTimeframeSet.has(value), "Unsupported timeframe"),
  indicatorType: z.enum(["BUILT_IN", "CUSTOM_SCRIPT"]).default("BUILT_IN"),
  indicatorKey: z.string().trim().min(2).max(80),
  indicatorTemplateId: z.string().trim().optional().nullable(),
  condition: z.string().trim().transform((value) => value.toUpperCase()).default("BUY_OR_SELL").refine((value) => supportedConditions.has(value), "Unsupported condition"),
  enabled: z.boolean().default(true),
  paramsJson: z.record(z.unknown()).default({})
});

export const updateSignalRuleSchema = createSignalRuleSchema.partial();
