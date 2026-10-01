"""PART D (계좌 지표) · PART E (대조).

입력은 Bitget 선물 계좌 장부(`/api/v2/mix/account/bill`) — 잔고를 바꾼 모든 일이 한 줄씩 있다.

- **입출금**은 이체 줄(trans_from_* · trans_to_* · transfer_*)이다. 손익이 아니다.
- **시간가중수익률**: 이체 직전마다 끊어서 구간 수익률을 곱한다. 거래소 앱의 %(입출금이 섞인 값)는 쓰지 않는다.
  잔고는 장부의 `balance`(체결 손익·수수료·펀딩이 반영된 지갑 잔고)다 — **미실현 손익은 빠진다.**
  포지션을 오래 들고 가는 사이 MDD 는 실제보다 작게 나올 수 있다. 보고서에 그렇게 적는다.
- **비용 비중** = 비용 합 ÷ |비용 전 총손익| — 랩 ENG-02 와 같은 정의(엔진 85% 와 견줄 수 있게).
"""
from __future__ import annotations

from collections import OrderedDict
from typing import Any, Iterable

from .timeutil import DAY_MS, local_day, local_month

TRANSFER_TYPES = (
    "trans_from_",
    "trans_to_",
    "transfer_in",
    "transfer_out",
    "deposit",
    "withdraw",
)
CLOSE_TYPES = ("close_long", "close_short", "burst_", "force_close", "force_buy", "force_sell", "delivery_", "offset_")
FUNDING_TYPES = ("contract_settle_fee", "contract_main_settle_fee", "contract_margin_settle_fee")


def bill_kind(business_type: str) -> str:
    t = (business_type or "").lower()
    if t.startswith(TRANSFER_TYPES) or t in TRANSFER_TYPES:
        return "transfer"
    if t in FUNDING_TYPES or "settle_fee" in t:
        return "funding"
    if t.startswith(CLOSE_TYPES) or "burst" in t:
        return "close"
    if t.startswith(("open_long", "open_short", "buy", "sell")):
        return "open"
    if "margin" in t:
        return "margin"  # 증거금 넣고 빼기 — 잔고 이동일 뿐 손익 아님(격리)
    return "other"


def _f(v: Any) -> float | None:
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def normalize_bill(row: dict) -> dict:
    return {
        "id": str(row.get("billId") or row.get("id")),
        "ts": int(row.get("cTime") or row.get("ts")),
        "type": str(row.get("businessType") or ""),
        "kind": bill_kind(str(row.get("businessType") or "")),
        "amount": _f(row.get("amount")) or 0.0,
        "fee": _f(row.get("fee")) or 0.0,  # 부호 그대로(낸 수수료는 음수)
        "balance": _f(row.get("balance")),
        "symbol": str(row.get("symbol") or "").upper(),
        "coin": str(row.get("coin") or "").upper(),
    }


def ledger_consistency(bills: list[dict], tol: float = 1e-6) -> dict:
    """장부 자기 검증 — 줄마다 잔고 변화 = 금액 + 수수료 인가.

    수수료 부호를 거꾸로 읽으면 순손익이 수수료 두 배만큼 틀어진다. 그걸 여기서 잡는다.
    `amount − fee` 로 맞는 줄이 더 많으면 부호가 반대라는 뜻이다.
    """
    rows = sorted((b for b in bills if b["balance"] is not None), key=lambda b: (b["ts"], b["id"]))
    plus = minus = checked = 0
    for prev, cur in zip(rows, rows[1:]):
        delta = cur["balance"] - prev["balance"]
        checked += 1
        if abs(delta - (cur["amount"] + cur["fee"])) <= tol + 1e-9 * abs(cur["balance"]):
            plus += 1
        elif abs(delta - (cur["amount"] - cur["fee"])) <= tol + 1e-9 * abs(cur["balance"]):
            minus += 1
    return {
        "checked": checked,
        "fits_amount_plus_fee": plus,
        "fits_amount_minus_fee": minus,
        "neither": checked - plus - minus,
        "fee_sign_flipped": minus > plus,
    }


def pnl_effect(bill: dict) -> float:
    """잔고에 준 손익 효과. 이체 · 증거금 이동은 0."""
    if bill["kind"] in ("transfer", "margin"):
        return 0.0
    return bill["amount"] + bill["fee"]


def is_flow(bill: dict) -> bool:
    return bill["kind"] == "transfer"


# ── D-1 시간가중수익률 ──────────────────────────────────────────────────


def twr(bills: list[dict], tz=None) -> dict:
    """이체로 끊고 구간 수익률을 곱한다. 일말 지수(index) · MDD 도 같이.

    잔고가 비어 있는 줄이 있으면 산출하지 않는다 — 지어내지 않는다.
    """
    rows = sorted(bills, key=lambda b: (b["ts"], b["id"]))
    if not rows:
        return {"status": "no_bills"}
    if any(b["balance"] is None for b in rows):
        return {"status": "no_balance_field", "note": "장부에 잔고(balance)가 없어 시간가중수익률을 못 낸다"}
    kw = {"tz": tz} if tz else {}
    index = 1.0
    seg_start: float | None = None
    prev_balance: float | None = None
    daily: "OrderedDict[str, float]" = OrderedDict()
    segments = 0
    skipped = 0
    for b in rows:
        before = prev_balance if prev_balance is not None else b["balance"] - b["amount"] - b["fee"]
        if is_flow(b):
            if seg_start and seg_start > 0:
                index *= before / seg_start
                segments += 1
            elif seg_start is not None:
                skipped += 1
            seg_start = b["balance"]
        else:
            if seg_start is None:
                seg_start = before
        prev_balance = b["balance"]
        current = index * (b["balance"] / seg_start) if seg_start and seg_start > 0 else index
        daily[local_day(b["ts"], **kw)] = current
    final = index * (prev_balance / seg_start) if seg_start and seg_start > 0 and prev_balance is not None else index
    peak = 0.0
    mdd = 0.0
    for v in daily.values():
        peak = max(peak, v)
        if peak > 0:
            mdd = min(mdd, v / peak - 1)
    return {
        "status": "ok",
        "twr_pct": (final - 1) * 100,
        "mdd_pct": mdd * 100,
        "segments": segments + 1,
        "skipped_empty_segments": skipped,
        "daily_index": dict(daily),
        "basis": "지갑 잔고(실현) · 미실현 제외",
    }


# ── D-2 계좌 지표 ───────────────────────────────────────────────────────


def daily_pnl(bills: Iterable[dict], tz=None) -> "OrderedDict[str, float]":
    kw = {"tz": tz} if tz else {}
    out: "OrderedDict[str, float]" = OrderedDict()
    for b in sorted(bills, key=lambda x: x["ts"]):
        eff = pnl_effect(b)
        if eff == 0.0:
            continue
        day = local_day(b["ts"], **kw)
        out[day] = out.get(day, 0.0) + eff
    return out


def _percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * q
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def trade_stats(trades: list[dict]) -> dict:
    nets = [t["net_pnl"] for t in trades]
    wins = [x for x in nets if x > 0]
    losses = [x for x in nets if x < 0]
    gross_win = sum(wins)
    gross_loss = -sum(losses)
    gross = abs(sum(t["realized_pnl"] for t in trades))
    costs = sum(t["fees"] for t in trades) + sum(-t["funding"] for t in trades if t["funding"] < 0)
    return {
        "trades": len(trades),
        "net_pnl": sum(nets),
        "pf": (gross_win / gross_loss) if gross_loss > 0 else None,
        "win_rate_pct": (len(wins) / len(nets) * 100) if nets else None,
        "avg_win": (gross_win / len(wins)) if wins else None,
        "avg_loss": (-gross_loss / len(losses)) if losses else None,
        "payoff": (gross_win / len(wins)) / (gross_loss / len(losses)) if wins and losses else None,
        "fees": sum(t["fees"] for t in trades),
        "funding": sum(t["funding"] for t in trades),
        "cost_share_pct": (costs / gross * 100) if gross > 0 else None,
    }


def daily_stats(days: "OrderedDict[str, float]") -> dict:
    values = list(days.values())
    worst_streak = streak = 0
    for v in values:
        streak = streak + 1 if v < 0 else 0
        worst_streak = max(worst_streak, streak)
    return {
        "active_days": len(values),
        "win_days": sum(1 for v in values if v > 0),
        "loss_days": sum(1 for v in values if v < 0),
        "max_daily_loss": min(values) if values else None,
        "max_daily_gain": max(values) if values else None,
        "p10": _percentile(values, 0.1),
        "median": _percentile(values, 0.5),
        "p90": _percentile(values, 0.9),
        "max_losing_streak_days": worst_streak,
        "streak_basis": "손익 있던 날만 이어 셈",
    }


def account_metrics(trades: list[dict], bills: list[dict], span_days: float, tz=None) -> dict:
    flows = [b for b in bills if is_flow(b)]
    days = daily_pnl(bills, tz)
    return {
        "net_pnl_bills": sum(pnl_effect(b) for b in bills),
        "net_flows": sum(b["amount"] for b in flows),
        "deposits": sum(b["amount"] for b in flows if b["amount"] > 0),
        "withdrawals": sum(b["amount"] for b in flows if b["amount"] < 0),
        "twr": twr(bills, tz),
        "trade": trade_stats(trades),
        "daily": daily_stats(days),
        "trades_per_day": (len(trades) / span_days) if span_days > 0 else None,
    }


def monthly(trades: list[dict], bills: list[dict], twr_daily: dict | None, tz=None) -> list[dict]:
    """월별 — 우위가 유지됐나, 한 달만 좋았나."""
    kw = {"tz": tz} if tz else {}
    by_month: "OrderedDict[str, list[dict]]" = OrderedDict()
    for t in sorted(trades, key=lambda x: x["exit_ms"]):
        by_month.setdefault(local_month(t["exit_ms"], **kw), []).append(t)
    bill_month: dict[str, float] = {}
    for b in bills:
        bill_month[local_month(b["ts"], **kw)] = bill_month.get(local_month(b["ts"], **kw), 0.0) + pnl_effect(b)
    month_end_index: dict[str, float] = {}
    for day, value in (twr_daily or {}).items():
        month_end_index[day[:7]] = value
    out = []
    prev_index = 1.0
    for month in sorted(set(by_month) | set(bill_month)):
        stats = trade_stats(by_month.get(month, []))
        idx = month_end_index.get(month)
        out.append(
            {
                "month": month,
                **stats,
                "net_pnl_bills": bill_month.get(month),  # 장부가 없는 달은 None — 0 으로 메우지 않는다
                "twr_pct": ((idx / prev_index - 1) * 100) if idx else None,
            }
        )
        if idx:
            prev_index = idx
    total = sum(m["net_pnl_bills"] for m in out if m["net_pnl_bills"] is not None)
    for m in out:
        m["share_of_total_pct"] = (m["net_pnl_bills"] / total * 100) if total and m["net_pnl_bills"] is not None else None
    return out


# ── E 대조 ──────────────────────────────────────────────────────────────


def reconcile(
    trades: list[dict],
    unmatched: list[dict],
    bills: list[dict],
    ledger_from_ms: int | None = None,
    tolerance_pct: float = 1.0,
) -> dict:
    """E-1 재구성 실현 손익 합 = 거래소 기간 실현 손익 (±1%).

    구간 = 장부가 덮는 첫 시각(또는 첫 거래 진입) 이후 진입한 거래 ~ 마지막 청산.
    장부보다 먼저 시작한 거래(FCE 사본에만 있는 옛 거래)는 **대조 불가**로 따로 센다 — 숨기지 않는다.
    거래소 쪽 = 장부의 청산 줄(close_* · burst_* …) 금액 합(수수료 전) — 체결의 `profit` 과 같은 정의.
    """
    if not trades:
        return {"status": "no_trades"}
    has_bills = any(b["kind"] == "close" for b in bills)
    ledger_start = ledger_from_ms  # 모르면 제한하지 않는다(파이프라인은 fetch_log 로 늘 넘긴다)
    first_entry = min(t["entry_ms"] for t in trades)
    start = max(first_entry, ledger_start) if ledger_start is not None else first_entry
    inside = [t for t in trades if t["entry_ms"] >= start]
    outside = [t for t in trades if t["entry_ms"] < start]
    if not inside:
        return {"status": "no_overlap", "outside_ledger": len(outside)}
    end = max(t["exit_ms"] for t in inside)
    recon = sum(t["realized_pnl"] for t in inside)
    exch = sum(b["amount"] for b in bills if b["kind"] == "close" and start <= b["ts"] <= end)
    # 구간 시작 전에 열려 구간 안에서 닫힌 포지션 — 장부엔 있고 재구성 거래엔 없다.
    straddling = [t for t in outside if t["exit_ms"] >= start]
    exch_straddle = sum(
        b["amount"] for b in bills if b["kind"] == "close" and start <= b["ts"] <= end and any(t["symbol"] == b["symbol"] and t["entry_ms"] < start <= b["ts"] <= t["exit_ms"] for t in straddling)
    )
    exch -= exch_straddle
    loose = [u for u in unmatched if start <= u["ts"] <= end]
    diff = recon - exch
    denom = abs(exch) if abs(exch) > 1e-9 else None
    diff_pct = (abs(diff) / denom * 100) if denom else None
    ok = has_bills and diff_pct is not None and diff_pct <= tolerance_pct
    return {
        "status": "ok" if ok else ("no_close_bills" if not has_bills else "mismatch"),
        "window": [start, end],
        "trades_compared": len(inside),
        "outside_ledger": len(outside),
        "reconstructed": recon,
        "exchange": exch,
        "diff": diff,
        "diff_pct": diff_pct,
        "tolerance_pct": tolerance_pct,
        "unmatched_close_fills_in_window": len(loose),
        "unmatched_profit_in_window": sum(u.get("profit") or 0.0 for u in loose),
    }


def thirty_day(bills: list[dict], now_ms: int, app_value: float | None) -> dict:
    """E-2 최근 30일 합 vs 앱 30D PnL (입출금 보정 전 = 이체 뺀 잔고 손익)."""
    since = now_ms - 30 * DAY_MS
    ours = sum(pnl_effect(b) for b in bills if b["ts"] >= since)
    realized_only = sum(b["amount"] for b in bills if b["ts"] >= since and b["kind"] == "close")
    out = {"ours_net": ours, "ours_realized_before_costs": realized_only, "app": app_value}
    if app_value is not None:
        out["diff"] = ours - app_value
        out["diff_pct"] = (abs(ours - app_value) / abs(app_value) * 100) if app_value else None
    return out


def coverage(fills_ms: list[int], close_fills_ms: list[int], bills: list[dict], fetch_errors: list[dict], ledger_from_ms: int | None = None, tz=None) -> dict:
    """E-3 기간 · 누락. 청산 장부는 있는데 청산 체결이 없는 날(또는 그 반대) = 한쪽 누락 의심."""
    kw = {"tz": tz} if tz else {}
    # 장부가 덮기 전 날은 견주지 않는다(장부가 없는 게 당연하다).
    close_fill_days = {local_day(ms, **kw) for ms in close_fills_ms if ledger_from_ms is None or ms >= ledger_from_ms}
    close_bill_days = {local_day(b["ts"], **kw) for b in bills if b["kind"] == "close"}
    return {
        "first_fill": min(fills_ms) if fills_ms else None,
        "last_fill": max(fills_ms) if fills_ms else None,
        "days_with_fills": len({local_day(ms, **kw) for ms in fills_ms}),
        "close_bill_days_without_fills": sorted(close_bill_days - close_fill_days),
        "close_fill_days_without_bills": sorted(close_fill_days - close_bill_days) if bills else [],
        "fetch_errors": fetch_errors,
    }
