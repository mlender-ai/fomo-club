"""FCE 가 계산한 고래 리더보드 · 24시간 관측을 **읽기 전용으로** 꺼낸다 (UI-07 PART G · H).

FCE 는 이 둘을 일일 리포트 문장으로만 내고 API 로 주지 않는다. 그래서 **FCE 자신의 함수**를
FCE 파이썬으로 부른다 — 랩이 다시 계산하지 않는다(UI-00 하지 말 것).

- 리더보드: `app.notify.content_summary.whale_line` 과 같은 호출
  (`observed_win_rates` · `selection_disclosure` · `min_sample=MIN_SAMPLE`)
- 24시간 관측: `app.notify.alerts._whale_observation_line` 과 같은 집계
  (`blocked_alerts` 중 `rule_id == "whale_entry"` · 최근 24시간)

DB 는 `mode=ro` 로 연다. 상태 파일은 읽기만 한다. **FCE 레포는 건드리지 않는다.**

    cd "<FCE>/backend" && python3 <이 파일>
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.getcwd())

from app.notify.content_summary import MIN_SAMPLE  # noqa: E402
from app.onchain.win_rate import observed_win_rates, selection_disclosure  # noqa: E402

DB = os.environ.get("FCE_DB_PATH", "fomo_control_engine.db")
STATE = os.environ.get("FCE_NOTIFICATION_STATE_PATH", "notification_state.json")


def leaderboard() -> dict:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        events = [dict(r) for r in con.execute("SELECT wallet_address, event_type, payload FROM whale_events")]
        tracked = con.execute("SELECT COUNT(*) FROM whale_wallets WHERE active=1").fetchone()[0]
    finally:
        con.close()
    d = selection_disclosure(observed_win_rates(events, min_sample=MIN_SAMPLE), min_sample=MIN_SAMPLE)
    return {
        "tracked": tracked,
        "minSample": MIN_SAMPLE,
        "scoredWallets": d["scored_wallets"],
        "closedSamples": d["closed_samples"],
        "overallWinPct": d["overall_win_rate_pct"],
        "walletMedianWinPct": d["wallet_median_win_rate_pct"],
    }


def _parse(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def observation(hours: int = 24) -> dict | None:
    """`_whale_observation_line` 과 같은 거르기 · 같은 합산. 문장 대신 숫자로."""
    if not os.path.exists(STATE):
        return None
    with open(STATE, encoding="utf-8") as handle:
        blocked = (json.load(handle) or {}).get("blocked_alerts") or []
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    recent = [
        b for b in blocked
        if isinstance(b, dict) and str(b.get("rule_id") or "") == "whale_entry" and (_parse(b.get("blocked_at")) or now) >= cutoff
    ]
    payloads = [b.get("payload") if isinstance(b.get("payload"), dict) else {} for b in recent]
    wallets = {str(p.get("wallet_address") or "") for p in payloads}
    samples = [int(p.get("sample_size") or 0) for p in payloads]
    return {
        "hours": hours,
        "bursts": len(recent),
        "wallets": len([w for w in wallets if w]),
        "fills": sum(int(p.get("fill_count") or 0) for p in payloads),
        "maxNotionalUsd": max((float(p.get("total_notional") or 0.0) for p in payloads), default=0.0),
        "maxSample": max(samples) if samples else None,
        # FCE 는 전부 미검증으로 강등해 푸시하지 않는다(WO-FCE-WHALE-ALERT-DEMOTE-01).
        "demoted": True,
    }


if __name__ == "__main__":
    out: dict = {}
    try:
        out["leaderboard"] = leaderboard()
    except Exception as exc:  # 한 칸이 안 돼도 다른 칸은 낸다
        out["leaderboardError"] = str(exc)[:200]
    try:
        out["observation"] = observation()
    except Exception as exc:
        out["observationError"] = str(exc)[:200]
    print(json.dumps(out, ensure_ascii=False))
