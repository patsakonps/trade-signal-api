import { Router } from "express";
import { z } from "zod";
import { marketService } from "./market.service";

export const marketRoutes = Router();

const candleQuerySchema = z.object({
  timeframe: z.string().default("4h"),
  limit: z.coerce.number().int().min(50).max(1000).default(200)
});

marketRoutes.get("/:symbol/candles", async (req, res, next) => {
  try {
    const { timeframe, limit } = candleQuerySchema.parse(req.query);
    const symbol = req.params.symbol.toUpperCase();
    const candles = await marketService.getCandles(symbol, timeframe, limit);

    res.json({
      exchange: "BINANCE",
      symbol,
      timeframe,
      candles
    });
  } catch (error) {
    next(error);
  }
});
