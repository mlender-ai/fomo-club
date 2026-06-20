import type { DailyReportResponse, SessionCompareResponse, WeeklyReportResponse } from "@fomo/shared";

export type DailyReportInput = Omit<DailyReportResponse, "report">;
export type WeeklyReportInput = Omit<WeeklyReportResponse, "report">;
export type SessionCompareInput = Omit<SessionCompareResponse, "report">;

export interface ReportGeneratorProvider {
  readonly name: string;
  generateDaily(input: DailyReportInput): DailyReportResponse["report"];
  generateWeekly(input: WeeklyReportInput): WeeklyReportResponse["report"];
  generateSessionCompare(input: SessionCompareInput): SessionCompareResponse["report"];
}
