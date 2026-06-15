import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";
import { AppError } from "../../middleware/error.middleware";
import { createSignalRuleSchema, updateSignalRuleSchema } from "./signal-rule.schema";
import { builtinIndicators } from "../indicators/builtin-indicators";
import { COMPOSITE_ALL_KEY, isCompositeAllRule, readCompositeRuleComponents } from "./composite-rule";

export const signalRuleRoutes = Router();

function paramsToRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function validateBuiltInRule(indicatorKey: string, paramsJson: unknown) {
  if (isCompositeAllRule(indicatorKey)) {
    const components = readCompositeRuleComponents(paramsToRecord(paramsJson));
    if (components.length < 2) throw new AppError(400, "Composite ALL needs at least 2 indicators");
    if (components.length > 6) throw new AppError(400, "Composite ALL supports up to 6 indicators");

    const unsupported = components.find((component) => !builtinIndicators.some((indicator) => indicator.key === component.indicatorKey));
    if (unsupported) throw new AppError(400, `Unsupported composite component: ${unsupported.indicatorKey}`);
    return;
  }

  const exists = builtinIndicators.some((indicator) => indicator.key === indicatorKey);
  if (!exists) throw new AppError(400, "Unknown built-in indicator key");
}


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
      validateBuiltInRule(data.indicatorKey, data.paramsJson);
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

    const nextIndicatorType = data.indicatorType ?? existing.indicatorType;
    const nextIndicatorKey = data.indicatorKey ?? existing.indicatorKey;
    const nextParamsJson = data.paramsJson ?? existing.paramsJson;

    if (nextIndicatorType === "BUILT_IN") {
      validateBuiltInRule(nextIndicatorKey, nextParamsJson);
    }

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
