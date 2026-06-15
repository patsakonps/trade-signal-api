import type { Candle } from "../market/market.types";
import { neutralOpinion, opinion } from "./opinion";
import type { IndicatorInput, IndicatorResult, SignalName, ZoneName, NormalizedOpinion } from "./types";

export const CVD_TAKER_DELTA_KEY = "CVD_TAKER_DELTA";

export const defaultCvdTakerDeltaParams = {
  divergenceLookback: 20,
  minDeltaPercent: 0
};

type CvdPoint = {
  delta: number;
  cvd: number;
  takerBuyVolume: number;
  takerSellVolume: number;
  deltaPercent: number;
};

function toNumberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatValue(value: number | null, digits = 4): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function getTakerBuyVolume(candle: Candle): number {
  const explicit = Number(candle.takerBuyBaseVolume);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.min(explicit, candle.volume);

  // Older candle payloads may not include taker-buy volume. Neutral fallback keeps the
  // indicator stable instead of inventing fake aggressive buy/sell pressure.
  return candle.volume / 2;
}

function calculateCvdPoints(candles: Candle[]): CvdPoint[] {
  let cvd = 0;

  return candles.map((candle) => {
    const takerBuyVolume = getTakerBuyVolume(candle);
    const takerSellVolume = Math.max(candle.volume - takerBuyVolume, 0);
    const delta = takerBuyVolume - takerSellVolume;
    const deltaPercent = candle.volume > 0 ? (delta / candle.volume) * 100 : 0;
    cvd += delta;

    return {
      delta,
      cvd,
      takerBuyVolume,
      takerSellVolume,
      deltaPercent
    };
  });
}

function resolveZone(delta: number, cvd: number, previousCvd: number | null): ZoneName {
  if (delta > 0 && (previousCvd === null || cvd >= previousCvd)) return "GREEN";
  if (delta < 0 && (previousCvd === null || cvd <= previousCvd)) return "RED";
  if (delta > 0) return "BLUE";
  if (delta < 0) return "YELLOW";
  return "WHITE";
}

function resolveOpinion(divergence: string, delta: number, cvd: number, previousCvd: number | null): NormalizedOpinion {
  if (divergence === "BULLISH_DIVERGENCE") return opinion("BUY", "STRONG", "Bullish CVD divergence: price made a lower low while CVD held higher");
  if (divergence === "BEARISH_DIVERGENCE") return opinion("SELL", "STRONG", "Bearish CVD divergence: price made a higher high while CVD made lower");
  if (previousCvd !== null && delta > 0 && cvd > previousCvd) return opinion("BUY", "NORMAL", "CVD is rising and latest taker delta is positive");
  if (previousCvd !== null && delta < 0 && cvd < previousCvd) return opinion("SELL", "NORMAL", "CVD is falling and latest taker delta is negative");
  return neutralOpinion("CVD flow is mixed or flat");
}

function getDivergenceState(
  candles: Candle[],
  cvdPoints: CvdPoint[],
  index: number,
  lookback: number,
  minDeltaPercent: number
): "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE" {
  if (index < lookback) return "NONE";

  const previousStart = Math.max(0, index - lookback);
  const previousCandles = candles.slice(previousStart, index);
  const previousCvdPoints = cvdPoints.slice(previousStart, index);
  if (!previousCandles.length || !previousCvdPoints.length) return "NONE";

  let lowestIndex = 0;
  let highestIndex = 0;

  for (let offset = 1; offset < previousCandles.length; offset += 1) {
    if (previousCandles[offset].low < previousCandles[lowestIndex].low) lowestIndex = offset;
    if (previousCandles[offset].high > previousCandles[highestIndex].high) highestIndex = offset;
  }

  const currentCandle = candles[index];
  const currentCvd = cvdPoints[index].cvd;
  const currentDeltaPercent = Math.abs(cvdPoints[index].deltaPercent);
  const previousLowCandle = previousCandles[lowestIndex];
  const previousHighCandle = previousCandles[highestIndex];
  const previousLowCvd = previousCvdPoints[lowestIndex].cvd;
  const previousHighCvd = previousCvdPoints[highestIndex].cvd;

  const strongEnough = currentDeltaPercent >= minDeltaPercent;
  const bullish = currentCandle.low < previousLowCandle.low && currentCvd > previousLowCvd && strongEnough;
  const bearish = currentCandle.high > previousHighCandle.high && currentCvd < previousHighCvd && strongEnough;

  if (bullish) return "BULLISH_DIVERGENCE";
  if (bearish) return "BEARISH_DIVERGENCE";
  return "NONE";
}

export function calculateCvdTakerDelta(input: IndicatorInput): IndicatorResult {
  const { candles, symbol, timeframe } = input;
  const params = { ...defaultCvdTakerDeltaParams, ...(input.params ?? {}) };
  const divergenceLookback = Math.max(5, Math.round(toNumberParam(params.divergenceLookback, defaultCvdTakerDeltaParams.divergenceLookback)));
  const minDeltaPercent = Math.max(0, toNumberParam(params.minDeltaPercent, defaultCvdTakerDeltaParams.minDeltaPercent));
  const minCandles = divergenceLookback + 2;

  if (candles.length < minCandles) {
    throw new Error(`CVD Taker Delta needs at least ${minCandles} candles`);
  }

  const cvdPoints = calculateCvdPoints(candles);

  const series = candles.map((candle, index) => {
    const cvdPoint = cvdPoints[index];
    const previousCvd = index > 0 ? cvdPoints[index - 1].cvd : null;
    const divergence = getDivergenceState(candles, cvdPoints, index, divergenceLookback, minDeltaPercent);
    const signal: SignalName = divergence === "BULLISH_DIVERGENCE" ? "BUY" : divergence === "BEARISH_DIVERGENCE" ? "SELL" : "HOLD";
    const zone = resolveZone(cvdPoint.delta, cvdPoint.cvd, previousCvd);

    return {
      time: candle.openTime,
      closeTime: candle.closeTime,
      price: candle.close,
      zone,
      signal,
      color: zone,
      opinion: resolveOpinion(divergence, cvdPoint.delta, cvdPoint.cvd, previousCvd),
      values: {
        CVD: formatValue(cvdPoint.cvd, 4),
        Delta: formatValue(cvdPoint.delta, 4),
        DeltaPercent: formatValue(cvdPoint.deltaPercent, 2),
        TakerBuyVolume: formatValue(cvdPoint.takerBuyVolume, 4),
        TakerSellVolume: formatValue(cvdPoint.takerSellVolume, 4),
        Direction: cvdPoint.delta > 0 ? "BUYERS" : cvdPoint.delta < 0 ? "SELLERS" : "NEUTRAL",
        Divergence: divergence,
        Lookback: divergenceLookback,
        MinDeltaPercent: minDeltaPercent
      }
    };
  });

  const latest = series[series.length - 1];

  return {
    indicatorKey: CVD_TAKER_DELTA_KEY,
    symbol,
    timeframe,
    latest,
    series,
    alerts: [
      { name: "Buy Signal", triggered: latest.signal === "BUY", message: "Bullish CVD divergence detected" },
      { name: "Sell Signal", triggered: latest.signal === "SELL", message: "Bearish CVD divergence detected" },
      { name: "BULLISH_DIVERGENCE", triggered: latest.values.Divergence === "BULLISH_DIVERGENCE", message: "Price made a lower low while CVD held a higher low" },
      { name: "BEARISH_DIVERGENCE", triggered: latest.values.Divergence === "BEARISH_DIVERGENCE", message: "Price made a higher high while CVD made a lower high" }
    ]
  };
}
