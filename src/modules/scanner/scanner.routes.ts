import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError } from "../../middleware/error.middleware";
import { scannerService } from "./scanner.service";

export const scannerRoutes = Router();

const scannerRequestSchema = z.object({
  workspaceId: z.string().trim().min(4).max(80).optional()
});

function assertScannerAccess(req: import("express").Request) {
  if (!env.SCANNER_SECRET) return;
  const provided = req.header("X-Scanner-Secret") || req.header("x-scanner-secret");
  if (provided !== env.SCANNER_SECRET) {
    throw new AppError(401, "Invalid scanner secret");
  }
}

scannerRoutes.post("/run", async (req, res, next) => {
  try {
    assertScannerAccess(req);
    const body = scannerRequestSchema.parse(req.body ?? {});
    const workspaceId = body.workspaceId || (req.header("X-Workspace-Id") || req.header("x-workspace-id") || "").trim() || undefined;
    const summary = await scannerService.run({ workspaceId });
    res.json(summary);
  } catch (error) {
    next(error);
  }
});
