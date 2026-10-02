"""PART C (말한 것 vs 실제) · PART D (규칙 정의 두 벌).

C 의 '일치' 는 **숫자 칸끼리만** 기계가 매긴다. 서술은 기계가 판정하지 않는다 — '광혁 판단' 으로 남긴다.
불일치가 나와도 어느 쪽이 맞는지는 정하지 않는다(지시서 C: 광혁이 판단한다).
"""
from __future__ import annotations

from typing import Any

from .t2_analysis import q

AGREE = 0.25  # 상대 차이 25% 이내 → 일치
PARTIAL = 0.60  # 60% 이내 → 부분


def judge_number(said: float | None, data: float | None) -> str:
    if said is None:
        return "말 안 함"
    if data is None:
        return "데이터 없음"
    if said == 0 and data == 0:
        return "일치"
    ref = max(abs(said), abs(data))
    if (said > 0) != (data > 0) and said != 0 and data != 0:
        return "불일치"
    gap = abs(said - data) / ref
    return "일치" if gap <= AGREE else "부분" if gap <= PARTIAL else "불일치"


def judge_yes(said: bool | None, share: float | None) -> str:
    """'예' 라고 했는데 실제로 그런 비율. 60% 이상 일치 · 30~60% 부분 · 미만 불일치('아니오' 는 뒤집어)."""
    if said is None:
        return "말 안 함"
    if share is None:
        return "데이터 없음"
    s = share if said else 1 - share
    return "일치" if s >= 0.6 else "부분" if s >= 0.3 else "불일치"


def pct(x: float | None) -> str:
    return "—" if x is None else f"{x * 100:.0f}%"


def num(x: float | None, unit: str = "", digits: int = 2) -> str:
    return "—" if x is None else f"{x:,.{digits}f}{unit}"


def stated_vs_revealed(answers: dict[str, dict], desc: dict, exits: dict, sizing: dict, pause: dict, trades: list[dict]) -> list[dict]:
    v = {k[2:]: item["value"] for k, item in answers.items() if k.startswith("N.")}
    raw = lambda qid: answers.get(qid, {}).get("answer", "")  # noqa: E731
    losses = [t for t in trades if t["net_pnl"] <= 0]
    stop_share = (sum(1 for t in losses if t["exit_method"] == "stop_loss") / len(losses)) if losses else None
    stop_trades = [r for r in desc["_streak_rows"] if r["exit_method"] == "stop_loss"]
    reentry = [r for r in stop_trades if r["next_gap_same_symbol_min"] is not None and r["next_gap_same_symbol_min"] <= 24 * 60]
    reentry_share = (len(reentry) / len(stop_trades)) if stop_trades else None
    split_wins = desc.get("split_exit_share_wins")
    first_leg = (desc["leg_stats"][0] if desc["leg_stats"] else None)
    loss_ret = q((t["return_pct"] for t in losses), 0.5)
    after = {a.get("k"): a for a in desc["after_losses"] if a.get("k")}
    k_said = int(v["pause_after_losses"]) if v.get("pause_after_losses") else None
    gap_after_k = after.get(min(k_said, 3))["gap_min"]["median"] if k_said and after.get(min(k_said, 3)) else None
    sides = desc["sides"]
    total = sum(sides.values()) or 1
    side_data = "both" if min(sides.values()) / total >= 0.2 else max(sides, key=sides.get)

    rows: list[dict[str, Any]] = [
        _row("A-1", "하루 진입", raw("A1.per_day"), f"{num(desc['trades_per_day'])}번/일", judge_number(v.get("trades_per_day"), desc["trades_per_day"])),
        _row("A-1", "종목", raw("A1.symbols"), ", ".join(sorted({t['symbol'] for t in trades})[:12]), "광혁 판단"),
        _row("A-2", "방향", raw("N.side") or "—", f"롱 {sides['long']} · 숏 {sides['short']} → {side_data}", ("일치" if v.get("side") == side_data else "불일치") if v.get("side") else "말 안 함"),
        _row("A-2", "확인하는 것 · 시간봉", f"{raw('A2.must_check')} / {raw('A2.timeframe')}", "진입 규칙 후보(B-3) 표 참고", "광혁 판단"),
        _row("A-2", "나눠서 진입", raw("A2.split_entry"), f"분할 진입 {pct(desc['split_entry_share'])}", judge_yes(v.get("split_entry"), desc["split_entry_share"])),
        _row("A-3", "레버리지", raw("A3.leverage"), f"중앙값 {num(sizing['leverage'], '배', 1)}", judge_number(v.get("leverage"), sizing["leverage"])),
        _row("A-3", "증거금 비율", raw("A3.margin"), f"중앙값 {num(sizing['margin_pct'], '%', 1)}", judge_number(v.get("margin_pct"), sizing["margin_pct"])),
        _row("A-3", "자신 있을 때 더 싣나", raw("A3.confidence"), _corr_line(sizing), "광혁 판단"),
        _row(
            "A-4",
            "손절",
            raw("A4.stop"),
            f"이긴 거래 MAE 중앙 {num(desc['mae']['win']['median'], '%')} · 진 거래 MAE 중앙 {num(desc['mae']['loss']['median'], '%')} · 진 거래 실현 중앙 {num(loss_ret, '%')}",
            judge_number(v.get("stop_pct") if v.get("stop_pct") is None else -abs(v["stop_pct"]), loss_ret),
        ),
        _row("A-4", "손절 주문 미리", raw("A4.stop_order"), f"진 거래 중 손절 주문으로 나간 비율 {pct(stop_share)}", judge_yes(v.get("stop_order"), stop_share)),
        _row("A-4", "손절 뒤 같은 종목 재진입", raw("A4.reentry"), f"손절 뒤 24시간 안 같은 종목 {pct(reentry_share)}", judge_yes(v.get("reentry_after_stop"), reentry_share)),
        _row("A-5", "나눠서 파나", raw("A5.scale_out"), f"이긴 거래 중 분할 청산 {pct(split_wins)}", judge_yes(v.get("scale_out"), split_wins)),
        _row(
            "A-5",
            "첫 익절",
            raw("A5.take_profit"),
            f"첫 다리 수익 중앙 {num(first_leg['return_pct']['median'] if first_leg else None, '%')} · 비율 중앙 {num(first_leg['qty_pct']['median'] if first_leg else None, '%', 0)}",
            judge_number(v.get("first_tp_pct"), first_leg["return_pct"]["median"] if first_leg else None),
        ),
        _row("A-5", "끌고 가기", f"{raw('A5.let_run')} / {raw('A5.exit_signal')}", f"잡은 몫(실현÷MFE) 중앙 {num(desc['capture']['win']['median'])} · 마지막 몫 팔 때 바뀐 것: {_signals(exits)}", "광혁 판단"),
        _row("A-5", "최대 보유", raw("N.max_hold_hours") or "—", f"보유 p90 {num((exits.get('max_hold_days') or 0) * 24 if exits.get('max_hold_days') else None, '시간', 1)}", judge_number(v.get("max_hold_hours"), (exits["max_hold_days"] * 24) if exits.get("max_hold_days") else None)),
        _row(
            "A-6",
            "쉬는 조건",
            raw("A6.pause"),
            f"{k_said or '?'}연패 뒤 다음 진입까지 중앙 {num(gap_after_k, '분', 0)} (이긴 뒤 중앙 {num(desc['after_losses'][0]['gap_min']['median'], '분', 0)})",
            judge_number(v.get("pause_minutes"), gap_after_k),
        ),
    ]
    return rows


def _row(part: str, item: str, said: str, data: str, match: str) -> dict:
    return {"part": part, "item": item, "said": (said or "").replace("\n", " / ") or "—", "data": data, "match": match, "kwanghyuk": ""}


def _corr_line(sizing: dict) -> str:
    strong = [r for r in sizing["correlations"] if r["rho"] is not None and abs(r["rho"]) >= 0.3]
    if not strong:
        return "크기와 뚜렷이 같이 움직이는 것 없음(|rho| < 0.3)"
    return " · ".join(f"{r['size']}↔{r['factor']} {r['rho']:+.2f}" for r in strong)


def _signals(exits: dict) -> str:
    sig = exits.get("last_leg_signals") or []
    return ", ".join(f"{k} {n}" for k, n in sig[:3]) or "—"


# ── D 광혁-데이터 ───────────────────────────────────────────────────────


def data_definition(chosen: dict[str, dict | None], exits: dict, sizing: dict, pause: dict, symbols: list[str], concurrent_p90: float | None = None) -> dict:
    """B 결과만으로 만든다. 뒤 30% 는 보지 않았다(`train_trades` 만 받은 결과다)."""
    long_c = chosen.get("long")
    short_c = chosen.get("short")
    if long_c and short_c:
        side, entry, entry_short = "both", long_c, short_c
    elif short_c:
        side, entry, entry_short = "short", short_c, None
    else:
        side, entry, entry_short = "long", long_c, None
    exit_rules: dict[str, Any] = {"stop_pct": exits["stop"]["stop_pct"] or -5, "target_pct": None}
    notes = []
    if exits["stop"]["stop_pct"] is None:
        notes.append("손절을 데이터로 못 정했다(이긴 거래 MAE 없음) — 기본 -5%")
    if "scale_out" in exits and all(l.get("at_pct") or (l.get("trail") or {}).get("pct") for l in exits["scale_out"]["legs"]):
        exit_rules["scale_out"] = exits["scale_out"]["legs"]
        if exits["scale_out"]["breakeven_after_first"]:
            exit_rules["breakeven_after_first"] = True
    elif "target" in exits and exits["target"]["target_pct"]:
        exit_rules["target_pct"] = exits["target"]["target_pct"]
    if exits.get("max_hold_days"):
        exit_rules["max_hold_days"] = exits["max_hold_days"]
    leverage = max(1, round(sizing["leverage"] or 1))
    margin = sizing["margin_pct"] or ((sizing["notional_pct"] or 10) / leverage)
    definition: dict[str, Any] = {
        "name": "광혁-데이터",
        "source": "revealed",
        "market": "crypto",
        "universe": {"type": "list", "symbols": symbols},
        "side": side,
        "entry": {"all": entry["conditions"]} if entry else {"all": [{"indicator": "_todo", "_todo": "진입 규칙 후보가 없다(진입 수 부족)"}]},
        "exit": exit_rules,
        "sizing": {"type": "fixed_pct", "fixed_pct": round(min(max(margin, 0.1), 100.0), 2)},
        "leverage": leverage,
        # 동시 보유 상한 = 광혁이 진입할 때 열려 있던 포지션 수의 p90.
        "max_positions": max(1, round(concurrent_p90 or 1)),
        "pause": pause["rule"],
        "derived_from": {
            "entry_recall": entry["recall"] if entry else None,
            "entry_precision": entry["precision"] if entry else None,
            "entry_short_recall": entry_short["recall"] if entry_short else None,
            "entry_short_precision": entry_short["precision"] if entry_short else None,
        },
        "notes": notes,
    }
    if entry_short:
        definition["entry_short"] = {"all": entry_short["conditions"]}
    return definition
