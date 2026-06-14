import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";

export const signalRoutes = Router();

const signalHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  symbol: z.string().trim().optional(),
  timeframe: z.string().trim().optional()
});

signalRoutes.get("/", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const query = signalHistoryQuerySchema.parse(req.query);
    const symbol = query.symbol ? query.symbol.toUpperCase() : undefined;

    const signals = await prisma.signal.findMany({
      where: {
        workspaceId,
        ...(symbol ? { symbol } : {}),
        ...(query.timeframe ? { timeframe: query.timeframe } : {})
      },
      orderBy: { candleCloseTime: "desc" },
      take: query.limit,
      include: {
        signalRule: {
          select: {
            id: true,
            name: true,
            condition: true,
            enabled: true
          }
        }
      }
    });

    res.json({
      signals: signals.map((signal) => ({
        id: signal.id,
        exchange: signal.exchange,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        indicatorKey: signal.indicatorKey,
        signalType: signal.signalType,
        zone: signal.zone,
        price: Number(signal.price.toString()),
        candleCloseTime: signal.candleCloseTime.toISOString(),
        createdAt: signal.createdAt.toISOString(),
        rule: signal.signalRule
          ? {
              id: signal.signalRule.id,
              name: signal.signalRule.name,
              condition: signal.signalRule.condition,
              enabled: signal.signalRule.enabled
            }
          : null
      }))
    });
  } catch (error) {
    next(error);
  }
});
