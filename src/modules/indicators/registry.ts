import { calculateCdcActionZone, CDC_ACTION_ZONE_KEY } from "./cdc-action-zone.service";
import { calculateHalfTrend, HALF_TREND_KEY, defaultHalfTrendParams } from "./half-trend.service";
import { calculateRsi14, RSI_14_KEY, defaultRsi14Params } from "./rsi-14.service";
import { calculateAdaptiveRsiTrigger, ADAPTIVE_RSI_TRIGGER_KEY, defaultAdaptiveRsiTriggerParams } from "./adaptive-rsi-trigger.service";
import { calculateCvdTakerDelta, CVD_TAKER_DELTA_KEY, defaultCvdTakerDeltaParams } from "./cvd-taker-delta.service";
import { calculateBillWilliamsMfi, BILL_WILLIAMS_MFI_KEY } from "./bill-williams-mfi.service";
import type { IndicatorInput, IndicatorResult } from "./types";

export type BuiltInIndicatorDefinition = {
  key: string;
  minCandles: number;
  calculate: (input: IndicatorInput) => IndicatorResult;
};

export const builtinIndicatorRegistry: Record<string, BuiltInIndicatorDefinition> = {
  [CDC_ACTION_ZONE_KEY]: {
    key: CDC_ACTION_ZONE_KEY,
    minCandles: 50,
    calculate: calculateCdcActionZone
  },
  [HALF_TREND_KEY]: {
    key: HALF_TREND_KEY,
    minCandles: Math.max(defaultHalfTrendParams.atrPeriod + defaultHalfTrendParams.amplitude + 5, 50),
    calculate: calculateHalfTrend
  },
  [RSI_14_KEY]: {
    key: RSI_14_KEY,
    minCandles: defaultRsi14Params.period + 2,
    calculate: calculateRsi14
  },
  [ADAPTIVE_RSI_TRIGGER_KEY]: {
    key: ADAPTIVE_RSI_TRIGGER_KEY,
    minCandles: defaultAdaptiveRsiTriggerParams.length + Math.floor(defaultAdaptiveRsiTriggerParams.length / 2) + 10,
    calculate: calculateAdaptiveRsiTrigger
  },
  [CVD_TAKER_DELTA_KEY]: {
    key: CVD_TAKER_DELTA_KEY,
    minCandles: defaultCvdTakerDeltaParams.divergenceLookback + 2,
    calculate: calculateCvdTakerDelta
  },
  [BILL_WILLIAMS_MFI_KEY]: {
    key: BILL_WILLIAMS_MFI_KEY,
    minCandles: 3,
    calculate: calculateBillWilliamsMfi
  }
};

export function isBuiltInIndicatorKey(key: string): boolean {
  return Boolean(builtinIndicatorRegistry[key]);
}

export function getBuiltInIndicatorDefinition(key: string): BuiltInIndicatorDefinition | null {
  return builtinIndicatorRegistry[key] ?? null;
}

export function calculateBuiltInIndicator(key: string, input: IndicatorInput): IndicatorResult {
  const definition = getBuiltInIndicatorDefinition(key);
  if (!definition) throw new Error(`Unsupported built-in indicator: ${key}`);
  return definition.calculate(input);
}
