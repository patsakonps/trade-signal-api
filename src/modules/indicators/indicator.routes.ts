import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";
import { AppError } from "../../middleware/error.middleware";
import { marketService } from "../market/market.service";
import { CDC_ACTION_ZONE_KEY } from "./cdc-action-zone.service";
import { builtinIndicators } from "./builtin-indicators";
import { calculateBuiltInIndicator, getBuiltInIndicatorDefinition } from "./registry";
import { indicatorTemplateCreateSchema, indicatorTemplateUpdateSchema } from "./indicator.schema";
import { z } from "zod";
import type { Candle } from "../market/market.types";

export const indicatorRoutes = Router();

const indicatorQuerySchema = z.object({
  symbol: z.string().default("BTCUSDT"),
  timeframe: z.string().default("4h"),
  limit: z.coerce.number().int().min(50).max(1000).default(240)
});

function getClosedCandles(candles: Candle[]): Candle[] {
  const now = Date.now();
  if (!candles.length) return candles;
  const last = candles[candles.length - 1];
  return last.closeTime > now ? candles.slice(0, -1) : candles;
}

indicatorRoutes.get("/templates", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const customTemplates = await prisma.indicatorTemplate.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      templates: [...builtinIndicators, ...customTemplates]
    });
  } catch (error) {
    next(error);
  }
});

indicatorRoutes.post("/templates", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const data = indicatorTemplateCreateSchema.parse(req.body);

    if (builtinIndicators.some((indicator) => indicator.key === data.key)) {
      throw new AppError(400, "This indicator key is reserved by a built-in indicator");
    }

    const template = await prisma.indicatorTemplate.create({
      data: {
        workspaceId,
        name: data.name,
        key: data.key,
        script: data.script,
        paramsJson: data.paramsJson as any,
        enabled: data.enabled
      }
    });

    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
});

indicatorRoutes.get("/templates/:id", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const builtin = builtinIndicators.find((item) => item.id === req.params.id || item.key === req.params.id);
    if (builtin) return res.json({ template: builtin });

    const template = await prisma.indicatorTemplate.findFirst({
      where: { id: req.params.id, workspaceId }
    });
    if (!template) throw new AppError(404, "Indicator template not found");

    res.json({ template });
  } catch (error) {
    next(error);
  }
});

indicatorRoutes.patch("/templates/:id", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const data = indicatorTemplateUpdateSchema.parse(req.body);

    if (builtinIndicators.some((indicator) => indicator.id === req.params.id || indicator.key === req.params.id)) {
      throw new AppError(400, "Built-in indicators cannot be edited. Duplicate it as a custom indicator instead.");
    }

    const existing = await prisma.indicatorTemplate.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) throw new AppError(404, "Indicator template not found");

    if (data.key && builtinIndicators.some((indicator) => indicator.key === data.key)) {
      throw new AppError(400, "This indicator key is reserved by a built-in indicator");
    }

    const template = await prisma.indicatorTemplate.update({
      where: { id: req.params.id },
      data: { ...data, paramsJson: data.paramsJson as any }
    });

    res.json({ template });
  } catch (error) {
    next(error);
  }
});

indicatorRoutes.delete("/templates/:id", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);

    if (builtinIndicators.some((indicator) => indicator.id === req.params.id || indicator.key === req.params.id)) {
      throw new AppError(400, "Built-in indicators cannot be deleted");
    }

    const existing = await prisma.indicatorTemplate.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) throw new AppError(404, "Indicator template not found");

    await prisma.indicatorTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});


indicatorRoutes.get("/built-in/:key", async (req, res, next) => {
  try {
    const indicatorKey = req.params.key.trim().toUpperCase();
    const indicatorDefinition = getBuiltInIndicatorDefinition(indicatorKey);
    if (!indicatorDefinition) throw new AppError(404, "Built-in indicator not found");

    const { symbol, timeframe, limit } = indicatorQuerySchema.parse(req.query);
    const normalizedSymbol = symbol.toUpperCase();
    const candles = getClosedCandles(await marketService.getCandles(normalizedSymbol, timeframe, limit));
    if (candles.length < indicatorDefinition.minCandles) {
      throw new AppError(400, `Not enough closed candles to calculate ${indicatorKey}`);
    }

    const result = calculateBuiltInIndicator(indicatorKey, { symbol: normalizedSymbol, timeframe, candles });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

indicatorRoutes.get("/cdc-action-zone", async (req, res, next) => {
  try {
    const { symbol, timeframe, limit } = indicatorQuerySchema.parse(req.query);
    const normalizedSymbol = symbol.toUpperCase();
    const indicatorDefinition = getBuiltInIndicatorDefinition(CDC_ACTION_ZONE_KEY);
    if (!indicatorDefinition) throw new AppError(500, "CDC Action Zone definition is missing");
    const candles = getClosedCandles(await marketService.getCandles(normalizedSymbol, timeframe, limit));
    if (candles.length < indicatorDefinition.minCandles) {
      throw new AppError(400, "Not enough closed candles to calculate CDC Action Zone");
    }
    const result = calculateBuiltInIndicator(CDC_ACTION_ZONE_KEY, { symbol: normalizedSymbol, timeframe, candles });

    res.json(result);
  } catch (error) {
    next(error);
  }
});
