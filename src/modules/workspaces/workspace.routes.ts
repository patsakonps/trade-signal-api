import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/error.middleware";

export const workspaceRoutes = Router();

const createWorkspaceSchema = z.object({
  id: z.string().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/)
});

workspaceRoutes.post("/", async (req, res, next) => {
  try {
    const { id } = createWorkspaceSchema.parse(req.body);
    const workspace = await prisma.workspace.upsert({
      where: { id },
      update: {},
      create: { id }
    });
    res.status(201).json({ workspace });
  } catch (error) {
    next(error);
  }
});

workspaceRoutes.get("/:id", async (req, res, next) => {
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: req.params.id } });
    if (!workspace) throw new AppError(404, "Workspace not found");
    res.json({ workspace });
  } catch (error) {
    next(error);
  }
});
