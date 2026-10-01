"""PART C — 거래마다 그때 시장 상태.

전부 순수 함수다. 봉은 `(open_ms, open, high, low, close, volume)` 튜플, 오름차순.

**미래를 보지 않는다.** 시각 t 의 지표는 t 이전에 **닫힌** 봉(open + 주기 ≤ t)만 쓴다.
MFE·MAE 는 보유 구간과 겹치는 봉의 고가·저가로 잰다 — 첫·끝 봉은 진입 전·청산 후 움직임이 섞일 수 있어
보유 시간에 맞춰 봉을 잘게 고른다(`pick_granularity`). 어떤 주기로 쟀는지 결과에 남긴다.
"""
from __future__ import annotations

from bisect import bisect_right
from typing import Sequence

from .timeutil import DAY_MS, HOUR_MS, KST, from_ms

Candle = tuple  # (open_ms, o, h, l, c, v)

TF_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1H": HOUR_MS,
    "4H": 4 * HOUR_MS,
    "1D": DAY_MS,
}
CONTEXT_TFS = ("1H", "4H", "1D")
MA_LENGTHS = (20, 60, 200)
SWING_LOOKBACK = 20
WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")


def closed_upto(candles: Sequence[Candle], t_ms: int, tf: str) -> Sequence[Candle]:
    """t 시각에 이미 닫힌 봉들."""
    cutoff = t_ms - TF_MS[tf]  # open ≤ t − 주기
    idx = bisect_right([c[0] for c in candles], cutoff)
    return candles[:idx]


def sma(values: Sequence[float], n: int) -> float | None:
    if len(values) < n:
        return None
    return sum(values[-n:]) / n


def rsi(closes: Sequence[float], n: int = 14) -> float | None:
    """와일더 RSI. 봉이 n+1 개보다 적으면 None."""
    if len(closes) < n + 1:
        return None
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    avg_g, avg_l = gains / n, losses / n
    for i in range(n + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        avg_g = (avg_g * (n - 1) + max(d, 0.0)) / n
        avg_l = (avg_l * (n - 1) + max(-d, 0.0)) / n
    if avg_l == 0:
        return 100.0 if avg_g > 0 else 50.0
    return 100 - 100 / (1 + avg_g / avg_l)


def _pct(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return (a / b - 1) * 100


def tf_state(candles: Sequence[Candle], t_ms: int, tf: str, price: float) -> dict:
    """한 주기에서 본 t 시각 상태. 가격은 거래의 평균 진입(청산)가."""
    done = closed_upto(candles, t_ms, tf)
    closes = [c[4] for c in done]
    vols = [c[5] for c in done]
    out: dict = {"bars": len(done)}
    for n in MA_LENGTHS:
        out[f"vs_ma{n}_pct"] = _pct(price, sma(closes, n))
    # RSI 는 최근 200봉만으로 — 와일더 평활은 그 정도면 수렴한다.
    out["rsi14"] = rsi(closes[-200:])
    prior_vol = sma(vols[:-1], 20)
    out["vol_mult"] = (vols[-1] / prior_vol) if vols and prior_vol else None
    window = done[-SWING_LOOKBACK:]
    if window:
        hi = max(c[2] for c in window)
        lo = min(c[3] for c in window)
        out["to_high20_pct"] = _pct(hi, price)  # 위로 몇 % 남았나
        out["to_low20_pct"] = _pct(lo, price)  # 아래로 몇 % 남았나(음수)
    else:
        out["to_high20_pct"] = out["to_low20_pct"] = None
    return out


def snapshot(candles_by_tf: dict[str, Sequence[Candle]], t_ms: int, price: float) -> dict:
    return {tf: tf_state(candles_by_tf.get(tf) or (), t_ms, tf, price) for tf in CONTEXT_TFS}


def btc_trend(btc_by_tf: dict[str, Sequence[Candle]], t_ms: int) -> dict:
    """같은 시각 BTC — 마지막 닫힌 1H 종가 기준 이평 위치 · 24시간 수익률."""
    h1 = closed_upto(btc_by_tf.get("1H") or (), t_ms, "1H")
    if not h1:
        return {"price": None}
    price = h1[-1][4]
    out: dict = {"price": price}
    for tf in ("4H", "1D"):
        closes = [c[4] for c in closed_upto(btc_by_tf.get(tf) or (), t_ms, tf)]
        for n in MA_LENGTHS:
            out[f"{tf}_vs_ma{n}_pct"] = _pct(price, sma(closes, n))
    out["ret_24h_pct"] = _pct(price, h1[-25][4]) if len(h1) >= 25 else None
    above = [v for k, v in out.items() if k.startswith("1D_vs_ma") and v is not None]
    out["label"] = None if not above else ("상승" if all(v > 0 for v in above) else "하락" if all(v < 0 for v in above) else "혼조")
    return out


def pick_granularity(hold_ms: int) -> str:
    """보유 구간을 봉 ~1,000개 안쪽으로 덮는 가장 잘게 쪼갠 주기."""
    for tf in ("1m", "5m", "15m", "1H"):
        if hold_ms <= TF_MS[tf] * 1000:
            return tf
    return "4H"


def excursion(candles: Sequence[Candle], tf: str, entry_ms: int, exit_ms: int, avg_entry: float, direction: str, realized_return_pct: float | None) -> dict:
    """MFE(최대 유리) · MAE(최대 불리). 진입가 대비 %, 방향 반영."""
    span = TF_MS[tf]
    inside = [c for c in candles if c[0] < exit_ms and c[0] + span > entry_ms]
    if not inside:
        return {"granularity": tf, "bars": 0, "mfe_pct": None, "mae_pct": None}
    long = direction == "long"
    best = max(inside, key=lambda c: c[2]) if long else min(inside, key=lambda c: c[3])
    worst = min(inside, key=lambda c: c[3]) if long else max(inside, key=lambda c: c[2])
    if long:
        mfe = (best[2] / avg_entry - 1) * 100
        mae = (worst[3] / avg_entry - 1) * 100
    else:
        mfe = (1 - best[3] / avg_entry) * 100
        mae = (1 - worst[2] / avg_entry) * 100
    mfe = max(mfe, 0.0)
    mae = min(mae, 0.0)
    return {
        "granularity": tf,
        "bars": len(inside),
        "mfe_pct": mfe,
        "mae_pct": mae,
        "mfe_after_min": max(0, (best[0] - entry_ms)) / 60_000,
        "mae_after_min": max(0, (worst[0] - entry_ms)) / 60_000,
        # 잡은 몫: 실현 수익률 ÷ MFE. 1 에 가까우면 꼭대기 근처에서 나왔다.
        "capture": (realized_return_pct / mfe) if realized_return_pct is not None and mfe > 0 else None,
    }


def after_exit(h1: Sequence[Candle], exit_ms: int, exit_price: float, direction: str, now_ms: int) -> dict:
    """청산 뒤 24시간 · 7일. 양수 = 들고 있었으면 더 벌었다(판 뒤에 더 갔다)."""
    sign = 1.0 if direction == "long" else -1.0
    out: dict = {}
    for label, horizon in (("24h", DAY_MS), ("7d", 7 * DAY_MS)):
        target = exit_ms + horizon
        if target > now_ms:
            out[f"after_{label}_pct"] = None
            continue
        done = closed_upto(h1, target, "1H")
        later = [c for c in done if c[0] >= exit_ms]
        out[f"after_{label}_pct"] = ((done[-1][4] / exit_price - 1) * 100 * sign) if later else None
        if label == "24h":
            if later:
                fav = max(c[2] for c in later) if sign > 0 else min(c[3] for c in later)
                out["max_fav_24h_pct"] = (fav / exit_price - 1) * 100 * sign
            else:
                out["max_fav_24h_pct"] = None
    return out


def flips(before: dict, after: dict) -> list[str]:
    """두 스냅숏 사이에 바뀐 것 — 이평 위·아래가 뒤집힌 것 · RSI 가 70/30 을 넘나든 것."""
    out: list[str] = []
    for tf in CONTEXT_TFS:
        a, b = before.get(tf) or {}, after.get(tf) or {}
        for n in MA_LENGTHS:
            x, y = a.get(f"vs_ma{n}_pct"), b.get(f"vs_ma{n}_pct")
            if x is not None and y is not None and (x > 0) != (y > 0):
                out.append(f"{tf} MA{n} {'위로' if y > 0 else '아래로'}")
        r0, r1 = a.get("rsi14"), b.get("rsi14")
        if r0 is not None and r1 is not None:
            if r0 < 70 <= r1:
                out.append(f"{tf} RSI 70 돌파")
            if r0 > 30 >= r1:
                out.append(f"{tf} RSI 30 이탈")
            if r0 >= 70 > r1:
                out.append(f"{tf} RSI 70 아래로")
            if r0 <= 30 < r1:
                out.append(f"{tf} RSI 30 위로")
    return out


def funding_at(rows: Sequence[tuple[int, float]], t_ms: int) -> float | None:
    """t 이전 마지막 정산 펀딩비. rows = (funding_ms, rate) 오름차순."""
    idx = bisect_right([r[0] for r in rows], t_ms)
    return rows[idx - 1][1] if idx else None


def session(t_ms: int) -> dict:
    local = from_ms(t_ms).astimezone(KST)
    return {"hour_kst": local.hour, "weekday_kst": WEEKDAYS[local.weekday()], "hour_utc": from_ms(t_ms).hour}
