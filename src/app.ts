import express from "express";
import cors from "cors";
import { corsOrigins } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { workspaceMiddleware } from "./middleware/workspace.middleware";
import { healthRoutes } from "./modules/health/health.routes";
import { workspaceRoutes } from "./modules/workspaces/workspace.routes";
import { marketRoutes } from "./modules/market/market.routes";
import { indicatorRoutes } from "./modules/indicators/indicator.routes";
import { watchlistRoutes } from "./modules/watchlist/watchlist.routes";
import { signalRuleRoutes } from "./modules/signal-rules/signal-rule.routes";
import { portfolioRoutes } from "./modules/portfolio/portfolio.routes";
import { importRoutes } from "./modules/import/import.routes";
import { notificationRoutes } from "./modules/notifications/notification.routes";
import { scannerRoutes } from "./modules/scanner/scanner.routes";
import { signalRoutes } from "./modules/signals/signal.routes";
import { strategyLabRoutes } from "./modules/strategy-lab/strategy-lab.routes";

export const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes("*") || corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    }
  })
);

app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRoutes);
app.use("/api/workspaces", workspaceRoutes);

app.use("/api/market", workspaceMiddleware, marketRoutes);
app.use("/api/indicators", workspaceMiddleware, indicatorRoutes);
app.use("/api/watchlist", workspaceMiddleware, watchlistRoutes);
app.use("/api/signal-rules", workspaceMiddleware, signalRuleRoutes);
app.use("/api/portfolio", workspaceMiddleware, portfolioRoutes);
app.use("/api/import", workspaceMiddleware, importRoutes);
app.use("/api/notifications", workspaceMiddleware, notificationRoutes);
app.use("/api/scanner", scannerRoutes);
app.use("/api/signals", workspaceMiddleware, signalRoutes);
app.use("/api/strategy-lab", workspaceMiddleware, strategyLabRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
