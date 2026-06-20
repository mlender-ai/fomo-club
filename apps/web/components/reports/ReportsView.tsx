"use client";

import { useState } from "react";

import type { DailyReportResponse, SessionCompareResponse, WeeklyReportResponse } from "@fomo/shared";

import { DailyReport } from "./DailyReport";
import { WeeklyReport } from "./WeeklyReport";

interface ReportsViewProps {
  dailyReport: DailyReportResponse;
  weeklyReport: WeeklyReportResponse;
  sessionCompare: SessionCompareResponse;
}

type ReportScope = "daily" | "weekly";

const scopeLabels: Record<ReportScope, string> = {
  daily: "일간 리포트",
  weekly: "주간 리포트"
};

export function ReportsView({ dailyReport, weeklyReport, sessionCompare }: ReportsViewProps) {
  const [scope, setScope] = useState<ReportScope>("daily");

  return (
    <div className="panel-scroll report-view-shell">
      <div className="surface">
        <div className="surface-head">
          <div>
            <span className="surface-kicker">리포트</span>
            <h2 className="panel-title">AI 분석 및 통계</h2>
          </div>
          <div className="segmented">
            {(Object.keys(scopeLabels) as ReportScope[]).map((key) => (
              <button
                className={`segment-button ${scope === key ? "active" : ""}`}
                key={key}
                onClick={() => setScope(key)}
                type="button"
              >
                {scopeLabels[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {scope === "daily" ? <DailyReport report={dailyReport} /> : null}
      {scope === "weekly" ? <WeeklyReport report={weeklyReport} sessionCompare={sessionCompare} /> : null}
    </div>
  );
}
