import { z } from "zod";

export const createWatchlistItemSchema = z.object({
  exchange: z.string().default("BINANCE"),
  symbol: z.string().min(3).max(30).transform((value) => value.toUpperCase()),
  timeframe: z.string().min(1).max(10).default("4h")
});
