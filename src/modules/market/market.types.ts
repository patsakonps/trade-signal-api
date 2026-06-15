export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  closeTime: number;
  takerBuyBaseVolume?: number;
  takerBuyQuoteVolume?: number;
};

export type { Timeframe } from "./timeframes";
