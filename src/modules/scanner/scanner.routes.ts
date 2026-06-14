import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError } from "../../middleware/error.middleware";
import { scannerService } from "./scanner.service";

export const scannerRoutes = Router();

const scannerRequestSchema = z.object({
  workspaceId: z.string().trim().min(4).max(80).optional()
});

function getWorkspaceIdFromRequest(req: import("express").Request, bodyWorkspaceId?: string) {
  return bodyWorkspaceId || (req.header("X-Workspace-Id") || req.header("x-workspace-id") || "").trim() || undefined;
}

function assertScannerAccess(req: import("express").Request, workspaceId?: string) {
  if (!env.SCANNER_SECRET) return;

  const provided = req.header("X-Scanner-Secret") || req.header("x-scanner-secret") || "";
  if (provided) {
    if (provided !== env.SCANNER_SECRET) throw new AppError(401, "Invalid scanner secret");
    return;
  }

  // Cloud Scheduler/global scans must use the secret. Workspace-scoped manual scans from the web app
  // are allowed because the rest of the app already uses X-Workspace-Id as the workspace boundary.
  if (!workspaceId) {
    throw new AppError(401, "Scanner secret is required for global scan");
  }
}

scannerRoutes.post("/run", async (req, res, next) => {
  try {
    const body = scannerRequestSchema.parse(req.body ?? {});
    const workspaceId = getWorkspaceIdFromRequest(req, body.workspaceId);
    assertScannerAccess(req, workspaceId);
    const summary = await scannerService.run({ workspaceId });
    res.json(summary);
  } catch (error) {
    next(error);
  }
});
