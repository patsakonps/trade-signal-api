-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'BINANCE',
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "initialCapital" DOUBLE PRECISION NOT NULL,
    "finalCapital" DOUBLE PRECISION NOT NULL,
    "netProfitPct" DOUBLE PRECISION NOT NULL,
    "winrate" DOUBLE PRECISION NOT NULL,
    "maxDrawdownPct" DOUBLE PRECISION NOT NULL,
    "profitFactor" DOUBLE PRECISION NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "winningTrades" INTEGER NOT NULL DEFAULT 0,
    "losingTrades" INTEGER NOT NULL DEFAULT 0,
    "avgWinPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgLossPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectancyPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestTrade" (
    "id" TEXT NOT NULL,
    "backtestRunId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitTime" TIMESTAMP(3) NOT NULL,
    "exitPrice" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exitFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl" DOUBLE PRECISION NOT NULL,
    "pnlPct" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestRun_workspaceId_idx" ON "BacktestRun"("workspaceId");

-- CreateIndex
CREATE INDEX "BacktestRun_workspaceId_ruleId_idx" ON "BacktestRun"("workspaceId", "ruleId");

-- CreateIndex
CREATE INDEX "BacktestRun_workspaceId_score_idx" ON "BacktestRun"("workspaceId", "score");

-- CreateIndex
CREATE INDEX "BacktestTrade_backtestRunId_idx" ON "BacktestTrade"("backtestRunId");

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SignalRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestTrade" ADD CONSTRAINT "BacktestTrade_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
