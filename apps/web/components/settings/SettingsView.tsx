"use client";

import { useEffect, useState } from "react";

import type { RuntimeStateResponse } from "@fomo/shared";

interface SettingsViewProps {
  isMutating: boolean;
  onSaveExchange: (payload: {
    exchange?: "BINANCE" | "BYBIT";
    mode?: "paper" | "real";
    sandbox?: boolean;
    apiKey?: string;
    apiSecret?: string;
  }) => Promise<void>;
  onSaveRisk: (payload: Partial<RuntimeStateResponse["risk"]>) => Promise<void>;
  onToggleKillSwitch: (payload: { enabled: boolean; mode: "PAUSE_ONLY" | "CLOSE_POSITIONS"; reason?: string | null }) => Promise<void>;
  runtime: RuntimeStateResponse;
}

export function SettingsView({ isMutating, onSaveExchange, onSaveRisk, onToggleKillSwitch, runtime }: SettingsViewProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [exchange, setExchange] = useState<"BINANCE" | "BYBIT">(runtime.exchange.exchange);
  const [mode, setMode] = useState<"paper" | "real">(runtime.exchange.mode);
  const [sandbox, setSandbox] = useState(runtime.exchange.sandbox);
  const [maxDailyLossUsd, setMaxDailyLossUsd] = useState(String(runtime.risk.maxDailyLossUsd));
  const [maxDailyLossPct, setMaxDailyLossPct] = useState(String(runtime.risk.maxDailyLossPct));
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(String(runtime.risk.maxConsecutiveLosses));
  const [cooldownMinutes, setCooldownMinutes] = useState(String(runtime.risk.cooldownMinutes));

  useEffect(() => {
    setExchange(runtime.exchange.exchange);
    setMode(runtime.exchange.mode);
    setSandbox(runtime.exchange.sandbox);
    setApiKey("");
    setApiSecret("");
    setMaxDailyLossUsd(String(runtime.risk.maxDailyLossUsd));
    setMaxDailyLossPct(String(runtime.risk.maxDailyLossPct));
    setMaxConsecutiveLosses(String(runtime.risk.maxConsecutiveLosses));
    setCooldownMinutes(String(runtime.risk.cooldownMinutes));
  }, [runtime]);

  return (
    <div className="panel-scroll settings-view">
      <div className="settings-grid">
        <article className="surface">
          <div className="surface-head">
            <div>
              <span className="surface-kicker">거래소</span>
              <h2 className="panel-title">API 설정</h2>
            </div>
            <span className="surface-meta">{runtime.exchange.apiKeyPreview ?? "미설정"}</span>
          </div>

          <div className="settings-form">
            <label>
              <span>거래소</span>
              <select onChange={(event) => setExchange(event.target.value as "BINANCE" | "BYBIT")} value={exchange}>
                <option value="BINANCE">Binance</option>
                <option value="BYBIT">Bybit</option>
              </select>
            </label>
            <label>
              <span>모드</span>
              <select onChange={(event) => setMode(event.target.value as "paper" | "real")} value={mode}>
                <option value="paper">paper</option>
                <option value="real">real</option>
              </select>
            </label>
            <label className="settings-inline-check">
              <input checked={sandbox} onChange={(event) => setSandbox(event.target.checked)} type="checkbox" />
              <span>sandbox 사용</span>
            </label>
            <label>
              <span>API Key</span>
              <input onChange={(event) => setApiKey(event.target.value)} placeholder="서버에 암호화 저장" type="password" value={apiKey} />
            </label>
            <label>
              <span>API Secret</span>
              <input onChange={(event) => setApiSecret(event.target.value)} placeholder="프론트에는 저장하지 않음" type="password" value={apiSecret} />
            </label>
            <button
              className="settings-submit"
              disabled={isMutating}
              onClick={() => {
                const payload = {
                  exchange,
                  mode,
                  sandbox,
                  ...(apiKey ? { apiKey } : {}),
                  ...(apiSecret ? { apiSecret } : {})
                };

                void onSaveExchange(payload);
              }}
              type="button"
            >
              거래소 설정 저장
            </button>
          </div>
        </article>

        <article className="surface">
          <div className="surface-head">
            <div>
              <span className="surface-kicker">리스크</span>
              <h2 className="panel-title">보호 규칙</h2>
            </div>
            <span className="surface-meta">{runtime.risk.isTriggered ? "트리거됨" : "정상"}</span>
          </div>

          <div className="settings-form">
            <label>
              <span>일일 손실 한도 (USD)</span>
              <input onChange={(event) => setMaxDailyLossUsd(event.target.value)} type="number" value={maxDailyLossUsd} />
            </label>
            <label>
              <span>일일 손실 한도 (%)</span>
              <input onChange={(event) => setMaxDailyLossPct(event.target.value)} type="number" value={maxDailyLossPct} />
            </label>
            <label>
              <span>연속 손실 제한</span>
              <input onChange={(event) => setMaxConsecutiveLosses(event.target.value)} type="number" value={maxConsecutiveLosses} />
            </label>
            <label>
              <span>쿨다운 (분)</span>
              <input onChange={(event) => setCooldownMinutes(event.target.value)} type="number" value={cooldownMinutes} />
            </label>
            <button
              className="settings-submit"
              disabled={isMutating}
              onClick={() =>
                void onSaveRisk({
                  maxDailyLossUsd: Number(maxDailyLossUsd),
                  maxDailyLossPct: Number(maxDailyLossPct),
                  maxConsecutiveLosses: Number(maxConsecutiveLosses),
                  cooldownMinutes: Number(cooldownMinutes)
                })
              }
              type="button"
            >
              리스크 설정 저장
            </button>
          </div>
        </article>

        <article className="surface">
          <div className="surface-head">
            <div>
              <span className="surface-kicker">운영 제어</span>
              <h2 className="panel-title">Kill Switch</h2>
            </div>
            <span className="surface-meta">{runtime.killSwitch.enabled ? "활성" : "비활성"}</span>
          </div>

          <div className="settings-form">
            <p className="status-note">현재 상태: {runtime.killSwitch.enabled ? `${runtime.killSwitch.mode} 실행 중` : "정상 운영 중"}</p>
            <button
              className="settings-submit danger"
              disabled={isMutating}
              onClick={() =>
                void onToggleKillSwitch({
                  enabled: !runtime.killSwitch.enabled,
                  mode: "PAUSE_ONLY",
                  reason: runtime.killSwitch.enabled ? "사용자 해제" : "사용자 중단"
                })
              }
              type="button"
            >
              거래 즉시 중단
            </button>
            <button
              className="settings-submit warning"
              disabled={isMutating}
              onClick={() =>
                void onToggleKillSwitch({
                  enabled: !runtime.killSwitch.enabled,
                  mode: "CLOSE_POSITIONS",
                  reason: runtime.killSwitch.enabled ? "사용자 해제" : "즉시 청산 요청"
                })
              }
              type="button"
            >
              포지션 즉시 청산
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
