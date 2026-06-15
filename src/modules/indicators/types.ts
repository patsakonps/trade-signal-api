import type { Candle } from "../market/market.types";

export type SignalName = "BUY" | "SELL" | "HOLD" | "NONE";
export type ZoneName = "GREEN" | "RED" | "YELLOW" | "BLUE" | "WHITE";
export type NormalizedSignal = "BUY" | "SELL" | "NEUTRAL";
export type NormalizedStrength = "WEAK" | "NORMAL" | "STRONG";

export type NormalizedOpinion = {
  signal: NormalizedSignal;
  strength: NormalizedStrength;
  reason: string;
};

export type IndicatorSeriesPoint = {
  time: number;
  closeTime: number;
  price: number;
  zone?: ZoneName;
  signal?: SignalName;
  color?: ZoneName;
  opinion?: NormalizedOpinion;
  values: Record<string, number | string | boolean | null>;
};

export type IndicatorAlert = {
  name: string;
  triggered: boolean;
  message: string;
};

export type IndicatorResult = {
  indicatorKey: string;
  symbol: string;
  timeframe: string;
  latest: IndicatorSeriesPoint;
  series: IndicatorSeriesPoint[];
  alerts: IndicatorAlert[];
};

export type IndicatorInput = {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  params?: Record<string, unknown>;
};
