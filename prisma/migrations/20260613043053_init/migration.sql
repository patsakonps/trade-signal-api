-- CreateEnum
CREATE TYPE "IndicatorTemplateType" AS ENUM ('CUSTOM_SCRIPT');

-- CreateEnum
CREATE TYPE "RuleIndicatorType" AS ENUM ('BUILT_IN', 'CUSTOM_SCRIPT');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'BINANCE',
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicatorTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "IndicatorTemplateType" NOT NULL DEFAULT 'CUSTOM_SCRIPT',
    "script" TEXT NOT NULL,
    "paramsJson" JSONB NOT NULL DEFAULT '{}',
    "outputSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicatorTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'BINANCE',
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "indicatorType" "RuleIndicatorType" NOT NULL DEFAULT 'BUILT_IN',
    "indicatorKey" TEXT NOT NULL,
    "indicatorTemplateId" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'BUY_OR_SELL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "paramsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "signalRuleId" TEXT,
    "exchange" TEXT NOT NULL DEFAULT 'BINANCE',
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "indicatorKey" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "zone" TEXT,
    "price" DECIMAL(30,12) NOT NULL,
    "candleCloseTime" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DECIMAL(30,12) NOT NULL,
    "quantity" DECIMAL(30,12) NOT NULL,
    "fee" DECIMAL(30,12),
    "feeAsset" TEXT,
    "tradedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "quantity" DECIMAL(30,12) NOT NULL,
    "avgCost" DECIMAL(30,12) NOT NULL,
    "realizedPnl" DECIMAL(30,12) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "summaryJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchlistItem_workspaceId_idx" ON "WatchlistItem"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_workspaceId_exchange_symbol_timeframe_key" ON "WatchlistItem"("workspaceId", "exchange", "symbol", "timeframe");

-- CreateIndex
CREATE INDEX "IndicatorTemplate_workspaceId_idx" ON "IndicatorTemplate"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorTemplate_workspaceId_key_key" ON "IndicatorTemplate"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "SignalRule_workspaceId_idx" ON "SignalRule"("workspaceId");

-- CreateIndex
CREATE INDEX "SignalRule_workspaceId_symbol_timeframe_idx" ON "SignalRule"("workspaceId", "symbol", "timeframe");

-- CreateIndex
CREATE INDEX "Signal_workspaceId_idx" ON "Signal"("workspaceId");

-- CreateIndex
CREATE INDEX "Signal_workspaceId_symbol_timeframe_idx" ON "Signal"("workspaceId", "symbol", "timeframe");

-- CreateIndex
CREATE INDEX "Trade_workspaceId_idx" ON "Trade"("workspaceId");

-- CreateIndex
CREATE INDEX "Holding_workspaceId_idx" ON "Holding"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_workspaceId_asset_key" ON "Holding"("workspaceId", "asset");

-- CreateIndex
CREATE INDEX "ImportJob_workspaceId_idx" ON "ImportJob"("workspaceId");

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorTemplate" ADD CONSTRAINT "IndicatorTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRule" ADD CONSTRAINT "SignalRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRule" ADD CONSTRAINT "SignalRule_indicatorTemplateId_fkey" FOREIGN KEY ("indicatorTemplateId") REFERENCES "IndicatorTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_signalRuleId_fkey" FOREIGN KEY ("signalRuleId") REFERENCES "SignalRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
