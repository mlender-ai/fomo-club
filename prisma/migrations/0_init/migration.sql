-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('RUNNING', 'STOPPED', 'DEGRADED');

-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "StrategyRunStatus" AS ENUM ('SIGNAL', 'NO_SIGNAL', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderRole" AS ENUM ('MAKER', 'TAKER');

-- CreateEnum
CREATE TYPE "TradeAction" AS ENUM ('BUY', 'SELL', 'CLOSE', 'STOP_LOSS', 'TAKE_PROFIT');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('ENTRY', 'EXIT', 'STOP_LOSS', 'TAKE_PROFIT', 'ERROR', 'INFO', 'RESTART');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SystemLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "StrategySessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NewsletterDigestStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "TarotAuthProvider" AS ENUM ('APPLE', 'GOOGLE', 'KAKAO', 'NAVER');

-- CreateEnum
CREATE TYPE "TarotMembershipStatus" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "TarotSpreadType" AS ENUM ('SINGLE', 'THREE_CARD');

-- CreateEnum
CREATE TYPE "TarotMarket" AS ENUM ('US', 'KR');

-- CreateEnum
CREATE TYPE "TarotInterpretationSource" AS ENUM ('LLM', 'CACHE', 'FALLBACK');

-- CreateEnum
CREATE TYPE "TarotCreditReason" AS ENUM ('SIGNUP_BONUS', 'PURCHASE', 'REWARD_AD', 'REWARD_SHARE', 'DRAW_SINGLE', 'DRAW_THREE', 'REFUND', 'STREAK_REWARD');

-- CreateEnum
CREATE TYPE "TarotDisclaimerVersion" AS ENUM ('V1');

-- CreateEnum
CREATE TYPE "TarotFeedbackRating" AS ENUM ('ONE', 'TWO', 'THREE', 'FOUR', 'FIVE');

-- CreateEnum
CREATE TYPE "TarotReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TarotCardStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TasteSubjectType" AS ENUM ('THEME', 'STOCK');

-- CreateEnum
CREATE TYPE "TasteSignalKind" AS ENUM ('MORE', 'LESS', 'VIEW_DEPTH', 'TAP_RELATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authProvider" "TarotAuthProvider",
    "authProviderId" TEXT,
    "membershipStatus" "TarotMembershipStatus" NOT NULL DEFAULT 'FREE',
    "pushToken" TEXT,
    "disclaimerVersion" "TarotDisclaimerVersion",
    "disclaimerAgreedAt" TIMESTAMP(3),
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "streakLastDate" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'paper',
    "status" "BotStatus" NOT NULL DEFAULT 'STOPPED',
    "exchangeKey" TEXT NOT NULL DEFAULT 'mock-binance-futures',
    "baseAsset" TEXT NOT NULL DEFAULT 'USDT',
    "paperBalance" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "reservedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "makerFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0002,
    "takerFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0005,
    "entryOrderRole" "OrderRole" NOT NULL DEFAULT 'TAKER',
    "exitOrderRole" "OrderRole" NOT NULL DEFAULT 'TAKER',
    "slippageBps" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "heartbeatAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastDailyReportSentAt" TIMESTAMP(3),
    "lastWeeklyReportSentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "StrategyStatus" NOT NULL DEFAULT 'PAUSED',
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT '15m',
    "config" JSONB NOT NULL,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategySession" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "runLabel" TEXT NOT NULL,
    "status" "StrategySessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "configSnapshot" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "sessionId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "sessionName" TEXT,
    "runLabel" TEXT,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "closedPositionCount" INTEGER NOT NULL DEFAULT 0,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "lossCount" INTEGER NOT NULL DEFAULT 0,
    "grossPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWinningPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLosingPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestTrade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "worstTrade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "strategyPerformance" JSONB NOT NULL,
    "entryReasonPerformance" JSONB NOT NULL,
    "exitReasonPerformance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRun" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "sessionId" TEXT,
    "runLabel" TEXT,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "status" "StrategyRunStatus" NOT NULL,
    "signalType" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "primaryReasonCode" TEXT,
    "primaryReasonText" TEXT,
    "reasonsText" TEXT,
    "reasons" JSONB,
    "indicators" JSONB,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "strategyId" TEXT,
    "sessionId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'LONG',
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "entryValue" DOUBLE PRECISION NOT NULL,
    "exitValue" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feesPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "entryReasonCode" TEXT NOT NULL,
    "entryReasonText" TEXT NOT NULL,
    "entryReasonMeta" JSONB NOT NULL,
    "exitReasonCode" TEXT,
    "exitReasonText" TEXT,
    "exitReasonMeta" JSONB,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "strategyId" TEXT,
    "positionId" TEXT,
    "sessionId" TEXT,
    "symbol" TEXT NOT NULL,
    "action" "TradeAction" NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'LONG',
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "notional" DOUBLE PRECISION NOT NULL,
    "orderRole" "OrderRole" NOT NULL,
    "feeRate" DOUBLE PRECISION NOT NULL,
    "slippageBps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "reasonMeta" JSONB NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalOrderId" TEXT,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "strategyId" TEXT,
    "sessionId" TEXT,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketCandle" (
    "id" TEXT NOT NULL,
    "exchangeKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketCandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "botId" TEXT,
    "level" "SystemLogLevel" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredSectors" JSONB NOT NULL,
    "preferredTickers" JSONB NOT NULL,
    "newsletterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newsletterEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchNews" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT,
    "sectorTag" TEXT NOT NULL,
    "tickerTags" JSONB NOT NULL,
    "importanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "analysis" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TickerInsight" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "company" TEXT,
    "sectorTag" TEXT NOT NULL,
    "importanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "technicalAnalysis" TEXT NOT NULL,
    "patternAnalysis" JSONB NOT NULL,
    "marketContext" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "linkedNewsIds" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "TickerInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterDigest" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "status" "NewsletterDigestStatus" NOT NULL DEFAULT 'GENERATED',
    "subject" TEXT NOT NULL,
    "previewText" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "htmlBody" TEXT,
    "textBody" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMeetingThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "topic" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "nextAction" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMeetingThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMeetingMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "references" JSONB,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMeetingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "arcana" TEXT NOT NULL DEFAULT 'major',
    "number" INTEGER NOT NULL,
    "keywords" JSONB NOT NULL,
    "keywordsKo" JSONB NOT NULL,
    "meaningUpright" TEXT NOT NULL,
    "meaningReversed" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "toneGuide" TEXT NOT NULL,
    "status" "TarotCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarotCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotCreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "TarotCreditReason" NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotDrawHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "market" "TarotMarket" NOT NULL,
    "spread" "TarotSpreadType" NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "source" "TarotInterpretationSource" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "creditCost" INTEGER NOT NULL,
    "cacheKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotDrawHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotDrawHistoryCard" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "slot" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TarotDrawHistoryCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "market" "TarotMarket" NOT NULL,
    "label" TEXT,
    "alertEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "rating" "TarotFeedbackRating" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TarotReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotPromptVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarotPromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotCardCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "firstDrawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drawCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TarotCardCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "clientTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLoginAttempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "targetType" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSessionConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "invalidatedBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSessionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmotionVote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "emotion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "votedDate" TEXT NOT NULL,
    "situationKey" TEXT,
    "resolveKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmotionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "challengeDate" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 0,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FomoIndexSnapshot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "marketHeat" INTEGER NOT NULL,
    "communityHeat" INTEGER NOT NULL,
    "emotionHeat" INTEGER NOT NULL,
    "whaleHeat" INTEGER NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "insights" JSONB NOT NULL,
    "prevDayDelta" INTEGER NOT NULL,
    "avg30Delta" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FomoIndexSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordCardSnapshot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "cards" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordCardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TasteSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "subjectType" "TasteSubjectType" NOT NULL,
    "subject" TEXT NOT NULL,
    "signal" "TasteSignalKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TasteSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgmentLedger" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asset" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "symbol" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "priceAt" DECIMAL(30,10) NOT NULL,
    "actor" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "JudgmentLedger_pkey" PRIMARY KEY ("id","date")
);

-- CreateTable
CREATE TABLE "QualityLedger" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'engine',

    CONSTRAINT "QualityLedger_pkey" PRIMARY KEY ("id","date")
);

-- CreateTable
CREATE TABLE "SupplyDemandDaily" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "foreignNet" DOUBLE PRECISION NOT NULL,
    "institutionNet" DOUBLE PRECISION NOT NULL,
    "individualNet" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyDemandDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_authProvider_authProviderId_idx" ON "User"("authProvider", "authProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "User_authProvider_authProviderId_key" ON "User"("authProvider", "authProviderId");

-- CreateIndex
CREATE INDEX "Bot_userId_idx" ON "Bot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_botId_key_key" ON "Strategy"("botId", "key");

-- CreateIndex
CREATE INDEX "StrategySession_botId_status_startedAt_idx" ON "StrategySession"("botId", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailySummary_scopeKey_key" ON "DailySummary"("scopeKey");

-- CreateIndex
CREATE INDEX "DailySummary_botId_dateKey_idx" ON "DailySummary"("botId", "dateKey");

-- CreateIndex
CREATE INDEX "DailySummary_sessionId_dateKey_idx" ON "DailySummary"("sessionId", "dateKey");

-- CreateIndex
CREATE INDEX "StrategyRun_botId_idx" ON "StrategyRun"("botId");

-- CreateIndex
CREATE INDEX "StrategyRun_strategyId_idx" ON "StrategyRun"("strategyId");

-- CreateIndex
CREATE INDEX "StrategyRun_sessionId_executedAt_idx" ON "StrategyRun"("sessionId", "executedAt");

-- CreateIndex
CREATE INDEX "Position_botId_symbol_status_idx" ON "Position"("botId", "symbol", "status");

-- CreateIndex
CREATE INDEX "Position_strategyId_idx" ON "Position"("strategyId");

-- CreateIndex
CREATE INDEX "Position_sessionId_status_idx" ON "Position"("sessionId", "status");

-- CreateIndex
CREATE INDEX "Trade_botId_executedAt_idx" ON "Trade"("botId", "executedAt");

-- CreateIndex
CREATE INDEX "Trade_strategyId_idx" ON "Trade"("strategyId");

-- CreateIndex
CREATE INDEX "Trade_positionId_idx" ON "Trade"("positionId");

-- CreateIndex
CREATE INDEX "Trade_sessionId_executedAt_idx" ON "Trade"("sessionId", "executedAt");

-- CreateIndex
CREATE INDEX "Alert_botId_idx" ON "Alert"("botId");

-- CreateIndex
CREATE INDEX "Alert_strategyId_idx" ON "Alert"("strategyId");

-- CreateIndex
CREATE INDEX "Alert_sessionId_idx" ON "Alert"("sessionId");

-- CreateIndex
CREATE INDEX "MarketCandle_symbol_timeframe_openTime_idx" ON "MarketCandle"("symbol", "timeframe", "openTime");

-- CreateIndex
CREATE UNIQUE INDEX "MarketCandle_exchangeKey_symbol_timeframe_openTime_key" ON "MarketCandle"("exchangeKey", "symbol", "timeframe", "openTime");

-- CreateIndex
CREATE INDEX "SystemLog_botId_idx" ON "SystemLog"("botId");

-- CreateIndex
CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchProfile_userId_key" ON "ResearchProfile"("userId");

-- CreateIndex
CREATE INDEX "ResearchNews_sectorTag_importanceScore_idx" ON "ResearchNews"("sectorTag", "importanceScore");

-- CreateIndex
CREATE INDEX "ResearchNews_publishedAt_idx" ON "ResearchNews"("publishedAt");

-- CreateIndex
CREATE INDEX "TickerInsight_ticker_generatedAt_idx" ON "TickerInsight"("ticker", "generatedAt");

-- CreateIndex
CREATE INDEX "TickerInsight_sectorTag_importanceScore_idx" ON "TickerInsight"("sectorTag", "importanceScore");

-- CreateIndex
CREATE INDEX "NewsletterDigest_profileId_idx" ON "NewsletterDigest"("profileId");

-- CreateIndex
CREATE INDEX "NewsletterDigest_generatedAt_idx" ON "NewsletterDigest"("generatedAt");

-- CreateIndex
CREATE INDEX "NewsletterDigest_status_scheduledFor_idx" ON "NewsletterDigest"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "AgentMeetingThread_userId_createdAt_idx" ON "AgentMeetingThread"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMeetingMessage_threadId_createdAt_idx" ON "AgentMeetingMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMeetingMessage_threadId_position_key" ON "AgentMeetingMessage"("threadId", "position");

-- CreateIndex
CREATE INDEX "TarotCreditLedger_userId_createdAt_idx" ON "TarotCreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TarotDrawHistory_idempotencyKey_key" ON "TarotDrawHistory"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TarotDrawHistory_userId_createdAt_idx" ON "TarotDrawHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TarotDrawHistory_ticker_createdAt_idx" ON "TarotDrawHistory"("ticker", "createdAt");

-- CreateIndex
CREATE INDEX "TarotDrawHistoryCard_drawId_idx" ON "TarotDrawHistoryCard"("drawId");

-- CreateIndex
CREATE INDEX "TarotDrawHistoryCard_cardId_idx" ON "TarotDrawHistoryCard"("cardId");

-- CreateIndex
CREATE INDEX "TarotFavorite_userId_idx" ON "TarotFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TarotFavorite_userId_ticker_key" ON "TarotFavorite"("userId", "ticker");

-- CreateIndex
CREATE INDEX "TarotFeedback_drawId_idx" ON "TarotFeedback"("drawId");

-- CreateIndex
CREATE UNIQUE INDEX "TarotFeedback_userId_drawId_key" ON "TarotFeedback"("userId", "drawId");

-- CreateIndex
CREATE INDEX "TarotReport_userId_idx" ON "TarotReport"("userId");

-- CreateIndex
CREATE INDEX "TarotReport_drawId_idx" ON "TarotReport"("drawId");

-- CreateIndex
CREATE INDEX "TarotReport_status_createdAt_idx" ON "TarotReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TarotPromptVersion_version_key" ON "TarotPromptVersion"("version");

-- CreateIndex
CREATE INDEX "TarotPromptVersion_isActive_idx" ON "TarotPromptVersion"("isActive");

-- CreateIndex
CREATE INDEX "TarotCardCollection_userId_idx" ON "TarotCardCollection"("userId");

-- CreateIndex
CREATE INDEX "TarotCardCollection_cardId_idx" ON "TarotCardCollection"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "TarotCardCollection_userId_cardId_key" ON "TarotCardCollection"("userId", "cardId");

-- CreateIndex
CREATE INDEX "TarotAnalyticsEvent_userId_idx" ON "TarotAnalyticsEvent"("userId");

-- CreateIndex
CREATE INDEX "TarotAnalyticsEvent_event_idx" ON "TarotAnalyticsEvent"("event");

-- CreateIndex
CREATE INDEX "TarotAnalyticsEvent_createdAt_idx" ON "TarotAnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AdminLoginAttempt_ip_createdAt_idx" ON "AdminLoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "AdminLoginAttempt_createdAt_idx" ON "AdminLoginAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmotionVote_votedDate_emotion_idx" ON "EmotionVote"("votedDate", "emotion");

-- CreateIndex
CREATE INDEX "EmotionVote_votedDate_situationKey_idx" ON "EmotionVote"("votedDate", "situationKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmotionVote_sessionId_votedDate_key" ON "EmotionVote"("sessionId", "votedDate");

-- CreateIndex
CREATE INDEX "ChallengeState_challengeDate_idx" ON "ChallengeState"("challengeDate");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeState_sessionId_challengeDate_key" ON "ChallengeState"("sessionId", "challengeDate");

-- CreateIndex
CREATE UNIQUE INDEX "FomoIndexSnapshot_date_key" ON "FomoIndexSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordCardSnapshot_date_key" ON "KeywordCardSnapshot"("date");

-- CreateIndex
CREATE INDEX "TasteSignal_userId_createdAt_idx" ON "TasteSignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TasteSignal_sessionId_createdAt_idx" ON "TasteSignal"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "TasteSignal_subjectType_subject_idx" ON "TasteSignal"("subjectType", "subject");

-- CreateIndex
CREATE INDEX "JudgmentLedger_date_kind_idx" ON "JudgmentLedger"("date", "kind");

-- CreateIndex
CREATE INDEX "JudgmentLedger_canonical_date_idx" ON "JudgmentLedger"("canonical", "date");

-- CreateIndex
CREATE INDEX "JudgmentLedger_actor_date_idx" ON "JudgmentLedger"("actor", "date");

-- CreateIndex
CREATE UNIQUE INDEX "JudgmentLedger_idempotencyKey_date_key" ON "JudgmentLedger"("idempotencyKey", "date");

-- CreateIndex
CREATE INDEX "QualityLedger_date_idx" ON "QualityLedger"("date");

-- CreateIndex
CREATE UNIQUE INDEX "QualityLedger_idempotencyKey_date_key" ON "QualityLedger"("idempotencyKey", "date");

-- CreateIndex
CREATE INDEX "SupplyDemandDaily_ticker_date_idx" ON "SupplyDemandDaily"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyDemandDaily_ticker_date_key" ON "SupplyDemandDaily"("ticker", "date");

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySession" ADD CONSTRAINT "StrategySession_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StrategySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StrategySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StrategySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StrategySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StrategySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemLog" ADD CONSTRAINT "SystemLog_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchProfile" ADD CONSTRAINT "ResearchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterDigest" ADD CONSTRAINT "NewsletterDigest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ResearchProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMeetingThread" ADD CONSTRAINT "AgentMeetingThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMeetingMessage" ADD CONSTRAINT "AgentMeetingMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AgentMeetingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotCreditLedger" ADD CONSTRAINT "TarotCreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotDrawHistory" ADD CONSTRAINT "TarotDrawHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotDrawHistoryCard" ADD CONSTRAINT "TarotDrawHistoryCard_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "TarotDrawHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotDrawHistoryCard" ADD CONSTRAINT "TarotDrawHistoryCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "TarotCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotFavorite" ADD CONSTRAINT "TarotFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotFeedback" ADD CONSTRAINT "TarotFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotFeedback" ADD CONSTRAINT "TarotFeedback_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "TarotDrawHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotReport" ADD CONSTRAINT "TarotReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotReport" ADD CONSTRAINT "TarotReport_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "TarotDrawHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotCardCollection" ADD CONSTRAINT "TarotCardCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotCardCollection" ADD CONSTRAINT "TarotCardCollection_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "TarotCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotAnalyticsEvent" ADD CONSTRAINT "TarotAnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TasteSignal" ADD CONSTRAINT "TasteSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

