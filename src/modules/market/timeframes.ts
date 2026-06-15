export const NATIVE_BINANCE_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M"
] as const;

export const DERIVED_TIMEFRAMES = ["45m"] as const;

export const SUPPORTED_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "45m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M"
] as const;

export type NativeBinanceTimeframe = (typeof NATIVE_BINANCE_TIMEFRAMES)[number];
export type DerivedTimeframe = (typeof DERIVED_TIMEFRAMES)[number];
export type Timeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

export const nativeBinanceTimeframeSet = new Set<string>(NATIVE_BINANCE_TIMEFRAMES);
export const supportedTimeframeSet = new Set<string>(SUPPORTED_TIMEFRAMES);

export function isNativeBinanceTimeframe(timeframe: string): timeframe is NativeBinanceTimeframe {
  return nativeBinanceTimeframeSet.has(timeframe);
}

export function isSupportedTimeframe(timeframe: string): timeframe is Timeframe {
  return supportedTimeframeSet.has(timeframe);
}
