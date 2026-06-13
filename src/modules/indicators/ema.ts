import type { Candle } from "../market/market.types";

export function ohlc4(candles: Candle[]): number[] {
  return candles.map((candle) => (candle.open + candle.high + candle.low + candle.close) / 4);
}

export function close(candles: Candle[]): number[] {
  return candles.map((candle) => candle.close);
}

export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const safePeriod = Math.max(1, Math.floor(period));
  const multiplier = 2 / (safePeriod + 1);
  const output: number[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (i === 0) {
      output.push(value);
    } else {
      output.push(value * multiplier + output[i - 1] * (1 - multiplier));
    }
  }

  return output;
}

export function sma(values: number[], period: number): number[] {
  const safePeriod = Math.max(1, Math.floor(period));
  return values.map((_value, index) => {
    const start = Math.max(0, index - safePeriod + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, item) => sum + item, 0) / slice.length;
  });
}
