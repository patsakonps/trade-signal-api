import axios from "axios";
import { env } from "../../config/env";
import type { Candle } from "./market.types";

const allowedIntervals = new Set([
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"
]);

export class BinanceClient {
  async getKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    if (!allowedIntervals.has(interval)) {
      throw new Error(`Unsupported timeframe: ${interval}`);
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    const safeLimit = Math.min(Math.max(limit, 50), 1000);

    const response = await axios.get(`${env.BINANCE_BASE_URL}/api/v3/klines`, {
      params: {
        symbol: normalizedSymbol,
        interval,
        limit: safeLimit
      },
      timeout: 10_000
    });

    return response.data.map((item: unknown[]) => ({
      openTime: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: Number(item[6])
    }));
  }
}

export const binanceClient = new BinanceClient();
