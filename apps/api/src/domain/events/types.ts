import type { PaperEventType, StrategyCode } from "@fomo/shared";

export interface PublishPaperEventInput {
  botId: string;
  eventType: PaperEventType;
  message: string;
  symbol?: string | null;
  strategyId?: string | null;
  strategyCode?: StrategyCode | null;
  sessionId?: string | null;
  reasonMeta?: Record<string, unknown> | null;
  pnlDelta?: number | null;
  fee?: number | null;
  notifyTelegram?: boolean;
  timestamp?: string;
}

export interface PaperEventContextPayload {
  schema: "paper-event/v1";
  eventType: PaperEventType;
  symbol: string | null;
  strategyId: string | null;
  strategyCode: StrategyCode | null;
  sessionId: string | null;
  reasonMeta: Record<string, unknown> | null;
  pnlDelta: number | null;
  fee: number | null;
  telegramStatus: "PENDING" | "SENT" | "FAILED" | "SKIPPED" | null;
  telegramSentAt: string | null;
  telegramError: string | null;
}
