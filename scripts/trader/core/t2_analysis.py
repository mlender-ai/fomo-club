"""PART B — 실제 매매법 추출. **앞 70% 거래만** 받는다(`t2_order.train_trades`).

B-6 LLM 을 쓰지 않는다. 전부 세고 · 나누고 · 정렬하는 계산이다.
판단(어느 쪽이 맞나)은 하지 않는다 — 숫자만 낸다.
"""
from __future__ import annotations

import math
from bisect import bisect_right
from itertools import combinations
from statistics import median
from typing import Any, Iterable

from .timeutil import HOUR_MS

MIN_ENTRIES = 10  # 방향별 진입이 이보다 적으면 진입 규칙 후보를 만들지 않는다
MIN_FIRED = 20  # 조건이 참인 봉이 이보다 적으면 후보에서 뺀다(우연)
SIMPLER_MARGIN = 0.02  # F1 이 이만큼 안쪽이면 조건이 적은 쪽을 고른다(단순한 것부터)
LABEL_TOL_MS = HOUR_MS  # 신호 봉이 닫힌 뒤 이 안에 광혁이 들어갔으면 "그 신호로 들어갔다"


def q(values: Iterable[float], p: float) -> float | None:
    s = sorted(v for v in values if v is not None)
    if not s:
        return None
    k = (len(s) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def dist(values: Iterable[float]) -> dict:
    v = [x for x in values if x is not None]
    return {"n": len(v), "p10": q(v, 0.1), "p25": q(v, 0.25), "median": q(v, 0.5), "p75": q(v, 0.75), "p90": q(v, 0.9)}


def get(d: Any, path: list[str]):
    for key in path:
        if not isinstance(d, dict):
            return None
        d = d.get(key)
    return d


def won(t: dict) -> bool:
    return t["net_pnl"] > 0


# ── B-2 기술 통계 ───────────────────────────────────────────────────────

CONTEXT_FEATURES: list[tuple[str, list[str]]] = [
    *[
        (f"{tf} {label}", ["entry", "market", tf, key])
        for tf in ("1H", "4H", "1D")
        for key, label in (
            ("vs_ma20_pct", "20선 거리 %"),
            ("vs_ma60_pct", "60선 거리 %"),
            ("vs_ma200_pct", "200선 거리 %"),
            ("rsi14", "RSI"),
            ("vol_mult", "거래량 배수"),
            ("to_high20_pct", "직전 고점까지 %"),
            ("to_low20_pct", "직전 저점까지 %"),
        )
    ],
    ("BTC 24h %", ["entry", "btc", "ret_24h_pct"]),
    ("펀딩비", ["entry", "funding_rate"]),
    ("고래 롱 비중 %", ["entry", "whales", "long_share_pct"]),
    ("미결제약정 24h %", ["entry", "derivs", "oi_change_24h_pct"]),
    ("시각(KST)", ["entry", "session", "hour_kst"]),
]
CATEGORY_FEATURES: list[tuple[str, list[str]]] = [
    ("BTC 추세", ["entry", "btc", "label"]),
    ("요일(KST)", ["entry", "session", "weekday_kst"]),
]


def equity_at(bills: list[dict], t_ms: int) -> float | None:
    """그 시각 직전 지갑 잔고(장부)."""
    rows = sorted((b for b in bills if b.get("balance") is not None), key=lambda b: b["ts"])
    idx = bisect_right([b["ts"] for b in rows], t_ms)
    return rows[idx - 1]["balance"] if idx else None


def streaks(trades: list[dict]) -> list[dict]:
    """청산 순서로 연속 손실을 세고, 그 다음 거래(청산 뒤 첫 진입)까지의 간격 · 크기 변화."""
    by_exit = sorted(trades, key=lambda t: t["exit_ms"])
    by_entry = sorted(trades, key=lambda t: t["entry_ms"])
    entries = [t["entry_ms"] for t in by_entry]
    out = []
    run = 0
    recent: list[float] = []
    for t in by_exit:
        run = run + 1 if t["net_pnl"] < 0 else 0
        nxt_i = bisect_right(entries, t["exit_ms"] - 1)
        nxt = by_entry[nxt_i] if nxt_i < len(by_entry) else None
        base = median(recent[-10:]) if recent else None
        out.append(
            {
                "id": t["id"],
                "loss_streak": run,
                "won": won(t),
                "gap_min": (nxt["entry_ms"] - t["exit_ms"]) / 60_000 if nxt else None,
                "next_size_ratio": (nxt["notional_usdt"] / base) if nxt and base else None,
                "next_symbol_same": bool(nxt and nxt["symbol"] == t["symbol"]),
                "exit_method": t["exit_method"],
                "next_gap_same_symbol_min": _same_symbol_gap(t, by_entry),
            }
        )
        recent.append(t["notional_usdt"])
    return out


def _same_symbol_gap(t: dict, by_entry: list[dict]) -> float | None:
    for n in by_entry:
        if n["symbol"] == t["symbol"] and n["entry_ms"] >= t["exit_ms"]:
            return (n["entry_ms"] - t["exit_ms"]) / 60_000
    return None


def after_losses(rows: list[dict]) -> list[dict]:
    """연속 손실 k 번 뒤 행동 — 쉬나(간격) · 줄이나(크기). 비교 기준은 이긴 거래 뒤."""
    out = []
    base = [r for r in rows if r["won"]]
    out.append({"after": "이긴 뒤", "n": len(base), "gap_min": dist(r["gap_min"] for r in base), "size_ratio": dist(r["next_size_ratio"] for r in base)})
    for k, label in ((1, "1연패 뒤"), (2, "2연패 뒤"), (3, "3연패 이상 뒤")):
        sel = [r for r in rows if (r["loss_streak"] == k if k < 3 else r["loss_streak"] >= 3)]
        out.append({"after": label, "k": k, "n": len(sel), "gap_min": dist(r["gap_min"] for r in sel), "size_ratio": dist(r["next_size_ratio"] for r in sel)})
    return out


def describe(trades: list[dict], contexts: dict[str, dict], bills: list[dict]) -> dict:
    wins = [t for t in trades if won(t)]
    losses = [t for t in trades if not won(t)]
    ctx = lambda t: contexts.get(t["id"], {})  # noqa: E731

    entry_features = []
    for label, path in CONTEXT_FEATURES:
        entry_features.append({"feature": label, "win": dist(get(ctx(t), path) for t in wins), "loss": dist(get(ctx(t), path) for t in losses)})
    categories = []
    for label, path in CATEGORY_FEATURES:
        cats: dict[str, dict[str, int]] = {}
        for group, rows in (("win", wins), ("loss", losses)):
            for t in rows:
                key = str(get(ctx(t), path))
                cats.setdefault(key, {"win": 0, "loss": 0})[group] += 1
        categories.append({"feature": label, "counts": cats})

    split = [t for t in trades if t["split_exit"]]
    leg_stats = []
    for i in range(max((len(t["legs"]["exits"]) for t in split), default=0)):
        legs = [t["legs"]["exits"][i] for t in split if len(t["legs"]["exits"]) > i]
        leg_stats.append({"leg": i + 1, "n": len(legs), "qty_pct": dist(l["qty_pct"] for l in legs), "return_pct": dist(l["return_pct"] for l in legs)})

    margin_pct = []
    for t in trades:
        eq = equity_at(bills, t["entry_ms"])
        if t.get("margin_usdt") and eq:
            margin_pct.append(t["margin_usdt"] / eq * 100)
    methods: dict[str, int] = {}
    for t in trades:
        methods[t["exit_method"]] = methods.get(t["exit_method"], 0) + 1

    rows = streaks(trades)
    # 동시 보유 — 진입 순간 열려 있던 포지션 수(자기 포함). 엔진 `max_positions` 의 근거.
    concurrent = [sum(1 for o in trades if o["entry_ms"] <= t["entry_ms"] < o["exit_ms"]) for t in trades]
    return {
        "concurrent": dist(concurrent),
        "n": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "entry_features": entry_features,
        "categories": categories,
        "mfe": {"win": dist(get(ctx(t), ["hold", "mfe_pct"]) for t in wins), "loss": dist(get(ctx(t), ["hold", "mfe_pct"]) for t in losses)},
        "mae": {"win": dist(get(ctx(t), ["hold", "mae_pct"]) for t in wins), "loss": dist(get(ctx(t), ["hold", "mae_pct"]) for t in losses)},
        "capture": {"win": dist(get(ctx(t), ["hold", "capture"]) for t in wins)},
        "hold_min": {"win": dist(t["hold_minutes"] for t in wins), "loss": dist(t["hold_minutes"] for t in losses)},
        "split_entry_share": (sum(1 for t in trades if t["split_entry"]) / len(trades)) if trades else None,
        "split_exit_share": (len(split) / len(trades)) if trades else None,
        "split_exit_share_wins": (sum(1 for t in wins if t["split_exit"]) / len(wins)) if wins else None,
        "exit_legs": dist(len(t["legs"]["exits"]) for t in trades),
        "leg_stats": leg_stats,
        "leverage": dist(t.get("leverage") for t in trades),
        "margin_pct": dist(margin_pct),
        "notional": dist(t["notional_usdt"] for t in trades),
        "exit_methods": methods,
        "after_losses": after_losses(rows),
        "_streak_rows": rows,
        "sides": {d: sum(1 for t in trades if t["direction"] == d) for d in ("long", "short")},
        "trades_per_day": _per_day(trades),
    }


def _per_day(trades: list[dict]) -> float | None:
    if not trades:
        return None
    span = (max(t["exit_ms"] for t in trades) - min(t["entry_ms"] for t in trades)) / 86_400_000
    return len(trades) / span if span > 0 else None


# ── B-3 진입 규칙 후보 ──────────────────────────────────────────────────

FEATURE_SPECS: list[dict] = [
    {"indicator": "pct_from_ma", "period": 20, "tf": "1h"},
    {"indicator": "pct_from_ma", "period": 60, "tf": "1h"},
    {"indicator": "pct_from_ma", "period": 200, "tf": "1h"},
    {"indicator": "pct_from_ma", "period": 20, "tf": "4h"},
    {"indicator": "pct_from_ma", "period": 60, "tf": "4h"},
    {"indicator": "pct_from_ma", "period": 20, "tf": "1d"},
    {"indicator": "rsi", "period": 14, "tf": "1h"},
    {"indicator": "rsi", "period": 14, "tf": "4h"},
    {"indicator": "volume_ratio", "period": 20, "tf": "1h"},
    {"indicator": "volume_ratio", "period": 20, "tf": "4h"},
    {"indicator": "pct_from_high", "period": 20, "tf": "1h"},
    {"indicator": "pct_from_low", "period": 20, "tf": "1h"},
    {"indicator": "pct_from_high", "period": 20, "tf": "4h"},
    {"indicator": "pct_from_low", "period": 20, "tf": "4h"},
    {"indicator": "consecutive"},
    {"indicator": "hour_utc"},
    {"indicator": "whale_net"},
    {"indicator": "whale_flow", "window_hours": 24},
]
WINDOW_BARS = 600  # 1d 20선(480 시간봉)이 들어가는 창


def spec_key(spec: dict) -> str:
    return spec["indicator"] + "".join(f":{k}={spec[k]}" for k in sorted(spec) if k != "indicator")


def round_sig(x: float, digits: int = 2) -> float:
    if x == 0 or not math.isfinite(x):
        return x
    return round(x, -int(math.floor(math.log10(abs(x)))) + digits - 1)


class Grid:
    """종목 × 1시간봉 격자. 각 봉: 지표 값 · 광혁이 다음 1시간 안에 들어갔나 · 이미 들고 있었나."""

    def __init__(self, specs: list[dict], bars: dict[str, list[tuple]], values: dict[str, list[list]], trades: list[dict], direction: str, until_ms: int):
        self.specs = specs
        self.index: list[tuple[str, int]] = []  # (symbol, bar open ms)
        self.values: list[list[float | None]] = [[] for _ in specs]
        pos = 0
        eligible = 0
        entries = [t for t in trades if t["direction"] == direction]
        self.entries = len(entries)
        entry_bar = {}
        for t in entries:
            open_ms = (t["entry_ms"] // HOUR_MS) * HOUR_MS - HOUR_MS  # 신호 봉 = 진입 시각 직전에 닫힌 봉
            entry_bar.setdefault((t["symbol"], open_ms), []).append(t["id"])
        holding: dict[str, list[tuple[int, int]]] = {}
        for t in entries:
            holding.setdefault(t["symbol"], []).append((t["entry_ms"], t["exit_ms"]))
        n = 0
        self.positive_ids: dict[int, list[str]] = {}
        for symbol, rows in bars.items():
            vals = values.get(symbol)
            if not vals:
                continue
            for i, row in enumerate(rows):
                open_ms = int(row[0])
                close = open_ms + HOUR_MS
                if close + LABEL_TOL_MS > until_ms:
                    continue
                ids = entry_bar.get((symbol, open_ms))
                held = any(a <= close < b for a, b in holding.get(symbol, []))
                if held and not ids:
                    continue  # 이미 들고 있는 동안은 "안 들어갔다" 로 세지 않는다
                for j in range(len(specs)):
                    self.values[j].append(vals[j][i])
                self.index.append((symbol, open_ms))
                if ids:
                    pos |= 1 << n
                    self.positive_ids[n] = ids
                eligible |= 1 << n
                n += 1
        self.n = n
        self.pos = pos
        self.eligible = eligible
        self.matched_entries = sum(len(v) for v in self.positive_ids.values())

    def mask(self, j: int, op: str, threshold: float) -> int:
        m = 0
        for i, v in enumerate(self.values[j]):
            if v is not None and (v >= threshold if op == "min" else v <= threshold):
                m |= 1 << i
        return m


def score(grid: Grid, mask: int) -> dict:
    fired = bin(mask).count("1")
    hit_bars = mask & grid.pos
    hit_entries = sum(len(grid.positive_ids[i]) for i in _bits(hit_bars))
    recall = hit_entries / grid.entries if grid.entries else 0.0
    precision = bin(hit_bars).count("1") / fired if fired else 0.0
    base = bin(grid.pos).count("1") / grid.n if grid.n else 0.0
    f1 = 2 * recall * precision / (recall + precision) if recall + precision > 0 else 0.0
    return {"fired_bars": fired, "recall": recall, "precision": precision, "base_rate": base, "lift": (precision / base) if base else None, "f1": f1}


def _bits(x: int) -> Iterable[int]:
    i = 0
    while x:
        if x & 1:
            yield i
        x >>= 1
        i += 1


def candidates(grid: Grid, top_singles: int = 10, keep: int = 15) -> dict:
    """조건 1~3 개 조합. 임계는 **광혁이 실제로 들어간 봉의 값 분포**(분위수)에서만 뽑는다."""
    singles = []
    for j, spec in enumerate(grid.specs):
        pos_vals = [grid.values[j][i] for i in _bits(grid.pos) if grid.values[j][i] is not None]
        if len(pos_vals) < MIN_ENTRIES:
            continue
        for op, p in (("min", 0.1), ("min", 0.25), ("max", 0.75), ("max", 0.9)):
            th = round_sig(q(pos_vals, p) or 0.0)
            m = grid.mask(j, op, th)
            s = score(grid, m)
            if s["fired_bars"] < MIN_FIRED:
                continue
            singles.append({"conds": [(j, op, th)], "mask": m, **s})
    singles.sort(key=lambda c: -c["f1"])
    seen_feature: dict[int, int] = {}
    pool = []
    for c in singles:
        j = c["conds"][0][0]
        if seen_feature.get(j, 0) >= 2:
            continue
        seen_feature[j] = seen_feature.get(j, 0) + 1
        pool.append(c)
        if len(pool) >= top_singles:
            break
    pairs = []
    for a, b in combinations(pool, 2):
        if a["conds"][0][0] == b["conds"][0][0]:
            continue
        m = a["mask"] & b["mask"]
        s = score(grid, m)
        if s["fired_bars"] >= MIN_FIRED:
            pairs.append({"conds": a["conds"] + b["conds"], "mask": m, **s})
    pairs.sort(key=lambda c: -c["f1"])
    triples = []
    for pr in pairs[:top_singles]:
        used = {c[0] for c in pr["conds"]}
        for s1 in pool:
            if s1["conds"][0][0] in used:
                continue
            m = pr["mask"] & s1["mask"]
            s = score(grid, m)
            if s["fired_bars"] >= MIN_FIRED:
                key = tuple(sorted(pr["conds"] + s1["conds"]))
                triples.append({"conds": list(key), "mask": m, **s})
    uniq: dict[tuple, dict] = {}
    for c in singles + pairs + triples:
        uniq.setdefault(tuple(sorted(c["conds"])), c)
    ranked = sorted(uniq.values(), key=lambda c: (-c["f1"], len(c["conds"])))
    best = ranked[0] if ranked else None
    if best:
        # 단순한 것부터 — F1 이 거의 같으면 조건이 적은 쪽.
        for c in ranked:
            if c["f1"] >= best["f1"] - SIMPLER_MARGIN and len(c["conds"]) < len(best["conds"]):
                best = c
    out = [_public(grid, c) for c in ranked[:keep]]
    return {
        "entries": grid.entries,
        "entries_on_grid": grid.matched_entries,
        "bars": grid.n,
        "base_rate": bin(grid.pos).count("1") / grid.n if grid.n else None,
        "tested": len(uniq),
        "top": out,
        "chosen": _public(grid, best) if best else None,
        "_chosen_mask": best["mask"] if best else 0,
    }


def _public(grid: Grid, c: dict) -> dict:
    conds = []
    for j, op, th in c["conds"]:
        spec = dict(grid.specs[j])
        spec[op] = th
        conds.append(spec)
    return {"conditions": conds, **{k: c[k] for k in ("fired_bars", "recall", "precision", "base_rate", "lift", "f1")}}


# ── B-4 청산 규칙 후보 ──────────────────────────────────────────────────


def exit_rules(trades: list[dict], contexts: dict[str, dict], desc: dict) -> dict:
    wins = [t for t in trades if won(t)]
    losses = [t for t in trades if not won(t)]
    win_mae = [get(contexts.get(t["id"]), ["hold", "mae_pct"]) for t in wins]
    loss_mae = [get(contexts.get(t["id"]), ["hold", "mae_pct"]) for t in losses]
    stop = q(win_mae, 0.1)  # 이긴 거래의 90% 는 이보다 덜 불리했다
    stop_pct = round_sig(stop) if stop is not None and stop < 0 else None
    beyond = [m for m in loss_mae if m is not None and stop_pct is not None and m <= stop_pct]
    out: dict[str, Any] = {
        "stop": {
            "stop_pct": stop_pct,
            "basis": "이긴 거래 MAE 의 하위 10% — 이보다 불리해진 뒤 이긴 거래는 10% 뿐",
            "losses_beyond": len(beyond),
            "losses": len(losses),
        }
    }
    split_wins = [t for t in wins if t["split_exit"] and len(t["legs"]["exits"]) >= 2]
    share = desc.get("split_exit_share_wins") or 0.0
    if split_wins and share >= 0.4:
        first_ret = q((t["legs"]["exits"][0]["return_pct"] for t in split_wins), 0.5)
        first_size = q((t["legs"]["exits"][0]["qty_pct"] for t in split_wins), 0.5)
        giveback = []
        for t in split_wins:
            mfe = get(contexts.get(t["id"]), ["hold", "mfe_pct"])
            last = t["legs"]["exits"][-1]["return_pct"]
            if mfe is not None and last is not None and mfe > 0:
                giveback.append(max(mfe - last, 0.0))
        trail = q(giveback, 0.5)
        size = min(max(round((first_size or 50) / 100 / 0.05) * 0.05, 0.05), 0.95)
        legs: list[dict] = [{"at_pct": round_sig(first_ret) if first_ret and first_ret > 0 else None, "size": round(size, 2)}]
        legs.append({"trail": {"pct": round_sig(trail) if trail else None, "activate_pct": legs[0]["at_pct"]}, "size": round(1 - size, 2)})
        later = [l for t in split_wins for l in t["legs"]["exits"][1:]]
        be = sum(1 for l in later if l["return_pct"] is not None and abs(l["return_pct"]) <= 0.15)
        out["scale_out"] = {
            "legs": legs,
            "basis": f"분할 청산한 이긴 거래 {len(split_wins)}건 — 첫 다리 수익 · 비율 중앙값, 남은 몫은 MFE 에서 내준 폭 중앙값",
            "breakeven_after_first": bool(later) and be / len(later) >= 0.25,
            "breakeven_share": (be / len(later)) if later else None,
        }
    else:
        tgt = q((t["return_pct"] for t in wins), 0.5)
        out["target"] = {"target_pct": round_sig(tgt) if tgt and tgt > 0 else None, "basis": "분할이 습관이 아니다(이긴 거래 40% 미만) — 이긴 거래 수익 중앙값"}
    hold = q((t["hold_minutes"] for t in trades), 0.9)
    out["max_hold_days"] = round(hold / 1440, 3) if hold else None
    # 끌고가기 — 마지막 몫을 판 시점에 바뀐 것(TRADER-01 C-3)
    changed: dict[str, int] = {}
    for t in split_wins:
        for c in get(contexts.get(t["id"]), ["exit", "changed_last_4h"]) or []:
            changed[c] = changed.get(c, 0) + 1
    out["last_leg_signals"] = sorted(changed.items(), key=lambda x: -x[1])[:8]
    return out


# ── B-5 사이징 ──────────────────────────────────────────────────────────


def spearman(xs: list[float], ys: list[float]) -> float | None:
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 8:
        return None

    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2
            i = j + 1
        return r

    rx = ranks([p[0] for p in pairs])
    ry = ranks([p[1] for p in pairs])
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den else None


def sizing(trades: list[dict], contexts: dict[str, dict], bills: list[dict], streak_rows: list[dict], conds_met: dict[str, int] | None) -> dict:
    by_id = {r["id"]: r for r in streak_rows}
    order = sorted(trades, key=lambda t: t["exit_ms"])
    prev_streak: dict[str, int] = {}
    last = 0
    for t in sorted(trades, key=lambda t: t["entry_ms"]):
        prev_streak[t["id"]] = last
        last = by_id.get(t["id"], {}).get("loss_streak", last)
    margin = []
    lev = []
    vol = []
    streak = []
    met = []
    for t in trades:
        eq = equity_at(bills, t["entry_ms"])
        margin.append((t["margin_usdt"] / eq * 100) if t.get("margin_usdt") and eq else None)
        lev.append(t.get("leverage"))
        hi = get(contexts.get(t["id"]), ["entry", "market", "1H", "to_high20_pct"])
        lo = get(contexts.get(t["id"]), ["entry", "market", "1H", "to_low20_pct"])
        vol.append((hi - lo) if hi is not None and lo is not None else None)
        streak.append(prev_streak.get(t["id"]))
        met.append((conds_met or {}).get(t["id"]))
    del order
    rows = []
    for name, ys in (("증거금 %", margin), ("레버리지", lev)):
        for factor, xs in (("직전 20봉 변동폭 %", vol), ("직전 연속 손실", streak), ("진입 조건 충족 수", met)):
            rows.append({"size": name, "factor": factor, "rho": spearman(xs, ys), "n": sum(1 for x, y in zip(xs, ys) if x is not None and y is not None)})
    lev_med = q(lev, 0.5)
    margin_med = q(margin, 0.5)
    notional_pct = [(t["notional_usdt"] / eq * 100) for t in trades if (eq := equity_at(bills, t["entry_ms"]))]
    return {
        "leverage": lev_med,
        "margin_pct": margin_med,
        "notional_pct": q(notional_pct, 0.5),
        "correlations": rows,
        "note": "랩 엔진 사이징은 고정(fixed_pct)뿐 — 조건에 따라 크기를 바꾸는 규칙은 정의에 못 싣는다. |rho| ≥ 0.3 이면 따로 보고한다",
    }


# ── 쉬는 규칙 ───────────────────────────────────────────────────────────


def pause_rule(rows: list[dict]) -> dict:
    """k 연패 뒤 다음 진입까지의 간격이 이긴 뒤보다 2배 이상 길고(중앙값) 5번 이상 나왔으면 쉬는 규칙으로 본다."""
    base = q((r["gap_min"] for r in rows if r["won"]), 0.5)
    tried = []
    for k in (2, 3, 4):
        sel = [r["gap_min"] for r in rows if r["loss_streak"] == k and r["gap_min"] is not None]
        med = q(sel, 0.5)
        tried.append({"k": k, "n": len(sel), "gap_median_min": med, "baseline_min": base})
        if len(sel) >= 5 and base and med and med >= 2 * base:
            return {"rule": {"after_consecutive_losses": k, "minutes": max(10, round(med / 10) * 10)}, "tried": tried}
    return {"rule": None, "tried": tried, "basis": "연패 뒤 간격이 평소의 2배를 넘는 경우가 5번 이상 없다 — 쉬는 습관이 데이터에 안 보인다"}
