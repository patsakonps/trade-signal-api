import { Router } from "express";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";
import { backtestRequestSchema, compareRequestSchema } from "./strategy-lab.schema";
import { strategyLabService } from "./strategy-lab.service";

export const strategyLabRoutes = Router();

strategyLabRoutes.get("/runs", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await strategyLabService.listRuns(workspaceId, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

strategyLabRoutes.get("/runs/:id", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const result = await strategyLabService.getRun(workspaceId, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

strategyLabRoutes.post("/backtest", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const config = backtestRequestSchema.parse(req.body ?? {});
    const result = await strategyLabService.runBacktest(workspaceId, config);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

strategyLabRoutes.post("/compare", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const config = compareRequestSchema.parse(req.body ?? {});
    const result = await strategyLabService.compareRules(workspaceId, config);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
