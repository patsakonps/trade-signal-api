import type { IndicatorInput, IndicatorResult, SignalName, ZoneName } from "./types";

export const BILL_WILLIAMS_MFI_KEY = "BILL_WILLIAMS_MFI";

export const defaultBillWilliamsMfiParams = {
  breakoutMode: "close"
};

type BwMfiState = "GREEN" | "FADE" | "FAKE" | "SQUAT" | "WAITING";

function formatValue(value: number | null, digits = 8): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeBreakoutMode(value: unknown): "close" | "wick" {
  const normalized = String(value ?? defaultBillWilliamsMfiParams.breakoutMode).trim().toLowerCase();
  return normalized === "wick" ? "wick" : "close";
}

function resolveZone(state: BwMfiState): ZoneName {
  if (state === "GREEN") return "GREEN";
  if (state === "SQUAT") return "RED";
  if (state === "FAKE") return "YELLOW";
  if (state === "FADE") return "BLUE";
  return "WHITE";
}

function resolveState(mfi: number | null, previousMfi: number | null, volume: number, previousVolume: number | null): BwMfiState {
  if (mfi === null || previousMfi === null || previousVolume === null) return "WAITING";

  const mfiUp = mfi > previousMfi;
  const volumeUp = volume > previousVolume;

  if (mfiUp && volumeUp) return "GREEN";
  if (!mfiUp && !volumeUp) return "FADE";
  if (mfiUp && !volumeUp) return "FAKE";
  return "SQUAT";
}

export function calculateBillWilliamsMfi(input: IndicatorInput): IndicatorResult {
  const { candles, symbol, timeframe } = input;
  const params = { ...defaultBillWilliamsMfiParams, ...(input.params ?? {}) };
  const breakoutMode = normalizeBreakoutMode(params.breakoutMode);

  if (candles.length < 3) {
    throw new Error("Bill Williams MFI needs at least 3 candles");
  }

  const mfiValues = candles.map((candle) => {
    if (candle.volume <= 0) return null;
    return (candle.high - candle.low) / candle.volume;
  });

  const states = candles.map((candle, index) => {
    const previousMfi = index > 0 ? mfiValues[index - 1] : null;
    const previousVolume = index > 0 ? candles[index - 1].volume : null;
    return resolveState(mfiValues[index], previousMfi, candle.volume, previousVolume);
  });

  const series = candles.map((candle, index) => {
    const state = states[index];
    const previousCandle = index > 0 ? candles[index - 1] : null;
    const previousState = index > 0 ? states[index - 1] : "WAITING";
    const brokeUp = previousCandle
      ? breakoutMode === "wick"
        ? candle.high > previousCandle.high
        : candle.close > previousCandle.high
      : false;
    const brokeDown = previousCandle
      ? breakoutMode === "wick"
        ? candle.low < previousCandle.low
        : candle.close < previousCandle.low
      : false;
    const buy = previousState === "SQUAT" && brokeUp;
    const sell = previousState === "SQUAT" && brokeDown;
    const signal: SignalName = buy ? "BUY" : sell ? "SELL" : "HOLD";
    const zone = resolveZone(state);
    const previousMfi = index > 0 ? mfiValues[index - 1] : null;
    const previousVolume = index > 0 ? candles[index - 1].volume : null;
    const spread = candle.high - candle.low;

    return {
      time: candle.openTime,
      closeTime: candle.closeTime,
      price: candle.close,
      zone,
      signal,
      color: zone,
      values: {
        BWMFI: formatValue(mfiValues[index], 10),
        State: state,
        Spread: formatValue(spread, 8),
        Volume: formatValue(candle.volume, 4),
        MfiChange: previousMfi === null || mfiValues[index] === null ? null : formatValue(mfiValues[index]! - previousMfi, 10),
        VolumeChange: previousVolume === null ? null : formatValue(candle.volume - previousVolume, 4),
        BreakoutMode: breakoutMode,
        SquatHigh: previousState === "SQUAT" && previousCandle ? formatValue(previousCandle.high, 8) : null,
        SquatLow: previousState === "SQUAT" && previousCandle ? formatValue(previousCandle.low, 8) : null
      }
    };
  });

  const latest = series[series.length - 1];

  return {
    indicatorKey: BILL_WILLIAMS_MFI_KEY,
    symbol,
    timeframe,
    latest,
    series,
    alerts: [
      { name: "Buy Signal", triggered: latest.signal === "BUY", message: "Price broke above the previous Squat candle" },
      { name: "Sell Signal", triggered: latest.signal === "SELL", message: "Price broke below the previous Squat candle" },
      { name: "SQUAT", triggered: latest.values.State === "SQUAT", message: "Volume increased while facilitation decreased" }
    ]
  };
}
