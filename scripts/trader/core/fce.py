"""FCE 로컬 DB 읽기 — **읽기 전용**(`mode=ro`). FCE 코드 · DB 에 쓰지 않는다.

TRADER-01 §0: "FCE 가 가진 것부터 쓰고, 모자란 것만 거래소에서 받는다."

| FCE 테이블 | 쓰는 곳 |
|---|---|
| `user_account_fills` | 실계좌 체결 원본. FCE 가 2분마다 89일씩 받아 쌓았다 → 거래소 90일보다 길 수 있다 |
| `whale_events` | 고래 추적군 분포 — 시각 t 까지 지갑별 마지막 체결로 포지션을 되짚는다 |
| `market_snapshots` | 패턴 판정(주기별 `reason_codes` · `scores`) |
| `deriv_metrics` · `derivative_snapshots` | 미결제약정 · 펀딩 |

테이블이 없거나 그 시각 기록이 없으면 None — 메우지 않는다.
"""
from __future__ import annotations

import json
import sqlite3
from bisect import bisect_right
from pathlib import Path

from .timeutil import DAY_MS, HOUR_MS, from_ms, parse_iso_ms


def iso(ms: int) -> str:
    """FCE 가 저장한 모양(`+00:00`) — 문자열 비교로 시각을 견준다."""
    return from_ms(ms).isoformat()

DEFAULT_PATHS = (
    "~/fce/backend/fomo_control_engine.db",
    "~/fomo-control-engine/backend/fomo_control_engine.db",
)


def find_db(explicit: str | None) -> Path | None:
    for candidate in ([explicit] if explicit else []) + list(DEFAULT_PATHS):
        p = Path(candidate).expanduser()
        if p.is_file():
            return p
    return None


def connect_ro(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, params).fetchall()
    except sqlite3.OperationalError:
        return []  # 테이블 없음 — FCE 버전 차이


def user_fills(conn: sqlite3.Connection) -> list[dict]:
    return [json.loads(r["payload"]) for r in _rows(conn, "SELECT payload FROM user_account_fills ORDER BY timestamp")]


def user_fill_sync_state(conn: sqlite3.Connection) -> dict | None:
    rows = _rows(
        conn,
        "SELECT payload FROM paper_engine_states WHERE symbol = '__SYSTEM__' AND timeframe = 'user_fill_sync'",
    )
    if not rows:
        return None
    try:
        return json.loads(rows[0]["payload"])
    except (TypeError, ValueError):
        return None


# ── 고래 ──


class WhaleBook:
    """종목 하나의 고래 이벤트를 시간순으로 들고, 시각 t 의 분포를 낸다."""

    def __init__(self, events: list[dict]):
        self.events = sorted(events, key=lambda e: e["ts"])
        self.times = [e["ts"] for e in self.events]

    @classmethod
    def load(cls, conn: sqlite3.Connection, symbol: str) -> "WhaleBook":
        events = []
        for r in _rows(conn, "SELECT wallet_address, event_at, payload FROM whale_events WHERE symbol = ? ORDER BY event_at", (symbol.upper(),)):
            try:
                p = json.loads(r["payload"])
            except (TypeError, ValueError):
                continue
            events.append(whale_event(r["wallet_address"], parse_iso_ms(r["event_at"]), p))
        return cls(events)

    @property
    def first_ms(self) -> int | None:
        return self.times[0] if self.times else None

    def at(self, t_ms: int) -> dict | None:
        idx = bisect_right(self.times, t_ms)
        if idx == 0:
            return None
        state: dict[str, tuple[float, float]] = {}
        for e in self.events[:idx]:
            state[e["wallet"]] = (e["position"], e["px"])
        longs = [(q, px) for q, px in state.values() if q > 0]
        shorts = [(q, px) for q, px in state.values() if q < 0]
        long_usd = sum(q * px for q, px in longs)
        short_usd = sum(-q * px for q, px in shorts)
        total = long_usd + short_usd
        return {
            "wallets_seen": len(state),
            "long_wallets": len(longs),
            "short_wallets": len(shorts),
            "long_usd": long_usd,
            "short_usd": short_usd,
            "long_share_pct": (long_usd / total * 100) if total > 0 else None,
            "events_24h": sum(1 for ts in self.times[:idx] if ts > t_ms - DAY_MS),
        }


def whale_event(wallet: str, ts: int, payload: dict) -> dict:
    """체결 뒤 포지션 = Hyperliquid `startPosition` + 체결 부호 크기. 원본이 없으면 이벤트 종류로 어림."""
    raw = payload.get("payload", {}).get("raw") if isinstance(payload.get("payload"), dict) else None
    px = float(payload.get("entry_px") or payload.get("mark_px") or 0.0)
    if isinstance(raw, dict) and raw.get("startPosition") is not None:
        size = abs(float(raw.get("sz") or 0.0))
        delta = size if str(raw.get("side") or "").upper() == "B" else -size
        position = float(raw["startPosition"]) + delta
    else:
        event = str(payload.get("event") or "")
        size = abs(float(payload.get("size") or 0.0))
        sign = 1.0 if payload.get("side") == "long" else -1.0
        position = 0.0 if event == "close" else sign * size
    return {"wallet": wallet, "ts": ts, "position": position, "px": px}


# ── 패턴 판정 ──


def patterns_at(conn: sqlite3.Connection, symbol: str, t_ms: int, max_age_ms: int = 6 * HOUR_MS) -> dict:
    """시각 t 직전 FCE 분석 스냅숏(주기별). 너무 오래된 건 버린다."""
    out: dict = {}
    since = iso(t_ms - max_age_ms)
    rows = _rows(
        conn,
        "SELECT timeframe, created_at, payload FROM market_snapshots WHERE symbol = ? AND created_at <= ? AND created_at >= ? ORDER BY created_at DESC",
        (symbol.upper(), iso(t_ms), since),
    )
    for r in rows:
        tf = r["timeframe"]
        if tf in out:
            continue
        try:
            p = json.loads(r["payload"])
        except (TypeError, ValueError):
            continue
        out[tf] = {
            "at": r["created_at"],
            "reason_codes": p.get("reason_codes") or [],
            "scores": p.get("scores") or {},
        }
    return out


# ── 미결제약정 · 펀딩 ──


def derivs_at(conn: sqlite3.Connection, symbol: str, t_ms: int, max_age_ms: int = 2 * HOUR_MS) -> dict | None:
    def nearest(before_ms: int) -> dict | None:
        for table, ts_col, oi_chg in (("deriv_metrics", "as_of", "oi_change_pct"), ("derivative_snapshots", "as_of", "open_interest_change_pct")):
            rows = _rows(
                conn,
                f"SELECT {ts_col} AS at, payload FROM {table} WHERE symbol = ? AND {ts_col} <= ? AND {ts_col} >= ? ORDER BY {ts_col} DESC LIMIT 1",
                (symbol.upper(), iso(before_ms), iso(before_ms - max_age_ms)),
            )
            if rows:
                p = json.loads(rows[0]["payload"])
                return {
                    "table": table,
                    "at": rows[0]["at"],
                    "open_interest": p.get("open_interest"),
                    "oi_change_pct": p.get(oi_chg),
                    "funding": p.get("funding", p.get("funding_rate")),
                }
        return None

    now = nearest(t_ms)
    if now is None:
        return None
    day_ago = nearest(t_ms - DAY_MS)
    oi_24h = None
    if day_ago and now.get("open_interest") and day_ago.get("open_interest"):
        oi_24h = (float(now["open_interest"]) / float(day_ago["open_interest"]) - 1) * 100
    return {**now, "oi_change_24h_pct": oi_24h}
