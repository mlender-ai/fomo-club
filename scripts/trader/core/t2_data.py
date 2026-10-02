"""TRADER-02 이 엔진에 넣는 재료 — 1시간봉 · 펀딩 · 고래. 전부 TRADER-01 비공개 저장소와 FCE(읽기 전용)에서."""
from __future__ import annotations

import sqlite3
from typing import Iterable

from .fce import WhaleBook
from .store import Store
from .timeutil import DAY_MS, HOUR_MS

WARMUP_MS = 26 * DAY_MS  # 1d 20선 + 여유(600봉 창)


def bars(store: Store, symbols: Iterable[str], start_ms: int, end_ms: int) -> dict[str, list[list]]:
    """[start − 워밍업, end) 사이 **닫힌** 1시간봉(여는 시각 + 1시간 ≤ end)."""
    out = {}
    for s in symbols:
        rows = store.candles(s, "1H", start_ms - WARMUP_MS, end_ms)
        rows = [r for r in rows if r[0] + HOUR_MS <= end_ms]
        if rows:
            out[s] = [[int(r[0]), r[1], r[2], r[3], r[4], r[5]] for r in rows]
    return out


def funding(store: Store, symbols: Iterable[str], bars_by_symbol: dict[str, list[list]]) -> dict[str, list[list]]:
    """정산 시각이 그 봉 여는 시각과 같을 때만 싣는다 — 엔진 `fundingRate` 가 정확히 그 시각만 본다."""
    out = {}
    for s in symbols:
        opens = {r[0] for r in bars_by_symbol.get(s, [])}
        rows = [[ts, rate] for ts, rate in store.funding(s) if (ts // HOUR_MS) * HOUR_MS in opens]
        out[s] = [[(ts // HOUR_MS) * HOUR_MS, rate] for ts, rate in rows]
    return out


def whales(fce: sqlite3.Connection | None, bars_by_symbol: dict[str, list[list]]) -> dict[str, list[list]]:
    """봉마다 고래 순포지션(롱 USD − 숏 USD). **봉이 닫힌 시각**의 분포 — 엔진은 봉이 닫힌 뒤 판단한다."""
    if fce is None:
        return {}
    out = {}
    for s, rows in bars_by_symbol.items():
        book = WhaleBook.load(fce, s)
        if book.first_ms is None:
            continue
        series = []
        for r in rows:
            snap = book.at(r[0] + HOUR_MS - 1)
            if snap and snap["wallets_seen"]:
                series.append([r[0], snap["long_usd"] - snap["short_usd"]])
        if series:
            out[s] = series
    return out


def fee_rate(trades: list[dict]) -> float:
    """광혁 실계좌의 한 쪽 평균 수수료율 = 수수료 ÷ (명목 × 2)."""
    notional = sum(t["avg_entry"] * t["closed_qty"] for t in trades)
    fees = sum(t["fees"] for t in trades)
    return (fees / (2 * notional)) if notional > 0 else 0.0006
