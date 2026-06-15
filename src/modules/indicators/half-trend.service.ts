import type { Candle } from "../market/market.types";
import type { IndicatorInput, IndicatorResult, SignalName, ZoneName } from "./types";

export const HALF_TREND_KEY = "HALF_TREND";

export const defaultHalfTrendParams = {
  amplitude: 2,
  channelDeviation: 2,
  atrPeriod: 100
};

function toNumberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function highest(values: number[]): number {
  return Math.max(...values);
}

function lowest(values: number[]): number {
  return Math.min(...values);
}

function trueRange(current: Candle, previous?: Candle): number {
  if (!previous) return current.high - current.low;
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function calculateAtrValues(candles: Candle[], period: number): Array<number | null> {
  const trueRanges = candles.map((candle, index) => trueRange(candle, candles[index - 1]));
  const atrValues: Array<number | null> = Array(candles.length).fill(null);

  for (let index = period - 1; index < candles.length; index += 1) {
    atrValues[index] = average(trueRanges.slice(index - period + 1, index + 1));
  }

  return atrValues;
}

function formatValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(8));
}

export function calculateHalfTrend(input: IndicatorInput): IndicatorResult {
  const { candles, symbol, timeframe } = input;
  const params = { ...defaultHalfTrendParams, ...(input.params ?? {}) };
  const amplitude = Math.max(2, Math.round(toNumberParam(params.amplitude, defaultHalfTrendParams.amplitude)));
  const channelDeviation = toNumberParam(params.channelDeviation, defaultHalfTrendParams.channelDeviation);
  const atrPeriod = Math.max(2, Math.round(toNumberParam(params.atrPeriod, defaultHalfTrendParams.atrPeriod)));
  const minCandles = Math.max(atrPeriod + amplitude + 5, 50);

  if (candles.length < minCandles) {
    throw new Error(`HalfTrend needs at least ${minCandles} candles`);
  }

  const atrValues = calculateAtrValues(candles, atrPeriod);

  let trend: "UP" | "DOWN" = candles[1].close >= candles[0].close ? "UP" : "DOWN";
  let previousTrend: "UP" | "DOWN" = trend;
  let nextTrend: "UP" | "DOWN" = trend === "UP" ? "DOWN" : "UP";
  let maxLowPrice = candles[0].low;
  let minHighPrice = candles[0].high;
  let halfTrendLine = candles[0].close;

  const series = candles.map((candle, index) => {
    if (index >= amplitude) {
      const window = candles.slice(index - amplitude + 1, index + 1);
      const highPrice = highest(window.map((item) => item.high));
      const lowPrice = lowest(window.map((item) => item.low));
      const highMa = average(window.map((item) => item.high));
      const lowMa = average(window.map((item) => item.low));
      const previousCandle = candles[index - 1];

      previousTrend = trend;

      if (nextTrend === "DOWN") {
        maxLowPrice = Math.max(lowPrice, maxLowPrice);
        if (highMa < maxLowPrice && candle.close < previousCandle.low) {
          trend = "DOWN";
          nextTrend = "UP";
          minHighPrice = highPrice;
        }
      } else {
        minHighPrice = Math.min(highPrice, minHighPrice);
        if (lowMa > minHighPrice && candle.close > previousCandle.high) {
          trend = "UP";
          nextTrend = "DOWN";
          maxLowPrice = lowPrice;
        }
      }

      halfTrendLine = trend === "UP" ? maxLowPrice : minHighPrice;
    }

    const signal: SignalName = previousTrend !== trend ? (trend === "UP" ? "BUY" : "SELL") : "HOLD";
    const zone: ZoneName = trend === "UP" ? "GREEN" : "RED";
    const atr = atrValues[index];
    const atrOffset = atr === null ? null : atr * channelDeviation;

    return {
      time: candle.openTime,
      closeTime: candle.closeTime,
      price: candle.close,
      zone,
      signal,
      color: zone,
      values: {
        HalfTrend: formatValue(halfTrendLine),
        Trend: trend,
        ATR: formatValue(atr),
        ATRHigh: atrOffset === null ? null : formatValue(halfTrendLine + atrOffset),
        ATRLow: atrOffset === null ? null : formatValue(halfTrendLine - atrOffset),
        Amplitude: amplitude,
        ChannelDeviation: channelDeviation,
        AtrPeriod: atrPeriod
      }
    };
  });

  const latest = series[series.length - 1];

  return {
    indicatorKey: HALF_TREND_KEY,
    symbol,
    timeframe,
    latest,
    series,
    alerts: [
      { name: "Buy Signal", triggered: latest.signal === "BUY", message: "HalfTrend flipped up" },
      { name: "Sell Signal", triggered: latest.signal === "SELL", message: "HalfTrend flipped down" }
    ]
  };
}
