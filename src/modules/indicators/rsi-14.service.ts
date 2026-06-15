import { neutralOpinion, opinion } from "./opinion";
import type { IndicatorInput, IndicatorResult, SignalName, ZoneName, NormalizedOpinion } from "./types";

export const RSI_14_KEY = "RSI_14";

export const defaultRsi14Params = {
  period: 14,
  overbought: 70,
  oversold: 30
};

function toNumberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveZone(rsi: number | null, overbought: number, oversold: number): ZoneName {
  if (rsi === null) return "WHITE";
  if (rsi >= overbought) return "YELLOW";
  if (rsi <= oversold) return "BLUE";
  return rsi >= 50 ? "GREEN" : "RED";
}

function formatValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(4));
}

function resolveState(rsi: number | null, overbought: number, oversold: number): string {
  if (rsi === null) return "WAITING";
  if (rsi >= overbought) return "OVERBOUGHT";
  if (rsi <= oversold) return "OVERSOLD";
  return rsi >= 50 ? "ABOVE_50" : "BELOW_50";
}

function resolveOpinion(rsi: number | null, overbought: number, oversold: number): NormalizedOpinion {
  if (rsi === null) return neutralOpinion("RSI is still waiting for enough closed candles");
  if (rsi <= oversold) return opinion("BUY", "STRONG", `RSI ${rsi.toFixed(2)} is oversold at or below ${oversold}`);
  if (rsi >= overbought) return opinion("SELL", "STRONG", `RSI ${rsi.toFixed(2)} is overbought at or above ${overbought}`);
  return neutralOpinion(`RSI ${rsi.toFixed(2)} is between ${oversold} and ${overbought}`);
}

function calculateRsiValues(closes: number[], period: number): Array<number | null> {
  const rsiValues: Array<number | null> = Array(closes.length).fill(null);
  if (closes.length <= period) return rsiValues;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  for (let i = period; i < closes.length; i += 1) {
    if (i > period) {
      const change = closes[i] - closes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      averageGain = (averageGain * (period - 1) + gain) / period;
      averageLoss = (averageLoss * (period - 1) + loss) / period;
    }

    if (averageLoss === 0) {
      rsiValues[i] = 100;
    } else if (averageGain === 0) {
      rsiValues[i] = 0;
    } else {
      const rs = averageGain / averageLoss;
      rsiValues[i] = 100 - 100 / (1 + rs);
    }
  }

  return rsiValues;
}

export function calculateRsi14(input: IndicatorInput): IndicatorResult {
  const { candles, symbol, timeframe } = input;
  const params = { ...defaultRsi14Params, ...(input.params ?? {}) };
  const period = Math.max(2, Math.round(toNumberParam(params.period, defaultRsi14Params.period)));
  const overbought = toNumberParam(params.overbought, defaultRsi14Params.overbought);
  const oversold = toNumberParam(params.oversold, defaultRsi14Params.oversold);

  if (candles.length <= period + 1) {
    throw new Error(`RSI needs at least ${period + 2} candles`);
  }

  const closes = candles.map((candle) => candle.close);
  const rsiValues = calculateRsiValues(closes, period);

  const series = candles.map((candle, index) => {
    const rsi = rsiValues[index];
    const previousRsi = index > 0 ? rsiValues[index - 1] : null;
    const buy = previousRsi !== null && rsi !== null && previousRsi <= oversold && rsi > oversold;
    const sell = previousRsi !== null && rsi !== null && previousRsi >= overbought && rsi < overbought;
    const signal: SignalName = buy ? "BUY" : sell ? "SELL" : "HOLD";
    const zone = resolveZone(rsi, overbought, oversold);

    return {
      time: candle.openTime,
      closeTime: candle.closeTime,
      price: candle.close,
      zone,
      signal,
      color: zone,
      opinion: resolveOpinion(rsi, overbought, oversold),
      values: {
        RSI: formatValue(rsi),
        State: resolveState(rsi, overbought, oversold),
        Period: period,
        Overbought: overbought,
        Oversold: oversold
      }
    };
  });

  const latest = series[series.length - 1];

  return {
    indicatorKey: RSI_14_KEY,
    symbol,
    timeframe,
    latest,
    series,
    alerts: [
      { name: "Buy Signal", triggered: latest.signal === "BUY", message: "RSI crossed back above oversold" },
      { name: "Sell Signal", triggered: latest.signal === "SELL", message: "RSI crossed back below overbought" },
      { name: "Oversold", triggered: latest.values.RSI !== null && Number(latest.values.RSI) <= oversold, message: "RSI is oversold" },
      { name: "Overbought", triggered: latest.values.RSI !== null && Number(latest.values.RSI) >= overbought, message: "RSI is overbought" }
    ]
  };
}
