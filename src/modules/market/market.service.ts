import { env } from "../../config/env";
import { binanceClient } from "./binance.client";
import type { Candle } from "./market.types";
import { isNativeBinanceTimeframe, isSupportedTimeframe } from "./timeframes";

type CacheEntry = {
  expiresAt: number;
  candles: Candle[];
};

const cache = new Map<string, CacheEntry>();
const FORTY_FIVE_MINUTES_MS = 45 * 60 * 1000;
const DERIVED_45M_BASE_LIMIT_MULTIPLIER = 3;

function aggregateCandles(candles: Candle[], intervalMs: number, expectedCandlesPerBucket: number): Candle[] {
  const buckets = new Map<number, Candle[]>();

  for (const candle of candles) {
    const bucketOpenTime = Math.floor(candle.openTime / intervalMs) * intervalMs;
    const bucket = buckets.get(bucketOpenTime) ?? [];
    bucket.push(candle);
    buckets.set(bucketOpenTime, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .filter(([, bucket]) => bucket.length === expectedCandlesPerBucket)
    .map(([bucketOpenTime, bucket]) => {
      const sortedBucket = [...bucket].sort((left, right) => left.openTime - right.openTime);
      const first = sortedBucket[0];
      const last = sortedBucket[sortedBucket.length - 1];

      return {
        openTime: bucketOpenTime,
        open: first.open,
        high: Math.max(...sortedBucket.map((item) => item.high)),
        low: Math.min(...sortedBucket.map((item) => item.low)),
        close: last.close,
        volume: sortedBucket.reduce((sum, item) => sum + item.volume, 0),
        quoteVolume: sortedBucket.reduce((sum, item) => sum + (item.quoteVolume ?? 0), 0),
        closeTime: bucketOpenTime + intervalMs - 1,
        takerBuyBaseVolume: sortedBucket.reduce((sum, item) => sum + (item.takerBuyBaseVolume ?? 0), 0),
        takerBuyQuoteVolume: sortedBucket.reduce((sum, item) => sum + (item.takerBuyQuoteVolume ?? 0), 0)
      };
    });
}

export class MarketService {
  async getCandles(symbol: string, timeframe: string, limit = 200): Promise<Candle[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const normalizedTimeframe = timeframe.trim();
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 50), 1000);
    const key = `${normalizedSymbol}:${normalizedTimeframe}:${safeLimit}`;
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.candles;
    }

    if (!isSupportedTimeframe(normalizedTimeframe)) {
      throw new Error(`Unsupported timeframe: ${normalizedTimeframe}`);
    }

    let candles: Candle[];

    if (normalizedTimeframe === "45m") {
      const baseLimit = Math.min(safeLimit * DERIVED_45M_BASE_LIMIT_MULTIPLIER + 6, 1000);
      const baseCandles = await binanceClient.getKlines(normalizedSymbol, "15m", baseLimit);
      candles = aggregateCandles(baseCandles, FORTY_FIVE_MINUTES_MS, DERIVED_45M_BASE_LIMIT_MULTIPLIER).slice(-safeLimit);
    } else if (isNativeBinanceTimeframe(normalizedTimeframe)) {
      candles = await binanceClient.getKlines(normalizedSymbol, normalizedTimeframe, safeLimit);
    } else {
      throw new Error(`Unsupported timeframe: ${normalizedTimeframe}`);
    }

    cache.set(key, { candles, expiresAt: now + env.MARKET_CACHE_TTL_MS });
    return candles;
  }
}

export const marketService = new MarketService();
