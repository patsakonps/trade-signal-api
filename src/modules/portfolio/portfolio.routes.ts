import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";

export const portfolioRoutes = Router();

portfolioRoutes.get("/holdings", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const holdings = await prisma.holding.findMany({ where: { workspaceId }, orderBy: { asset: "asc" } });

    if (holdings.length) {
      return res.json({ holdings });
    }

    return res.json({
      holdings: [
        { asset: "BTC", quantity: "0.1824", avgCost: "54820", price: "67240", value: "12268.57", pnlPercent: 22.65 },
        { asset: "ETH", quantity: "1.21", avgCost: "2940", price: "3410", value: "4126.10", pnlPercent: 15.98 },
        { asset: "SOL", quantity: "13.14", avgCost: "132", price: "154.22", value: "2026.00", pnlPercent: 16.83 }
      ],
      mock: true
    });
  } catch (error) {
    next(error);
  }
});

portfolioRoutes.get("/trades", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const trades = await prisma.trade.findMany({ where: { workspaceId }, orderBy: { tradedAt: "desc" }, take: 100 });
    res.json({ trades });
  } catch (error) {
    next(error);
  }
});
