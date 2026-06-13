import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";
import { AppError } from "../../middleware/error.middleware";
import { createSignalRuleSchema, updateSignalRuleSchema } from "./signal-rule.schema";
import { builtinIndicators } from "../indicators/builtin-indicators";

export const signalRuleRoutes = Router();

signalRuleRoutes.get("/", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const rules = await prisma.signalRule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: { indicatorTemplate: true }
    });
    res.json({ rules });
  } catch (error) {
    next(error);
  }
});

signalRuleRoutes.post("/", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const data = createSignalRuleSchema.parse(req.body);

    if (data.indicatorType === "BUILT_IN") {
      const exists = builtinIndicators.some((indicator) => indicator.key === data.indicatorKey);
      if (!exists) throw new AppError(400, "Unknown built-in indicator key");
    }

    if (data.indicatorType === "CUSTOM_SCRIPT") {
      if (!data.indicatorTemplateId) throw new AppError(400, "indicatorTemplateId is required for custom script rule");
      const template = await prisma.indicatorTemplate.findFirst({
        where: { id: data.indicatorTemplateId, workspaceId }
      });
      if (!template) throw new AppError(404, "Custom indicator template not found");
    }

    const rule = await prisma.signalRule.create({
      data: { ...data, workspaceId, paramsJson: data.paramsJson as any },
      include: { indicatorTemplate: true }
    });

    res.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
});

signalRuleRoutes.patch("/:id", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const data = updateSignalRuleSchema.parse(req.body);

    const existing = await prisma.signalRule.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) throw new AppError(404, "Signal rule not found");

    const rule = await prisma.signalRule.update({
      where: { id: req.params.id },
      data: { ...data, paramsJson: data.paramsJson as any },
      include: { indicatorTemplate: true }
    });

    res.json({ rule });
  } catch (error) {
    next(error);
  }
});

signalRuleRoutes.delete("/:id", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const existing = await prisma.signalRule.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) throw new AppError(404, "Signal rule not found");

    await prisma.signalRule.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
