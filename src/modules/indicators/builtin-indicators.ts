import { CDC_ACTION_ZONE_KEY, defaultCdcParams } from "./cdc-action-zone.service";

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
  }
];
