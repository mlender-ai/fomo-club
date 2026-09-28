"""FCE 주식 페이퍼 체결 전부에 invariant 를 다시 돌린다 (OPS-02 B-1) — **읽기 전용**.

invariant(`stock_paper/execution.py`): 체결가는 그 시각 분봉의 저가~고가 안이어야 한다.
FCE 는 체결 순간 그 분봉(`MarketObservation.minute_*`)으로 검사한다. 여기서는 저장된 1분봉
(`toss_candles`, timeframe=1m)에서 체결 시각이 든 봉을 찾아 같은 검사를 한다.

    python3 scripts/ops/stock-fill-audit.py [DB 경로]

봉이 없으면 `봉 없음` 으로 따로 센다 — 위반으로도 통과로도 치지 않는다.

두 번 잰다:

- **기록된 체결가** — 그때 FCE 가 낸 값. 수리(8/31 `de609317`) 전 체결이면 위반이 나올 수 있다
- **지금 모형으로 다시** — 같은 봉 · 그 시각 호가(`toss_quotes` orderbook)로 FCE 자신의 `execute_order` 를
  부른다. invariant 는 FCE 코드 그대로다 — 완화하지 않는다. 이 칸이 0 이어야 재개한다
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone


def fce_db() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    home = os.environ.get("FCE_HOME") or (
        os.path.expanduser("~/fce") if os.path.isdir(os.path.expanduser("~/fce/backend")) else os.path.expanduser("~/Documents/Fomo club engine")
    )
    return os.path.join(home, "backend", "fomo_control_engine.db")


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def fce_engine():
    """FCE 의 체결 함수 — 레포를 고치지 않고 읽기만. 못 부르면 None."""
    backend = os.path.dirname(fce_db())
    sys.path.insert(0, backend)
    try:
        from app.stock_paper.execution import ExecutionPolicy, execute_order  # type: ignore
        from app.stock_paper.models import (  # type: ignore
            Currency, FillInvariantViolation, Market, MarketObservation, Side, StockOrder,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"(FCE 체결 함수를 못 불렀다 — 다시 재기는 건너뛴다: {exc})")
        return None
    return ExecutionPolicy, execute_order, Currency, FillInvariantViolation, Market, MarketObservation, Side, StockOrder


def book_at(db: sqlite3.Connection, market: str, symbol: str, at: datetime) -> tuple[float | None, float | None]:
    for (payload,) in db.execute(
        "SELECT payload FROM toss_quotes WHERE market=? AND symbol=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 12",
        (market, symbol, at.isoformat()),
    ):
        env = json.loads(payload)
        if env.get("kind") != "orderbook":
            continue
        res = ((env.get("response") or {}).get("result")) or {}
        bids, asks = res.get("bids") or [], res.get("asks") or []
        if bids and asks:
            return float(bids[0]["price"]), float(asks[0]["price"])
    return None, None


def replay(engine, db, market, symbol, side, quantity, at, bar):
    if engine is None or bar is None:
        return None, "—"
    ExecutionPolicy, execute_order, Currency, Violation, Market, Observation, Side, Order = engine
    bid, ask = book_at(db, market, symbol, at)
    obs = Observation(
        symbol=symbol, market=Market(market), observed_at=at, session_open=True,
        minute_open=float(bar[1]), minute_high=float(bar[2]), minute_low=float(bar[3]), minute_close=float(bar[4]),
        minute_volume=float(bar[5]) if bar[5] else 1_000_000.0, bid=bid, ask=ask,
    )
    order = Order(symbol=symbol, market=Market(market), currency=Currency("KRW" if market == "KR" else "USD"),
                  side=Side(side), quantity=int(quantity), signal_at=at)
    try:
        result = execute_order(order, obs, ExecutionPolicy())
    except Violation:
        return None, "❌ 위반"
    if result.fill is None:
        return None, f"미체결({result.reason})"
    return result.fill.price, "통과"


def main() -> int:
    db = sqlite3.connect(f"file:{fce_db()}?mode=ro", uri=True)
    engine = fce_engine()
    fills = db.execute("SELECT market, symbol, side, filled_at, entry_mode, payload FROM stock_paper_fills ORDER BY filled_at").fetchall()
    rows, bad, missing, rebad = [], 0, 0, 0
    for market, symbol, side, filled_at, mode, payload in fills:
        price = float(json.loads(payload)["price"])
        at = ts(filled_at)
        # 1분봉 opened_at 은 +09:00 문자열이다 — 앞뒤 2분을 넓게 읽고 파이썬에서 고른다.
        near = db.execute(
            "SELECT opened_at, open, high, low, close, volume FROM toss_candles WHERE market=? AND symbol=? AND timeframe='1m' "
            "AND opened_at BETWEEN ? AND ? ORDER BY opened_at",
            (market, symbol, (at - timedelta(minutes=2)).astimezone(timezone(timedelta(hours=9))).isoformat()[:16],
             (at + timedelta(minutes=2)).astimezone(timezone(timedelta(hours=9))).isoformat()[:16] + "~"),
        ).fetchall()
        bar = next((b for b in near if ts(b[0]) <= at < ts(b[0]) + timedelta(minutes=1)), None)
        if bar is None:
            missing += 1
            verdict = "봉 없음"
        else:
            ok = float(bar[3]) <= price <= float(bar[2])
            bad += 0 if ok else 1
            verdict = "통과" if ok else "❌ 위반"
        quantity = int(json.loads(payload).get("quantity") or 1)
        re_price, re_verdict = replay(engine, db, market, symbol, side, quantity, at, bar)
        rebad += 1 if re_verdict == "❌ 위반" else 0
        rows.append((market, symbol, side, mode, filled_at[:19], bar[3] if bar else None, bar[2] if bar else None,
                     price, verdict, re_price, re_verdict))
    print("| 시장 | 심볼 | 방향 | 모드 | 체결(UTC) | 봉 저가 | 봉 고가 | 기록 체결가 | 판정 | 지금 모형 | 판정 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        print("| " + " | ".join("—" if v is None else str(v) for v in r) + " |")
    print(f"\n체결 {len(rows)} · 봉 없음 {missing} · 기록 체결가 위반 {bad} · **지금 모형 위반 {rebad}**")
    return 1 if rebad else 0


if __name__ == "__main__":
    raise SystemExit(main())
