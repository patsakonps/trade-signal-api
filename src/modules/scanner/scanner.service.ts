import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { marketService } from "../market/market.service";
import { calculateBuiltInIndicator, getBuiltInIndicatorDefinition } from "../indicators/registry";
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
  candleCloseTime?: string;
  price?: number;
};

type ScanSummary = {
  scannedAt: string;
  durationMs: number;
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
  return last.closeTime > now ? candles.slice(0, -1) : candles;
}

function normalizeCondition(condition: string): string {
  return condition.trim().toUpperCase().replace(/[\s-]+/g, "_");
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

  return result.alerts.some((alert) => normalizeCondition(alert.name) === normalized && alert.triggered);
}

function getSignalType(result: IndicatorResult, condition: string): string {
  if (result.latest.signal && result.latest.signal !== "HOLD" && result.latest.signal !== "NONE") {
    return result.latest.signal;
  }

  const normalized = normalizeCondition(condition);
  if (normalized === "ZONE_CHANGED" && result.latest.zone) return `ZONE_${result.latest.zone}`;
  if (zoneConditions.has(normalized)) return normalized;

  const matchedAlert = result.alerts.find((alert) => normalizeCondition(alert.name) === normalized && alert.triggered);
  if (matchedAlert) return normalized;

  return "SIGNAL";
}

function paramsToRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected scanner error";
}

function logScannerEvent(level: "info" | "warn" | "error", message: string, meta: Record<string, unknown> = {}) {
  const payload = { scope: "scanner", message, ...meta };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export class ScannerService {
  async run(options: { workspaceId?: string | null } = {}): Promise<ScanSummary> {
    const startedAt = Date.now();
    const scannedAt = new Date().toISOString();

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
      scannedAt,
      durationMs: 0,
      scannedRules: rules.length,
      triggered: 0,
      telegramSent: 0,
      skipped: 0,
      errors: 0,
      results: []
    };

    logScannerEvent("info", "scan_started", { workspaceId: options.workspaceId ?? "ALL", rules: rules.length });

    for (const rule of rules) {
      try {
        if (rule.indicatorType !== "BUILT_IN") {
          summary.skipped += 1;
          summary.results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            workspaceId: rule.workspaceId,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            status: "SKIPPED",
            message: "Scanner currently supports server-side built-in indicators only. Custom scripts still run client-side."
          });
          continue;
        }

        const indicatorDefinition = getBuiltInIndicatorDefinition(rule.indicatorKey);
        if (!indicatorDefinition) {
          summary.skipped += 1;
          summary.results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            workspaceId: rule.workspaceId,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            status: "SKIPPED",
            message: `Unsupported built-in indicator: ${rule.indicatorKey}`
          });
          continue;
        }

        const candles = getClosedCandles(await marketService.getCandles(rule.symbol, rule.timeframe, DEFAULT_SCAN_LIMIT));
        if (candles.length < indicatorDefinition.minCandles) {
          summary.skipped += 1;
          summary.results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            workspaceId: rule.workspaceId,
            symbol: rule.symbol,
            timeframe: rule.timeframe,
            status: "SKIPPED",
            message: `Not enough closed candles to calculate ${rule.indicatorKey}. Required ${indicatorDefinition.minCandles}, got ${candles.length}`
          });
          continue;
        }

        const result = calculateBuiltInIndicator(rule.indicatorKey, {
          symbol: rule.symbol,
          timeframe: rule.timeframe,
          candles,
          params: paramsToRecord(rule.paramsJson)
        });

        const latestCandle = candles[candles.length - 1];
        const candleCloseTime = new Date(latestCandle.closeTime);

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
            candleCloseTime: candleCloseTime.toISOString(),
            price: result.latest.price,
            message: `No matching signal for condition ${rule.condition}`
          });
          continue;
        }

        const signalType = getSignalType(result, rule.condition);

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
            candleCloseTime: candleCloseTime.toISOString(),
            price: result.latest.price,
            message: "Signal already saved for this candle"
          });
          continue;
        }

        const createdSignal = await prisma.signal.create({
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
        let message = "Signal saved. Telegram not configured or disabled.";
        const telegramSetting = rule.workspace.telegramNotification;
        const telegramChatId = telegramService.resolveChatId(telegramSetting?.chatId);
        const shouldSendTelegram = Boolean(telegramSetting?.enabled && telegramChatId && telegramService.isConfigured());

        if (shouldSendTelegram) {
          try {
            const telegramMessage = telegramService.buildSignalMessage({
              ruleName: rule.name,
              symbol: rule.symbol,
              timeframe: rule.timeframe,
              signalType,
              zone: result.latest.zone,
              price: result.latest.price,
              candleCloseTime,
              indicatorKey: rule.indicatorKey
            });
            await telegramService.sendMessage(telegramChatId, telegramMessage);
            telegramSent = true;
            summary.telegramSent += 1;
            message = "Signal saved and Telegram notification sent";
          } catch (telegramError) {
            await prisma.signal.delete({ where: { id: createdSignal.id } }).catch(() => undefined);
            summary.triggered -= 1;
            summary.errors += 1;
            const errorMessage = `Telegram failed, signal was not saved so the next scan can retry: ${getErrorMessage(telegramError)}`;
            logScannerEvent("error", "telegram_send_failed", {
              ruleId: rule.id,
              workspaceId: rule.workspaceId,
              symbol: rule.symbol,
              timeframe: rule.timeframe,
              candleCloseTime: candleCloseTime.toISOString(),
              error: getErrorMessage(telegramError)
            });
            summary.results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              workspaceId: rule.workspaceId,
              symbol: rule.symbol,
              timeframe: rule.timeframe,
              status: "ERROR",
              signalType,
              zone: result.latest.zone,
              candleCloseTime: candleCloseTime.toISOString(),
              price: result.latest.price,
              telegramSent: false,
              message: errorMessage
            });
            continue;
          }
        } else if (telegramSetting?.enabled) {
          message = !telegramService.isConfigured()
            ? "Signal saved. Telegram bot token is missing."
            : "Signal saved. Telegram chat id is missing.";
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
          candleCloseTime: candleCloseTime.toISOString(),
          price: result.latest.price,
          telegramSent,
          message
        });
      } catch (error) {
        summary.errors += 1;
        logScannerEvent("error", "rule_scan_failed", {
          ruleId: rule.id,
          workspaceId: rule.workspaceId,
          symbol: rule.symbol,
          timeframe: rule.timeframe,
          error: getErrorMessage(error)
        });
        summary.results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          workspaceId: rule.workspaceId,
          symbol: rule.symbol,
          timeframe: rule.timeframe,
          status: "ERROR",
          message: getErrorMessage(error)
        });
      }
    }

    summary.durationMs = Date.now() - startedAt;
    logScannerEvent(summary.errors ? "warn" : "info", "scan_finished", {
      workspaceId: options.workspaceId ?? "ALL",
      scannedRules: summary.scannedRules,
      triggered: summary.triggered,
      telegramSent: summary.telegramSent,
      skipped: summary.skipped,
      errors: summary.errors,
      durationMs: summary.durationMs
    });

    return summary;
  }
}

export const scannerService = new ScannerService();
