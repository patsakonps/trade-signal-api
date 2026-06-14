import { ema, ohlc4 } from "./ema";
import type { IndicatorInput, IndicatorResult, SignalName, ZoneName } from "./types";

export const CDC_ACTION_ZONE_KEY = "CDC_ACTION_ZONE";

export const defaultCdcParams = {
  source: "ohlc4",
  apPeriod: 2,
  shortPeriod: 12,
  longPeriod: 26
};

function toNumberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveZone(bullish: boolean, bearish: boolean, ap: number, fast: number): ZoneName {
  const green = bullish && ap > fast;
  const red = bearish && ap < fast;
  const yellow = bullish && ap < fast;
  const blue = bearish && ap > fast;

  if (green) return "GREEN";
  if (red) return "RED";
  if (yellow) return "YELLOW";
  if (blue) return "BLUE";
  return "WHITE";
}

export function calculateCdcActionZone(input: IndicatorInput): IndicatorResult {
  const { candles, symbol, timeframe } = input;

  if (candles.length < 3) {
    throw new Error("CDC Action Zone needs at least 3 candles");
  }

  const params = { ...defaultCdcParams, ...(input.params ?? {}) };
  const apPeriod = toNumberParam(params.apPeriod, defaultCdcParams.apPeriod);
  const shortPeriod = toNumberParam(params.shortPeriod, defaultCdcParams.shortPeriod);
  const longPeriod = toNumberParam(params.longPeriod, defaultCdcParams.longPeriod);

  const src = ohlc4(candles);
  const ap = ema(src, apPeriod);
  const fast = ema(ap, shortPeriod);
  const slow = ema(ap, longPeriod);

  const series = candles.map((candle, index) => {
    const bullish = fast[index] > slow[index];
    const bearish = fast[index] < slow[index];
    const previousBullish = index > 0 ? fast[index - 1] > slow[index - 1] : false;
    const previousBearish = index > 0 ? fast[index - 1] < slow[index - 1] : false;

    const buy = bullish && previousBearish;
    const sell = bearish && previousBullish;
    const signal: SignalName = buy ? "BUY" : sell ? "SELL" : "HOLD";
    const zone = resolveZone(bullish, bearish, ap[index], fast[index]);

    return {
      time: candle.openTime,
      closeTime: candle.closeTime,
      price: candle.close,
      zone,
      signal,
      color: zone,
      values: {
        AP: ap[index],
        Fast: fast[index],
        Slow: slow[index],
        Bullish: bullish,
        Bearish: bearish
      }
    };
  });

  const latest = series[series.length - 1];

  return {
    indicatorKey: CDC_ACTION_ZONE_KEY,
    symbol,
    timeframe,
    latest,
    series,
    alerts: [
      { name: "Buy Signal", triggered: latest.signal === "BUY", message: "Buy" },
      { name: "Sell Signal", triggered: latest.signal === "SELL", message: "Sell" }
    ]
  };
}
