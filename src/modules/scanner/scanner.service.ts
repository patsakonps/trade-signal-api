import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { marketService } from "../market/market.service";
import { calculateCdcActionZone, CDC_ACTION_ZONE_KEY } from "../indicators/cdc-action-zone.service";
import type { IndicatorResult, IndicatorSeriesPoint } from "../indicators/types";
import type { Candle } from "../market/market.types";
import { telegramService } from "../notifications/telegram.service";

const DEFAULT_SCAN_LIMIT = 240;
const zoneConditions = new Set(["GREEN", "RED", "YELLOW", "BLUE", "WHITE"]);

type ScanRuleResult = {
  ruleId: string;
  ruleName: string;
  workspaceId: string;
  symbol: string;
  timeframe: string;
  status: "TRIGGERED" | "NO_SIGNAL" | "DUPLICATE" | "SKIPPED" | "ERROR";
  signalType?: string;
  zone?: string;
  message: string;
  telegramSent?: boolean;
};

type ScanSummary = {
  scannedRules: number;
  triggered: number;
  telegramSent: number;
  skipped: number;
  errors: number;
  results: ScanRuleResult[];
};

function getClosedCandles(candles: Candle[]): Candle[] {
  const now = Date.now();
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  if (last.closeTime > now) {
    return candles.slice(0, -1);
  }
  return candles;
}

function normalizeCondition(condition: string): string {
  return condition.trim().toUpperCase();
}

function didZoneChange(series: IndicatorSeriesPoint[]): boolean {
  if (series.length < 2) return false;
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  return Boolean(latest.zone && previous.zone && latest.zone !== previous.zone);
}

function matchesCondition(result: IndicatorResult, condition: string): boolean {
  const latest = result.latest;
  const normalized = normalizeCondition(condition);

  if (normalized === "BUY_OR_SELL") return latest.signal === "BUY" || latest.signal === "SELL";
  if (normalized === "BUY") return latest.signal === "BUY";
  if (normalized === "SELL") return latest.signal === "SELL";
  if (normalized === "ZONE_CHANGED") return didZoneChange(result.series);
  if (zoneConditions.has(normalized)) return latest.zone === normalized;

  return result.alerts.some((alert) => alert.name.toUpperCase() === normalized && alert.triggered);
}

function getSignalType(result: IndicatorResult, condition: string): string {
  if (result.latest.signal && result.latest.signal !== "HOLD" && result.latest.signal !== "NONE") {
    return result.latest.signal;
  }

  const normalized = normalizeCondition(condition);
  if (normalized === "ZONE_CHANGED" && result.latest.zone) return `ZONE_${result.latest.zone}`;
  if (zoneConditions.has(normalized)) return normalized;

  return "SIGNAL";
}

function paramsToRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class ScannerService {
  async run(options: { workspaceId?: string | null } = {}): Promise<ScanSummary> {
    const rules = await prisma.signalRule.findMany({
      where: {
        enabled: true,
        ...(options.workspaceId
          ? { workspaceId: options.workspaceId }
          : {
              workspace: {
                telegramNotification: {
                  is: {
                    enabled: true
                  }
                }
              }
            })
      },
      include: {
        workspace: { include: { telegramNotification: true } },
        indicatorTemplate: true
      },
      orderBy: { createdAt: "asc" }
    });

    const summary: ScanSummary = {
      scannedRules: rules.length,
      triggered: 0,
      telegramSent: 0,
      skipped: 0,
      errors: 0,
      results: []
    };

    for (const rule of rules) {
      try {
        if (rule.indicatorType !== "BUILT_IN" || rule.indicatorKey !== CDC_ACTION_ZONE_KEY) {
          summary.skipped += 1;
          summary.results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            workspaceId: rule.workspaceId,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            status: "SKIPPED",
            message: "Scanner currently supports built-in CDC Action Zone only. Custom scripts still run client-side."
          });
          continue;
        }

        const candles = getClosedCandles(await marketService.getCandles(rule.symbol, rule.timeframe, DEFAULT_SCAN_LIMIT));
        if (candles.length < 50) {
          summary.skipped += 1;
          summary.results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            workspaceId: rule.workspaceId,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            status: "SKIPPED",
            message: "Not enough closed candles to calculate signal"
          });
          continue;
        }

        const result = calculateCdcActionZone({
          symbol: rule.symbol,
          timeframe: rule.timeframe,
          candles,
          params: paramsToRecord(rule.paramsJson)
        });

        if (!matchesCondition(result, rule.condition)) {
          summary.results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            workspaceId: rule.workspaceId,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            status: "NO_SIGNAL",
            signalType: result.latest.signal,
            zone: result.latest.zone,
            message: `No matching signal for condition ${rule.condition}`
          });
          continue;
        }

        const latestCandle = candles[candles.length - 1];
        const signalType = getSignalType(result, rule.condition);
        const candleCloseTime = new Date(latestCandle.closeTime);

        const existingSignal = await prisma.signal.findFirst({
          where: {
            workspaceId: rule.workspaceId,
            signalRuleId: rule.id,
            signalType,
            candleCloseTime
          }
        });

        if (existingSignal) {
          summary.results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            workspaceId: rule.workspaceId,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            status: "DUPLICATE",
            signalType,
            zone: result.latest.zone,
            message: "Signal already saved for this candle"
          });
          continue;
        }

        await prisma.signal.create({
          data: {
            workspaceId: rule.workspaceId,
            signalRuleId: rule.id,
            exchange: rule.exchange,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            indicatorKey: rule.indicatorKey,
            signalType,
            zone: result.latest.zone,
            price: new Prisma.Decimal(result.latest.price),
            candleCloseTime,
            payloadJson: {
              condition: rule.condition,
              latest: result.latest,
              alerts: result.alerts
            }
          }
        });

        summary.triggered += 1;

        let telegramSent = false;
        const telegramSetting = rule.workspace.telegramNotification;
        const telegramChatId = telegramService.resolveChatId(telegramSetting?.chatId);
        if (telegramSetting?.enabled && telegramChatId && telegramService.isConfigured()) {
          const message = telegramService.buildSignalMessage({
            ruleName: rule.name,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            signalType,
            zone: result.latest.zone,
            price: result.latest.price,
            candleCloseTime,
            indicatorKey: rule.indicatorKey
          });
          await telegramService.sendMessage(telegramChatId, message);
          telegramSent = true;
          summary.telegramSent += 1;
        }

        summary.results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          workspaceId: rule.workspaceId,
          symbol: rule.symbol,
          timeframe: rule.timeframe,
          status: "TRIGGERED",
          signalType,
          zone: result.latest.zone,
          telegramSent,
          message: telegramSent ? "Signal saved and Telegram notification sent" : "Signal saved. Telegram not configured or disabled."
        });
      } catch (error) {
        summary.errors += 1;
        summary.results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          workspaceId: rule.workspaceId,
          symbol: rule.symbol,
          timeframe: rule.timeframe,
          status: "ERROR",
          message: error instanceof Error ? error.message : "Unexpected scanner error"
        });
      }
    }

    return summary;
  }
}

export const scannerService = new ScannerService();
