"""PART E — 뒤 30% 검증 · 재량 거래. **동결된 규칙만** 돈다(`t2_order.require_frozen`).

비교는 손익 구조로 한다(TRADER-00 원칙 3). %는 표에 없다.
"""
from __future__ import annotations

from .t2_analysis import q
from .timeutil import HOUR_MS, local_day

MATCH_TOL_MS = HOUR_MS  # 규칙 진입 v 와 광혁 진입 e: v ≤ e < v + 1시간 (B-3 후보 점수와 같은 창)
FOLLOW_PF_GAP = 0.30
FOLLOW_PAYOFF_GAP = 0.30
FOLLOW_DAILY_LOSS_MULT = 1.5


def structure(rows: list[dict], pnl_key: str, exit_key: str) -> dict:
    """거래 목록 → 손익 구조."""
    pnls = [r[pnl_key] for r in rows]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    days: dict[str, float] = {}
    for r in rows:
        day = local_day(r[exit_key])
        days[day] = days.get(day, 0.0) + r[pnl_key]
    gross_loss = -sum(losses)
    avg_win = sum(wins) / len(wins) if wins else None
    avg_loss = sum(losses) / len(losses) if losses else None
    return {
        "trades": len(rows),
        "net": sum(pnls),
        "pf": (sum(wins) / gross_loss) if gross_loss > 0 else None,
        "win_rate": (len(wins) / len(pnls)) if pnls else None,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "payoff": (avg_win / -avg_loss) if avg_win and avg_loss else None,
        "max_daily_loss": min(days.values()) if days else None,
        "loss_days": sum(1 for v in days.values() if v < 0),
        "win_days": sum(1 for v in days.values() if v > 0),
    }


def match(actual: list[dict], engine_entries: list[dict]) -> tuple[set[str], set[int]]:
    """광혁 진입 ↔ 규칙 진입. 같은 종목 · 같은 방향 · v ≤ e < v + 1시간. 한 규칙 진입은 한 광혁 진입에만."""
    used: set[int] = set()
    hit: set[str] = set()
    for t in sorted(actual, key=lambda x: x["entry_ms"]):
        side = "LONG" if t["direction"] == "long" else "SHORT"
        for i, v in enumerate(engine_entries):
            if i in used or v["symbol"] != t["symbol"] or v["side"] != side:
                continue
            if v["entryAt"] <= t["entry_ms"] < v["entryAt"] + MATCH_TOL_MS:
                used.add(i)
                hit.add(t["id"])
                break
    return hit, used


def engine_rows(result: dict) -> list[dict]:
    return [{"pnl": t["pnl"], "exit": t["exitAt"], "symbol": t["symbol"], "side": t["side"], "entryAt": t["entryAt"]} for t in result.get("trades", [])]


def engine_entries(result: dict) -> list[dict]:
    rows = [{"symbol": t["symbol"], "side": t["side"], "entryAt": t["entryAt"]} for t in result.get("trades", [])]
    rows += [{"symbol": p["symbol"], "side": p["side"], "entryAt": p["entryAt"]} for p in result.get("open", [])]
    return rows


def evaluate(actual: list[dict], results: dict[str, dict]) -> dict:
    table = {"광혁 실계좌": {**structure(actual, "net_pnl", "exit_ms"), "recall": None, "precision": None}}
    matched: dict[str, set[str]] = {}
    for name, res in results.items():
        if not res.get("ok"):
            table[name] = {"error": res.get("errors")}
            continue
        entries = engine_entries(res)
        hit, used = match(actual, entries)
        matched[name] = hit
        table[name] = {
            **structure(engine_rows(res), "pnl", "exit"),
            "recall": (len(hit) / len(actual)) if actual else None,
            "precision": (len(used) / len(entries)) if entries else None,
            "blocked": res.get("blocked"),
            "open_at_end": len(res.get("open", [])),
        }
    return {"table": table, "matched": matched}


def follows(actual: dict, version: dict) -> dict:
    """'광혁 실계좌 손익 구조를 따라가나' — 네 가지를 본다. 넷 다면 따라간다, 둘~셋이면 일부, 아니면 못 따라간다."""
    checks = []

    def rel(a, b):
        return abs(a - b) / max(abs(a), abs(b)) if a is not None and b is not None and max(abs(a), abs(b)) > 0 else None

    checks.append(("순손익 부호가 같다", actual["net"] is not None and version.get("net") is not None and (actual["net"] > 0) == (version["net"] > 0)))
    g = rel(actual.get("pf"), version.get("pf"))
    checks.append((f"PF 차이 ≤ {FOLLOW_PF_GAP:.0%}", g is not None and g <= FOLLOW_PF_GAP))
    g = rel(actual.get("payoff"), version.get("payoff"))
    checks.append((f"평균이익/평균손실 차이 ≤ {FOLLOW_PAYOFF_GAP:.0%}", g is not None and g <= FOLLOW_PAYOFF_GAP))
    a, v = actual.get("max_daily_loss"), version.get("max_daily_loss")
    checks.append((f"최대 일손실이 실계좌의 {FOLLOW_DAILY_LOSS_MULT}배 안", a is not None and v is not None and v >= a * FOLLOW_DAILY_LOSS_MULT))
    ok = sum(1 for _, c in checks if c)
    verdict = "따라간다" if ok == 4 else "일부만 따라간다" if ok >= 2 else "못 따라간다"
    return {"checks": [{"check": n, "ok": c} for n, c in checks], "passed": ok, "verdict": verdict}


def discretionary(actual: list[dict], matched: set[str]) -> dict:
    """E-2 — 규칙으로 설명 안 되는 거래. **지우지 않고** 표시만 한다(TRADER-00 원칙 6)."""
    rest = [t for t in actual if t["id"] not in matched]
    total = sum(t["net_pnl"] for t in actual)
    gross = sum(t["net_pnl"] for t in actual if t["net_pnl"] > 0)
    d_net = sum(t["net_pnl"] for t in rest)
    d_gross = sum(t["net_pnl"] for t in rest if t["net_pnl"] > 0)
    return {
        "n": len(rest),
        "of": len(actual),
        "net": d_net,
        "share_of_net": (d_net / total) if total else None,
        "share_of_gross_profit": (d_gross / gross) if gross else None,
        "ids": [t["id"] for t in rest],
        "hold_median_min": q((t["hold_minutes"] for t in rest), 0.5),
        "symbols": sorted({t["symbol"] for t in rest}),
    }
