-- Add Telegram notification settings per workspace
CREATE TABLE "TelegramNotificationSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "chatId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramNotificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramNotificationSetting_workspaceId_key" ON "TelegramNotificationSetting"("workspaceId");
CREATE INDEX "TelegramNotificationSetting_workspaceId_idx" ON "TelegramNotificationSetting"("workspaceId");

ALTER TABLE "TelegramNotificationSetting" ADD CONSTRAINT "TelegramNotificationSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prevent duplicate signal rows for the same rule/signal/candle.
CREATE UNIQUE INDEX "Signal_workspaceId_signalRuleId_signalType_candleCloseTime_key" ON "Signal"("workspaceId", "signalRuleId", "signalType", "candleCloseTime");
