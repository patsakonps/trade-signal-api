import { Prisma, type SignalRule } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/error.middleware";
import { calculateBuiltInIndicator, getBuiltInIndicatorDefinition } from "../indicators/registry";
import type { IndicatorResult, IndicatorSeriesPoint, NormalizedSignal } from "../indicators/types";
import { marketService } from "../market/market.service";
import type { Candle } from "../market/market.types";
import { isCompositeAllRule, readCompositeRuleComponents } from "../signal-rules/composite-rule";
import type { BacktestRequest, CompareRequest } from "./strategy-lab.schema";

const DEFAULT_RUN_LIMIT = 30;
const zoneConditions = new Set(["GREEN", "RED", "YELLOW", "BLUE", "WHITE"]);

type StrategyDirection = "BUY" | "SELL";
type TradeSide = "LONG" | "SHORT";

type StrategySignal = {
  index: number;
  direction: StrategyDirection;
  price: number;
  reason: string;
};

type OpenPosition = {
  side: TradeSide;
  entryIndex: number;
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  notional: number;
  entryFee: number;
};

type SimulatedTrade = {
  side: TradeSide;
  entryTime: Date;
  entryPrice: number;
  exitTime: Date;
  exitPrice: number;
  quantity: number;
  entryFee: number;
  exitFee: number;
  pnl: number;
  pnlPct: number;
  reason: string;
};

type BacktestMetrics = {
  initialCapital: number;
  finalCapital: number;
  netProfitPct: number;
  winrate: number;
  maxDrawdownPct: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyPct: number;
  score: number;
  equityCurve: Array<{ time: string; equity: number }>;
  trades: SimulatedTrade[];
  signals: StrategySignal[];
};

type RuleForBacktest = Pick<
  SignalRule,
  "id" | "workspaceId" | "name" | "exchange" | "symbol" | "timeframe" | "indicatorType" | "indicatorKey" | "condition" | "paramsJson"
>;

function getClosedCandles(candles: Candle[]): Candle[] {
  const now = Date.now();
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.closeTime > now ? candles.slice(0, -1) : candles;
}

function normalizeCondition(condition: string): string {
  return condition.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function paramsToRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function didZoneChange(series: IndicatorSeriesPoint[], index: number): boolean {
  if (index < 1) return false;
  const latest = series[index];
  const previous = series[index - 1];
  return Boolean(latest?.zone && previous?.zone && latest.zone !== previous.zone);
}

function matchesHistoricalCondition(result: IndicatorResult, index: number, condition: string): boolean {
  const point = result.series[index];
  if (!point) return false;

  const normalized = normalizeCondition(condition);

  if (normalized === "BUY_OR_SELL") return point.signal === "BUY" || point.signal === "SELL";
  if (normalized === "BUY") return point.signal === "BUY";
  if (normalized === "SELL") return point.signal === "SELL";
  if (normalized === "ZONE_CHANGED") return didZoneChange(result.series, index);
  if (zoneConditions.has(normalized)) return point.zone === normalized;

  if (normalized === "BULLISH_DIVERGENCE" || normalized === "BEARISH_DIVERGENCE") {
    return point.values.Divergence === normalized;
  }

  if (normalized === "SQUAT") return point.values.State === "SQUAT";

  if (normalized === "OVERSOLD" || normalized === "OVERBOUGHT") {
    const state = point.values.State;
    if (state === normalized) return true;

    const threshold = asNumber(point.values[normalized === "OVERSOLD" ? "Oversold" : "Overbought"]);
    const rsi = asNumber(point.values.RSI ?? point.values.AdaptiveRSI);
    if (threshold === null || rsi === null) return false;
    return normalized === "OVERSOLD" ? rsi <= threshold : rsi >= threshold;
  }

  return false;
}

function getPointDirection(point: IndicatorSeriesPoint, condition: string): StrategyDirection | null {
  if (point.signal === "BUY" || point.signal === "SELL") return point.signal;

  const normalized = normalizeCondition(condition);
  if (normalized === "BUY" || normalized === "GREEN" || normalized === "BLUE" || normalized === "OVERSOLD" || normalized === "BULLISH_DIVERGENCE") {
    return "BUY";
  }
  if (normalized === "SELL" || normalized === "RED" || normalized === "YELLOW" || normalized === "OVERBOUGHT" || normalized === "BEARISH_DIVERGENCE" || normalized === "SQUAT") {
    return "SELL";
  }

  const opinionSignal = point.opinion?.signal;
  if (opinionSignal === "BUY" || opinionSignal === "SELL") return opinionSignal;

  return null;
}

function getAllowedCompositeDirections(condition: string): StrategyDirection[] {
  const normalized = normalizeCondition(condition);
  if (normalized === "BUY") return ["BUY"];
  if (normalized === "SELL") return ["SELL"];
  return ["BUY", "SELL"];
}

function getOpinionAt(result: IndicatorResult, index: number): NormalizedSignal {
  return result.series[index]?.opinion?.signal ?? "NEUTRAL";
}

function allComponentsAgree(results: IndicatorResult[], index: number, direction: StrategyDirection): boolean {
  if (index < 0) return false;
  return results.every((result) => getOpinionAt(result, index) === direction);
}

function signalReason(result: IndicatorResult, index: number, direction: StrategyDirection, condition: string): string {
  const point = result.series[index];
  return point?.opinion?.reason || `${result.indicatorKey} matched ${condition} as ${direction}`;
}

function calculateScore(metrics: Omit<BacktestMetrics, "score" | "equityCurve" | "trades" | "signals">): number {
  const profitComponent = metrics.netProfitPct;
  const winComponent = metrics.winrate * 0.35;
  const profitFactorComponent = Math.min(metrics.profitFactor, 3) * 20;
  const tradeComponent = Math.min(metrics.totalTrades, 50) * 0.25;
  const drawdownPenalty = metrics.maxDrawdownPct * 1.2;
  const smallSamplePenalty = metrics.totalTrades < 5 ? (5 - metrics.totalTrades) * 8 : 0;
  return round(Math.max(0, profitComponent + winComponent + profitFactorComponent + tradeComponent - drawdownPenalty - smallSamplePenalty), 2);
}

function calculateMaxDrawdownPct(equityCurve: Array<{ equity: number }>, initialCapital: number): number {
  let peak = initialCapital;
  let maxDrawdown = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak <= 0) continue;
    const drawdown = ((peak - point.equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return round(maxDrawdown, 4);
}

function entryPriceWithSlippage(price: number, side: TradeSide, slippagePct: number): number {
  const slippage = slippagePct / 100;
  return side === "LONG" ? price * (1 + slippage) : price * (1 - slippage);
}

function exitPriceWithSlippage(price: number, side: TradeSide, slippagePct: number): number {
  const slippage = slippagePct / 100;
  return side === "LONG" ? price * (1 - slippage) : price * (1 + slippage);
}

function grossPnl(position: OpenPosition, exitPrice: number): number {
  const direction = position.side === "LONG" ? 1 : -1;
  return (exitPrice - position.entryPrice) * position.quantity * direction;
}

function shouldCloseByOppositeSignal(position: OpenPosition, signal: StrategySignal): boolean {
  return (position.side === "LONG" && signal.direction === "SELL") || (position.side === "SHORT" && signal.direction === "BUY");
}

function simulateTrades(candles: Candle[], signals: StrategySignal[], config: BacktestRequest): BacktestMetrics {
  const signalByIndex = new Map<number, StrategySignal>();
  for (const signal of signals) signalByIndex.set(signal.index, signal);

  const feeRate = config.feePct / 100;
  let balance = config.initialCapital;
  let position: OpenPosition | null = null;
  const trades: SimulatedTrade[] = [];
  const equityCurve: Array<{ time: string; equity: number }> = [];

  function closePosition(candle: Candle, rawExitPrice: number, reason: string) {
    if (!position) return;

    const exitPrice = exitPriceWithSlippage(rawExitPrice, position.side, config.slippagePct);
    const exitNotional = exitPrice * position.quantity;
    const exitFee = exitNotional * feeRate;
    const tradePnl = grossPnl(position, exitPrice) - position.entryFee - exitFee;

    balance += tradePnl;

    trades.push({
      side: position.side,
      entryTime: position.entryTime,
      entryPrice: round(position.entryPrice, 8),
      exitTime: new Date(candle.openTime),
      exitPrice: round(exitPrice, 8),
      quantity: round(position.quantity, 8),
      entryFee: round(position.entryFee, 8),
      exitFee: round(exitFee, 8),
      pnl: round(tradePnl, 8),
      pnlPct: round((tradePnl / position.notional) * 100, 4),
      reason
    });

    position = null;
  }

  function createPosition(candle: Candle, direction: StrategyDirection, index: number): OpenPosition | null {
    if (balance <= 0) return null;
    if (direction === "SELL" && config.tradeMode !== "LONG_SHORT") return null;

    const side: TradeSide = direction === "BUY" ? "LONG" : "SHORT";
    const notional = Math.max(0, balance * (config.positionSizePct / 100));
    if (notional <= 0) return null;

    const entryPrice = entryPriceWithSlippage(candle.open, side, config.slippagePct);
    const quantity = notional / entryPrice;
    const entryFee = notional * feeRate;

    balance -= entryFee;
    return {
      side,
      entryIndex: index,
      entryTime: new Date(candle.openTime),
      entryPrice,
      quantity,
      notional,
      entryFee
    };
  }

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousSignal = signalByIndex.get(index - 1);

    if (previousSignal) {
      if (position && shouldCloseByOppositeSignal(position, previousSignal)) {
        closePosition(candle, candle.open, "opposite_signal");
      }

      if (!position) {
        position = createPosition(candle, previousSignal.direction, index);
      }
    }

    const activePosition: OpenPosition | null = position;
    if (activePosition) {
      const stopLossPct = config.stopLossPct;
      const takeProfitPct = config.takeProfitPct;

      if (activePosition.side === "LONG") {
        const stopPrice = stopLossPct !== undefined ? activePosition.entryPrice * (1 - stopLossPct / 100) : null;
        const takePrice = takeProfitPct !== undefined ? activePosition.entryPrice * (1 + takeProfitPct / 100) : null;
        if (stopPrice !== null && candle.low <= stopPrice) closePosition(candle, stopPrice, "stop_loss");
        else if (takePrice !== null && candle.high >= takePrice) closePosition(candle, takePrice, "take_profit");
      } else {
        const stopPrice = stopLossPct !== undefined ? activePosition.entryPrice * (1 + stopLossPct / 100) : null;
        const takePrice = takeProfitPct !== undefined ? activePosition.entryPrice * (1 - takeProfitPct / 100) : null;
        if (stopPrice !== null && candle.high >= stopPrice) closePosition(candle, stopPrice, "stop_loss");
        else if (takePrice !== null && candle.low <= takePrice) closePosition(candle, takePrice, "take_profit");
      }
    }

    const unrealized = position ? grossPnl(position, candle.close) : 0;
    equityCurve.push({ time: new Date(candle.closeTime).toISOString(), equity: round(balance + unrealized, 8) });
  }

  if (position) {
    const last = candles[candles.length - 1];
    closePosition({ ...last, open: last.close, openTime: last.closeTime }, last.close, "end_of_test");
    equityCurve.push({ time: new Date(last.closeTime).toISOString(), equity: round(balance, 8) });
  }

  if (!equityCurve.length && candles.length) {
    const last = candles[candles.length - 1];
    equityCurve.push({ time: new Date(last.closeTime).toISOString(), equity: round(balance, 8) });
  }

  const winningTrades = trades.filter((trade) => trade.pnl > 0);
  const losingTrades = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = winningTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnl, 0));
  const totalTrades = trades.length;
  const winrate = totalTrades ? (winningTrades.length / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWinPct = winningTrades.length ? winningTrades.reduce((sum, trade) => sum + trade.pnlPct, 0) / winningTrades.length : 0;
  const avgLossPct = losingTrades.length ? losingTrades.reduce((sum, trade) => sum + trade.pnlPct, 0) / losingTrades.length : 0;
  const expectancyPct = totalTrades ? trades.reduce((sum, trade) => sum + trade.pnlPct, 0) / totalTrades : 0;
  const finalCapital = balance;

  const baseMetrics = {
    initialCapital: config.initialCapital,
    finalCapital: round(finalCapital, 8),
    netProfitPct: round(((finalCapital - config.initialCapital) / config.initialCapital) * 100, 4),
    winrate: round(winrate, 4),
    maxDrawdownPct: calculateMaxDrawdownPct(equityCurve, config.initialCapital),
    profitFactor: round(Math.min(profitFactor, 999), 4),
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWinPct: round(avgWinPct, 4),
    avgLossPct: round(avgLossPct, 4),
    expectancyPct: round(expectancyPct, 4)
  };

  return {
    ...baseMetrics,
    score: calculateScore(baseMetrics),
    equityCurve,
    trades,
    signals
  };
}

export class StrategyLabService {
  async listRuns(workspaceId: string, limit = DEFAULT_RUN_LIMIT) {
    const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_RUN_LIMIT, 1), 100);
    const recentRuns = await prisma.backtestRun.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: Math.max(safeLimit * 5, 100),
      include: {
        rule: {
          select: {
            id: true,
            name: true,
            symbol: true,
            timeframe: true,
            indicatorKey: true,
            condition: true,
            enabled: true
          }
        }
      }
    });

    const latestByRule = new Map<string, (typeof recentRuns)[number]>();
    for (const run of recentRuns) {
      if (!latestByRule.has(run.ruleId)) latestByRule.set(run.ruleId, run);
    }

    const runs = Array.from(latestByRule.values())
      .sort((left, right) => right.score - left.score || right.netProfitPct - left.netProfitPct)
      .slice(0, safeLimit);

    return { runs };
  }

  async getRun(workspaceId: string, id: string) {
    const run = await prisma.backtestRun.findFirst({
      where: { id, workspaceId },
      include: {
        rule: true,
        trades: { orderBy: { entryTime: "asc" } }
      }
    });

    if (!run) throw new AppError(404, "Backtest run not found");
    return { run };
  }

  async runBacktest(workspaceId: string, config: BacktestRequest) {
    const rule = await prisma.signalRule.findFirst({ where: { id: config.ruleId, workspaceId } });
    if (!rule) throw new AppError(404, "Signal rule not found");
    if (rule.indicatorType !== "BUILT_IN") throw new AppError(400, "Strategy Lab currently supports server-side built-in rules only");

    const candles = getClosedCandles(await marketService.getCandles(rule.symbol, rule.timeframe, config.candlesLimit));
    const signals = this.buildSignals(rule, candles);
    const metrics = simulateTrades(candles, signals, config);
    const savedRun = await this.saveRun(rule, config, metrics, candles.length);

    return { run: savedRun };
  }

  async compareRules(workspaceId: string, config: CompareRequest) {
    const rules = await prisma.signalRule.findMany({
      where: {
        workspaceId,
        enabled: true,
        indicatorType: "BUILT_IN",
        ...(config.ruleIds?.length ? { id: { in: config.ruleIds } } : {})
      },
      orderBy: { createdAt: "asc" }
    });

    if (!rules.length) throw new AppError(404, "No enabled built-in rules to compare");

    const runs = [];
    const errors: Array<{ ruleId: string; ruleName: string; message: string }> = [];

    for (const rule of rules) {
      try {
        const backtestConfig: BacktestRequest = { ...config, ruleId: rule.id };
        const candles = getClosedCandles(await marketService.getCandles(rule.symbol, rule.timeframe, backtestConfig.candlesLimit));
        const signals = this.buildSignals(rule, candles);
        const metrics = simulateTrades(candles, signals, backtestConfig);
        const savedRun = await this.saveRun(rule, backtestConfig, metrics, candles.length);
        runs.push(savedRun);
      } catch (error) {
        errors.push({ ruleId: rule.id, ruleName: rule.name, message: error instanceof Error ? error.message : "Backtest failed" });
      }
    }

    runs.sort((left, right) => right.score - left.score || right.netProfitPct - left.netProfitPct);
    return { runs, errors };
  }

  private buildSignals(rule: RuleForBacktest, candles: Candle[]): StrategySignal[] {
    if (isCompositeAllRule(rule.indicatorKey)) return this.buildCompositeSignals(rule, candles);
    return this.buildSingleIndicatorSignals(rule, candles);
  }

  private buildSingleIndicatorSignals(rule: RuleForBacktest, candles: Candle[]): StrategySignal[] {
    const indicatorDefinition = getBuiltInIndicatorDefinition(rule.indicatorKey);
    if (!indicatorDefinition) throw new AppError(400, `Unsupported built-in indicator: ${rule.indicatorKey}`);
    if (candles.length < indicatorDefinition.minCandles) {
      throw new AppError(400, `Not enough candles to calculate ${rule.indicatorKey}. Required ${indicatorDefinition.minCandles}, got ${candles.length}`);
    }

    const result = calculateBuiltInIndicator(rule.indicatorKey, {
      symbol: rule.symbol,
      timeframe: rule.timeframe,
      candles,
      params: paramsToRecord(rule.paramsJson)
    });

    const signals: StrategySignal[] = [];
    for (let index = 1; index < result.series.length - 1; index += 1) {
      if (!matchesHistoricalCondition(result, index, rule.condition)) continue;
      const direction = getPointDirection(result.series[index], rule.condition);
      if (!direction) continue;
      signals.push({
        index,
        direction,
        price: result.series[index].price,
        reason: signalReason(result, index, direction, rule.condition)
      });
    }

    return signals;
  }

  private buildCompositeSignals(rule: RuleForBacktest, candles: Candle[]): StrategySignal[] {
    const components = readCompositeRuleComponents(paramsToRecord(rule.paramsJson));
    if (components.length < 2) throw new AppError(400, "Composite ALL needs at least 2 indicators");
    if (components.length > 6) throw new AppError(400, "Composite ALL supports up to 6 indicators");

    const definitions = components.map((component) => {
      const definition = getBuiltInIndicatorDefinition(component.indicatorKey);
      if (!definition) throw new AppError(400, `Unsupported composite component: ${component.indicatorKey}`);
      return definition;
    });

    const minCandles = Math.max(...definitions.map((definition) => definition.minCandles));
    if (candles.length < minCandles) {
      throw new AppError(400, `Not enough candles for Composite ALL. Required ${minCandles}, got ${candles.length}`);
    }

    const componentResults = components.map((component) =>
      calculateBuiltInIndicator(component.indicatorKey, {
        symbol: rule.symbol,
        timeframe: rule.timeframe,
        candles,
        params: component.paramsJson ?? {}
      })
    );

    const directions = getAllowedCompositeDirections(rule.condition);
    const signals: StrategySignal[] = [];

    for (let index = 1; index < candles.length - 1; index += 1) {
      const direction = directions.find((item) => allComponentsAgree(componentResults, index, item));
      if (!direction) continue;
      if (allComponentsAgree(componentResults, index - 1, direction)) continue;

      signals.push({
        index,
        direction,
        price: candles[index].close,
        reason: `Composite ALL newly aligned ${direction}: ${components.map((item) => item.indicatorKey).join(", ")}`
      });
    }

    return signals;
  }

  private async saveRun(rule: RuleForBacktest, config: BacktestRequest, metrics: BacktestMetrics, candleCount: number) {
    const configJson = {
      candlesLimit: config.candlesLimit,
      candleCount,
      positionSizePct: config.positionSizePct,
      feePct: config.feePct,
      slippagePct: config.slippagePct,
      stopLossPct: config.stopLossPct ?? null,
      takeProfitPct: config.takeProfitPct ?? null,
      tradeMode: config.tradeMode,
      signalsCount: metrics.signals.length,
      equityCurve: metrics.equityCurve
    } as Prisma.InputJsonValue;

    return prisma.backtestRun.create({
      data: {
        workspaceId: rule.workspaceId,
        ruleId: rule.id,
        exchange: rule.exchange,
        symbol: rule.symbol,
        timeframe: rule.timeframe,
        initialCapital: metrics.initialCapital,
        finalCapital: metrics.finalCapital,
        netProfitPct: metrics.netProfitPct,
        winrate: metrics.winrate,
        maxDrawdownPct: metrics.maxDrawdownPct,
        profitFactor: metrics.profitFactor,
        totalTrades: metrics.totalTrades,
        winningTrades: metrics.winningTrades,
        losingTrades: metrics.losingTrades,
        avgWinPct: metrics.avgWinPct,
        avgLossPct: metrics.avgLossPct,
        expectancyPct: metrics.expectancyPct,
        score: metrics.score,
        configJson,
        trades: {
          create: metrics.trades.map((trade) => ({
            side: trade.side,
            entryTime: trade.entryTime,
            entryPrice: trade.entryPrice,
            exitTime: trade.exitTime,
            exitPrice: trade.exitPrice,
            quantity: trade.quantity,
            entryFee: trade.entryFee,
            exitFee: trade.exitFee,
            pnl: trade.pnl,
            pnlPct: trade.pnlPct,
            reason: trade.reason
          }))
        }
      },
      include: {
        rule: {
          select: {
            id: true,
            name: true,
            symbol: true,
            timeframe: true,
            indicatorKey: true,
            condition: true,
            enabled: true
          }
        },
        trades: { orderBy: { entryTime: "asc" } }
      }
    });
  }
}

export const strategyLabService = new StrategyLabService();
