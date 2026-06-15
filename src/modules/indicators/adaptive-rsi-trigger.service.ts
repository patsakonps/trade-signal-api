import { close, ema, ohlc4 } from "./ema";
import type { Candle } from "../market/market.types";
import type { IndicatorInput, IndicatorResult, SignalName, ZoneName } from "./types";

export const ADAPTIVE_RSI_TRIGGER_KEY = "ADAPTIVE_RSI_TRIGGER";

export const defaultAdaptiveRsiTriggerParams = {
  length: 15,
  power: 1,
  source: "close",
  overbought: 80,
  oversold: 20
};

function toNumberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveSource(candles: Candle[], source: unknown): number[] {
  const normalized = String(source ?? "close").trim().toLowerCase();

  if (normalized === "ohlc4") return ohlc4(candles);
  if (normalized === "hl2") return candles.map((candle) => (candle.high + candle.low) / 2);
  if (normalized === "hlc3") return candles.map((candle) => (candle.high + candle.low + candle.close) / 3);
  if (normalized === "open") return candles.map((candle) => candle.open);
  if (normalized === "high") return candles.map((candle) => candle.high);
  if (normalized === "low") return candles.map((candle) => candle.low);

  return close(candles);
}

function calculateRsiValues(values: number[], period: number): Array<number | null> {
  const rsiValues: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period) return rsiValues;

  let gainSum = 0;
  let lossSum = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  for (let index = period; index < values.length; index += 1) {
    if (index > period) {
      const change = values[index] - values[index - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      averageGain = (averageGain * (period - 1) + gain) / period;
      averageLoss = (averageLoss * (period - 1) + loss) / period;
    }

    if (averageLoss === 0) {
      rsiValues[index] = 100;
    } else if (averageGain === 0) {
      rsiValues[index] = 0;
    } else {
      const rs = averageGain / averageLoss;
      rsiValues[index] = 100 - 100 / (1 + rs);
    }
  }

  return rsiValues;
}

function emaNullable(values: Array<number | null>, period: number): Array<number | null> {
  const safePeriod = Math.max(1, Math.floor(period));
  const multiplier = 2 / (safePeriod + 1);
  const output: Array<number | null> = Array(values.length).fill(null);
  let previous: number | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null || !Number.isFinite(value)) {
      output[index] = previous;
      continue;
    }

    previous = previous === null ? value : value * multiplier + previous * (1 - multiplier);
    output[index] = previous;
  }

  return output;
}

function calculateAdaptiveAverage(source: number[], period: number, power: number): number[] {
  if (!source.length) return [];

  const ama: number[] = Array(source.length).fill(source[0]);
  const adaptiveInput: number[] = Array(source.length).fill(0);

  for (let index = 0; index < source.length; index += 1) {
    if (index === 0) {
      ama[index] = source[index];
      adaptiveInput[index] = 0;
      continue;
    }

    adaptiveInput[index] = source[index] - ama[index - 1];
    const alphaRsi = calculateRsiValues(adaptiveInput.slice(0, index + 1), period)[index];

    if (alphaRsi === null) {
      ama[index] = source[index];
      continue;
    }

    const alpha = Math.abs(alphaRsi / 100 - 0.5);
    const adaptivePower = Math.pow(alpha, power);
    ama[index] = ama[index - 1] + adaptivePower * (source[index] - ama[index - 1]);
  }

  return ama;
}

function resolveZone(rsi: number | null, trigger: number | null, overbought: number, oversold: number): ZoneName {
  if (rsi === null || trigger === null) return "WHITE";
  if (rsi >= overbought) return "YELLOW";
  if (rsi <= oversold) return "BLUE";
  return rsi >= trigger ? "GREEN" : "RED";
}

function resolveState(rsi: number | null, trigger: number | null, overbought: number, oversold: number): string {
  if (rsi === null || trigger === null) return "WAITING";
  if (rsi >= overbought) return "OVERBOUGHT";
  if (rsi <= oversold) return "OVERSOLD";
  return rsi >= trigger ? "BULLISH" : "BEARISH";
}

function formatValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(4));
}

export function calculateAdaptiveRsiTrigger(input: IndicatorInput): IndicatorResult {
  const { candles, symbol, timeframe } = input;
  const params = { ...defaultAdaptiveRsiTriggerParams, ...(input.params ?? {}) };
  const length = Math.max(2, Math.round(toNumberParam(params.length, defaultAdaptiveRsiTriggerParams.length)));
  const triggerPeriod = Math.max(1, Math.floor(length / 2));
  const power = toNumberParam(params.power, defaultAdaptiveRsiTriggerParams.power);
  const overbought = toNumberParam(params.overbought, defaultAdaptiveRsiTriggerParams.overbought);
  const oversold = toNumberParam(params.oversold, defaultAdaptiveRsiTriggerParams.oversold);
  const minCandles = length + triggerPeriod + 10;

  if (candles.length < minCandles) {
    throw new Error(`Adaptive RSI Trigger needs at least ${minCandles} candles`);
  }

  const source = resolveSource(candles, params.source);
  const ama = calculateAdaptiveAverage(source, length, power);
  const adaptiveRsiValues = calculateRsiValues(ama, length);
  const triggerBase = calculateRsiValues(ema(source, triggerPeriod), length);
  const triggerValues = emaNullable(triggerBase, triggerPeriod);

  const series = candles.map((candle, index) => {
    const rsi = adaptiveRsiValues[index];
    const trigger = triggerValues[index];
    const previousRsi = index > 0 ? adaptiveRsiValues[index - 1] : null;
    const previousTrigger = index > 0 ? triggerValues[index - 1] : null;
    const buy = previousRsi !== null && previousTrigger !== null && rsi !== null && trigger !== null && previousRsi <= previousTrigger && rsi > trigger;
    const sell = previousRsi !== null && previousTrigger !== null && rsi !== null && trigger !== null && previousRsi >= previousTrigger && rsi < trigger;
    const signal: SignalName = buy ? "BUY" : sell ? "SELL" : "HOLD";
    const zone = resolveZone(rsi, trigger, overbought, oversold);

    return {
      time: candle.openTime,
      closeTime: candle.closeTime,
      price: candle.close,
      zone,
      signal,
      color: zone,
      values: {
        AdaptiveRSI: formatValue(rsi),
        Trigger: formatValue(trigger),
        State: resolveState(rsi, trigger, overbought, oversold),
        AMA: formatValue(ama[index]),
        Length: length,
        Power: power,
        Overbought: overbought,
        Oversold: oversold,
        Source: String(params.source ?? defaultAdaptiveRsiTriggerParams.source)
      }
    };
  });

  const latest = series[series.length - 1];
  const latestRsi = Number(latest.values.AdaptiveRSI);

  return {
    indicatorKey: ADAPTIVE_RSI_TRIGGER_KEY,
    symbol,
    timeframe,
    latest,
    series,
    alerts: [
      { name: "Buy Signal", triggered: latest.signal === "BUY", message: "Adaptive RSI crossed above trigger" },
      { name: "Sell Signal", triggered: latest.signal === "SELL", message: "Adaptive RSI crossed below trigger" },
      { name: "Oversold", triggered: Number.isFinite(latestRsi) && latestRsi <= oversold, message: "Adaptive RSI is oversold" },
      { name: "Overbought", triggered: Number.isFinite(latestRsi) && latestRsi >= overbought, message: "Adaptive RSI is overbought" }
    ]
  };
}
