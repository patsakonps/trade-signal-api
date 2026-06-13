import { env } from "../../config/env";
import { binanceClient } from "./binance.client";
import type { Candle } from "./market.types";

type CacheEntry = {
  expiresAt: number;
  candles: Candle[];
};

const cache = new Map<string, CacheEntry>();

export class MarketService {
  async getCandles(symbol: string, timeframe: string, limit = 200): Promise<Candle[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 50), 1000);
    const key = `${normalizedSymbol}:${timeframe}:${safeLimit}`;
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.candles;
    }

    const candles = await binanceClient.getKlines(normalizedSymbol, timeframe, safeLimit);
    cache.set(key, { candles, expiresAt: now + env.MARKET_CACHE_TTL_MS });
    return candles;
  }
}

export const marketService = new MarketService();
