import { Router } from "express";
import multer from "multer";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";

export const importRoutes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

importRoutes.post("/binance-th", upload.single("file"), async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const fileName = req.file?.originalname ?? "unknown-file";
    const size = req.file?.size ?? 0;

    const summary = {
      fileName,
      size,
      note: "MVP mock import. Excel/CSV parser will be implemented in the portfolio phase.",
      rows: 128,
      buyRows: 74,
      sellRows: 41,
      feeRows: 13,
      assets: ["BTC", "ETH", "SOL"]
    };

    const job = await prisma.importJob.create({
      data: {
        workspaceId,
        source: "BINANCE_TH",
        fileName,
        status: "COMPLETED",
        summaryJson: summary
      }
    });

    res.status(201).json({ job, summary });
  } catch (error) {
    next(error);
  }
});
