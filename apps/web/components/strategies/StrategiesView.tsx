"use client";

import { useEffect, useState } from "react";

import type { DashboardSummaryResponse, PeriodFilter, RuntimeStateResponse, SessionCompareResponse, StrategyControlResponse, StrategySortKey } from "@fomo/shared";

import { getStrategyControlClient } from "../../lib/client-api";
import { StrategyDetail } from "./StrategyDetail";
import { StrategyList } from "./StrategyList";

interface StrategiesViewProps {
  dashboard: DashboardSummaryResponse;
  isMutating: boolean;
  onSetPrimary: (strategyId: string) => Promise<void>;
  onToggleStrategy: (strategyId: string) => Promise<void>;
  runtime: RuntimeStateResponse;
  sessionCompare: SessionCompareResponse;
  strategyControl: StrategyControlResponse;
}

export function StrategiesView({
  dashboard,
  isMutating,
  onSetPrimary,
  onToggleStrategy,
  runtime,
  sessionCompare,
  strategyControl
}: StrategiesViewProps) {
  const [controlData, setControlData] = useState(strategyControl);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(strategyControl.strategies[0]?.id ?? null);
  const [period, setPeriod] = useState<PeriodFilter>("today");
  const [sortBy, setSortBy] = useState<StrategySortKey>("profit");
  const controlFingerprint = strategyControl.strategies.map((strategy) => `${strategy.id}:${strategy.status}:${strategy.isPrimary ? "1" : "0"}`).join("|");

  useEffect(() => {
    let cancelled = false;

    async function loadControlData() {
      try {
        const next = await getStrategyControlClient({
          period,
          sortBy
        });

        if (!cancelled) {
          setControlData(next);
        }
      } catch {
        if (!cancelled) {
          setControlData(strategyControl);
        }
      }
    }

    void loadControlData();

    return () => {
      cancelled = true;
    };
  }, [period, sortBy, controlFingerprint, strategyControl]);

  useEffect(() => {
    if (!selectedStrategyId) {
      setSelectedStrategyId(controlData.strategies[0]?.id ?? null);
      return;
    }

    const exists = controlData.strategies.some((strategy) => strategy.id === selectedStrategyId);

    if (!exists) {
      setSelectedStrategyId(controlData.strategies[0]?.id ?? null);
    }
  }, [controlData, selectedStrategyId]);

  const selectedStrategy = controlData.strategies.find((strategy) => strategy.id === selectedStrategyId) ?? controlData.strategies[0] ?? null;
  const rows = controlData.performanceByPeriod[period] ?? [];

  return (
    <div className="panel-scroll">
      <div className="detail-layout detail-layout-balanced">
        <StrategyList
          account={dashboard.account}
          execution={controlData.execution}
          isMutating={isMutating}
          onSelect={setSelectedStrategyId}
          onSetPrimary={onSetPrimary}
          onToggleStrategy={onToggleStrategy}
          period={period}
          rows={rows}
          selectedStrategyId={selectedStrategyId}
          setPeriod={setPeriod}
          setSortBy={setSortBy}
          sortBy={sortBy}
          strategies={controlData.strategies}
        />
        <StrategyDetail
          dashboard={dashboard}
          runtime={runtime}
          selectedStrategy={selectedStrategy}
          sessionCompare={sessionCompare}
          strategyControl={controlData}
        />
      </div>
    </div>
  );
}
