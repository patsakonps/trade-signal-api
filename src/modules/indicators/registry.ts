import { calculateCdcActionZone, CDC_ACTION_ZONE_KEY } from "./cdc-action-zone.service";
import { calculateHalfTrend, HALF_TREND_KEY, defaultHalfTrendParams } from "./half-trend.service";
import { calculateRsi14, RSI_14_KEY, defaultRsi14Params } from "./rsi-14.service";
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
