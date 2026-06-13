import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";
import { AppError } from "../../middleware/error.middleware";
import { createWatchlistItemSchema } from "./watchlist.schema";

export const watchlistRoutes = Router();

watchlistRoutes.get("/", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const items = await prisma.watchlistItem.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

watchlistRoutes.post("/", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const data = createWatchlistItemSchema.parse(req.body);

    const item = await prisma.watchlistItem.upsert({
      where: {
        workspaceId_exchange_symbol_timeframe: {
          workspaceId,
          exchange: data.exchange,
          symbol: data.symbol,
          timeframe: data.timeframe
        }
      },
      update: {},
      create: { workspaceId, ...data }
    });

    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

watchlistRoutes.delete("/:id", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const existing = await prisma.watchlistItem.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) throw new AppError(404, "Watchlist item not found");

    await prisma.watchlistItem.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
