import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { AppError } from "./error.middleware";

const workspaceIdPattern = /^[a-zA-Z0-9_-]{8,80}$/;

export async function workspaceMiddleware(req: Request, _res: Response, next: NextFunction) {
  const headerValue = req.header("X-Workspace-Id") || req.header("x-workspace-id");

  if (!headerValue || !workspaceIdPattern.test(headerValue)) {
    return next(new AppError(400, "Missing or invalid X-Workspace-Id header"));
  }

  req.workspaceId = headerValue;

  await prisma.workspace.upsert({
    where: { id: headerValue },
    update: {},
    create: { id: headerValue }
  });

  next();
}

export function requireWorkspaceId(req: Request): string {
  if (!req.workspaceId) {
    throw new AppError(400, "Workspace context is missing");
  }
  return req.workspaceId;
}
