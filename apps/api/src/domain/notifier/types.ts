import type { AlertType, DailyReportResponse, NotificationDeliveryStatus, PaperEventType, StrategyCode, WeeklyReportResponse } from "@fomo/shared";

export interface NotificationDispatchResult {
  status: NotificationDeliveryStatus;
  sentAt: string | null;
  error: string | null;
}

export interface PaperEventNotificationInput {
  botId: string;
  strategyId?: string | null;
  strategyCode?: StrategyCode | null;
  sessionId?: string | null;
  eventType: PaperEventType;
  symbol?: string | null;
  message: string;
  reasonMeta?: Record<string, unknown> | null;
  pnlDelta?: number | null;
  fee?: number | null;
  timestamp: string;
}

export interface NotifierPort {
  sendPaperEvent(input: PaperEventNotificationInput): Promise<NotificationDispatchResult>;
  sendTradeAlert(input: {
    botId: string;
    strategyId: string;
    sessionId?: string;
    type: AlertType;
    symbol: string;
    action: string;
    signal: {
      timestamp: string;
      reasonText: string;
      reasons: Array<{ message: string }>;
    };
    fee: number;
    grossPnl: number;
    currentPnl: number;
  }): Promise<NotificationDispatchResult>;
  sendDailyReportSummary(input: {
    botId: string;
    sessionId?: string;
    report: DailyReportResponse;
  }): Promise<NotificationDispatchResult>;
  sendWeeklyReportSummary(input: {
    botId: string;
    sessionId?: string;
    report: WeeklyReportResponse;
  }): Promise<NotificationDispatchResult>;
  sendSystemAlert(input: {
    botId?: string | undefined;
    strategyId?: string | undefined;
    sessionId?: string | undefined;
    type: AlertType;
    title: string;
    message: string;
    payload?: Record<string, unknown> | undefined;
  }): Promise<NotificationDispatchResult>;
  sendTestMessage(input: {
    botId?: string;
    text?: string;
  }): Promise<NotificationDispatchResult>;
}
