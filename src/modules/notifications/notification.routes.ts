import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireWorkspaceId } from "../../middleware/workspace.middleware";
import { AppError } from "../../middleware/error.middleware";
import { telegramService } from "./telegram.service";
import { telegramSettingSchema, telegramTestSchema } from "./notification.schema";

export const notificationRoutes = Router();

notificationRoutes.get("/telegram", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const setting = await prisma.telegramNotificationSetting.findUnique({ where: { workspaceId } });

    res.json({
      setting: setting ?? { chatId: telegramService.hasDefaultChatId() ? null : null, enabled: false },
      botConfigured: telegramService.isConfigured(),
      defaultChatIdConfigured: telegramService.hasDefaultChatId()
    });
  } catch (error) {
    next(error);
  }
});

notificationRoutes.put("/telegram", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const data = telegramSettingSchema.parse(req.body);

    const setting = await prisma.telegramNotificationSetting.upsert({
      where: { workspaceId },
      update: {
        chatId: data.chatId || null,
        enabled: data.enabled
      },
      create: {
        workspaceId,
        chatId: data.chatId || null,
        enabled: data.enabled
      }
    });

    res.json({
      setting,
      botConfigured: telegramService.isConfigured(),
      defaultChatIdConfigured: telegramService.hasDefaultChatId()
    });
  } catch (error) {
    next(error);
  }
});

notificationRoutes.post("/telegram/test", async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req);
    const data = telegramTestSchema.parse(req.body);
    const setting = await prisma.telegramNotificationSetting.findUnique({ where: { workspaceId } });
    const chatId = data.chatId || setting?.chatId || telegramService.getDefaultChatId();

    if (!telegramService.isConfigured()) {
      throw new AppError(400, "TELEGRAM_BOT_TOKEN is not configured in API .env");
    }
    if (!chatId) {
      throw new AppError(400, "Telegram chat id is required. Save it in Telegram settings or set TELEGRAM_CHAT_ID in API .env");
    }

    await telegramService.sendTestMessage(chatId);
    res.json({ ok: true, message: "Telegram test message sent" });
  } catch (error) {
    next(error);
  }
});
