import { CDC_ACTION_ZONE_KEY, defaultCdcParams } from "./cdc-action-zone.service";
import { HALF_TREND_KEY, defaultHalfTrendParams } from "./half-trend.service";
import { RSI_14_KEY, defaultRsi14Params } from "./rsi-14.service";
import { ADAPTIVE_RSI_TRIGGER_KEY, defaultAdaptiveRsiTriggerParams } from "./adaptive-rsi-trigger.service";

export const builtinIndicators = [
  {
    id: CDC_ACTION_ZONE_KEY,
    key: CDC_ACTION_ZONE_KEY,
    name: "CDC Action Zone V.2",
    type: "BUILT_IN",
    isBuiltIn: true,
    enabled: true,
    paramsJson: defaultCdcParams,
    description:
      "Default CDC Action Zone based on AP = EMA(OHLC4, 2), Fast = EMA(AP, 12), Slow = EMA(AP, 26). Buy when Bullish crosses from previous Bearish, Sell when Bearish crosses from previous Bullish.",
    script: null
  },
  {
    id: HALF_TREND_KEY,
    key: HALF_TREND_KEY,
    name: "HalfTrend",
    type: "BUILT_IN",
    isBuiltIn: true,
    enabled: true,
    paramsJson: defaultHalfTrendParams,
    description:
      "Trend-following reversal indicator. Default amplitude 2, channel deviation 2, ATR period 100. Buy/Sell fires when the trend flips after a closed candle.",
    script: null
  },
  {
    id: RSI_14_KEY,
    key: RSI_14_KEY,
    name: "RSI 14",
    type: "BUILT_IN",
    isBuiltIn: true,
    enabled: true,
    paramsJson: defaultRsi14Params,
    description:
      "Wilder RSI with period 14. Buy fires when RSI crosses back above 30, Sell fires when RSI crosses back below 70. Oversold/overbought alerts are also exposed.",
    script: null
  },
  {
    id: ADAPTIVE_RSI_TRIGGER_KEY,
    key: ADAPTIVE_RSI_TRIGGER_KEY,
    name: "Adaptive RSI Trigger",
    type: "BUILT_IN",
    isBuiltIn: true,
    enabled: true,
    paramsJson: defaultAdaptiveRsiTriggerParams,
    description:
      "Adaptive RSI with trigger line inspired by the Rainbow Adaptive RSI concept. Default length 15, power 1, source close, overbought 80 and oversold 20. Buy/Sell fires on Adaptive RSI / Trigger crosses.",
    script: null
  }
];
