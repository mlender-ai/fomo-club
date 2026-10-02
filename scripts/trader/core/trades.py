"""PART B — 체결 여러 건 → 거래 1건.

체결을 어느 쪽(열기/닫기 · 롱/숏)으로 볼지는 FCE `app/paper/user_fills.py` 의 `_fill_action` 을
그대로 옮겼다 — FCE 가 실계좌에서 이미 맞춰 본 판정이다. FCE 와 다른 점은 **분할을 살린다**는 것:

- 진입·청산을 **주문 단위**로 묶어 다리(leg)로 남긴다. 주문 하나가 체결 다섯 건으로 나뉜 건 분할이 아니다.
- 청산 다리마다 그 순간 평균 진입가 대비 수익률 · 물량 비율을 남긴다 → "절반 익절하고 나머지 끌고 간다".

손익 기준: `realized_pnl` = 거래소가 체결마다 준 `profit` 합(수수료 전). 거래소 장부(bill)의 청산 금액과
같은 정의라 PART E-1 대조가 사과 대 사과다. 체결에 `profit` 이 없으면 가격으로 계산한 값을 쓴다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from .timeutil import iso, parse_iso_ms

EPS = 1e-12


@dataclass
class Fill:
    id: str
    order_id: str | None
    symbol: str
    side: str  # buy | sell
    trade_side: str
    price: float
    size: float
    ts: int  # ms
    fee: float  # 낸 수수료(USDT, 양수)
    profit: float | None  # 거래소 실현 손익(수수료 전)
    pos_mode: str | None = None


def _f(value: Any) -> float | None:
    try:
        return None if value is None or value == "" else float(value)
    except (TypeError, ValueError):
        return None


def fill_from_api(row: dict, margin_coin: str = "USDT") -> Fill:
    """Bitget `/api/v2/mix/order/fill-history` 한 줄. FCE `parse_account_fill` 과 같은 해석."""
    detail = [d for d in (row.get("feeDetail") or []) if isinstance(d, dict)]
    fee = sum(abs(_f(d.get("totalFee")) or 0.0) for d in detail if str(d.get("feeCoin") or "").upper() == margin_coin)
    return Fill(
        id=str(row["tradeId"]),
        order_id=str(row["orderId"]) if row.get("orderId") is not None else None,
        symbol=str(row.get("symbol") or "").upper(),
        side=str(row.get("side") or "").lower(),
        trade_side=str(row.get("tradeSide") or "").strip().lower(),
        price=float(row["price"]),
        size=float(row.get("baseVolume") or row.get("size")),
        ts=int(row["cTime"]),
        fee=fee,
        profit=_f(row.get("profit")),
        pos_mode=str(row["posMode"]) if row.get("posMode") is not None else None,
    )


def fill_from_fce(payload: dict) -> Fill:
    """FCE `user_account_fills.payload` (= `BitgetAccountFill` JSON)."""
    return Fill(
        id=str(payload["trade_id"]),
        order_id=str(payload["order_id"]) if payload.get("order_id") is not None else None,
        symbol=str(payload.get("symbol") or "").upper(),
        side=str(payload.get("side") or "").lower(),
        trade_side=str(payload.get("trade_side") or "").strip().lower(),
        price=float(payload["price"]),
        size=float(payload["size"]),
        ts=parse_iso_ms(payload["timestamp"]),
        fee=float(payload.get("fee_usdt") or 0.0),
        profit=_f(payload.get("profit")),
        pos_mode=payload.get("position_mode"),
    )


def fill_action(fill: Fill, open_qty: dict[tuple[str, str], float]) -> tuple[str, str] | None:
    """(open|close, long|short). FCE `_fill_action` 그대로."""
    ts = fill.trade_side
    if ts == "open":
        return "open", "long" if fill.side == "buy" else "short"
    if ts == "close":
        # 헤지 모드: side 가 포지션 쪽을 가리킨다 (open buy → close buy 가 롱 한 바퀴).
        return "close", "long" if fill.side == "buy" else "short"
    if "close_long" in ts or ts in {"reduce_sell_single", "burst_sell_single", "delivery_sell_single"}:
        return "close", "long"
    if "close_short" in ts or ts in {"reduce_buy_single", "burst_buy_single", "delivery_buy_single"}:
        return "close", "short"
    if ts in {"buy_single", "sell_single"}:
        closing = "short" if fill.side == "buy" else "long"
        if open_qty.get((fill.symbol, closing), 0.0) > EPS:
            return "close", closing
        return "open", "long" if fill.side == "buy" else "short"
    if ts.startswith(("reduce_", "burst_", "delivery_", "dte_sys_adl_")):
        return "close", "long" if fill.side == "sell" else "short"
    if fill.profit is not None and abs(fill.profit) > EPS:
        return "close", "long" if fill.side == "sell" else "short"
    return None


# ── 청산 방식 ───────────────────────────────────────────────────────────

EXIT_METHODS = ("stop_loss", "take_profit", "limit", "market", "liquidation", "unknown")
EXIT_LABEL = {
    "stop_loss": "손절 주문",
    "take_profit": "익절 주문",
    "limit": "지정가",
    "market": "시장가",
    "liquidation": "강제청산",
    "unknown": "모름(주문 기록 없음)",
}


def exit_method(order: dict | None, trade_side: str) -> str:
    """주문 기록의 `orderSource` · `orderType` 으로 청산 방식을 가른다.

    Bitget `orderSource`: normal · market · profit_market · loss_market · pos_profit_* · pos_loss_* · tp_* ·
    burst_* … 이름에 loss/profit/burst 가 들어가는지로 본다(값 목록이 늘어도 버틴다).
    """
    ts = trade_side or ""
    source = str((order or {}).get("orderSource") or "").lower()
    if ts.startswith(("burst_", "dte_sys_adl_")) or "burst" in source or "liquidat" in source:
        return "liquidation"
    if order is None:
        return "unknown"
    if "loss" in source:
        return "stop_loss"
    if "profit" in source or source.startswith("tp"):
        return "take_profit"
    order_type = str(order.get("orderType") or "").lower()
    if order_type == "limit":
        return "limit"
    if order_type == "market":
        return "market"
    return "unknown"


# ── 묶기 ────────────────────────────────────────────────────────────────


@dataclass
class _Cycle:
    symbol: str
    direction: str
    entry_ts: int
    qty: float = 0.0
    cost: float = 0.0
    max_qty: float = 0.0
    avg_at_max: float = 0.0
    entry_fills: list[str] = field(default_factory=list)
    exit_fills: list[str] = field(default_factory=list)
    entry_legs: dict[str, dict] = field(default_factory=dict)
    exit_legs: dict[str, dict] = field(default_factory=dict)
    fees: float = 0.0
    profit: float = 0.0
    profit_seen: bool = False
    gross: float = 0.0
    closed_qty: float = 0.0
    closed_entry_notional: float = 0.0
    exit_notional: float = 0.0
    last_ts: int = 0


def _leg(legs: dict[str, dict], key: str, ts: int, price: float, qty: float) -> dict:
    leg = legs.get(key)
    if leg is None:
        leg = {"order_id": key, "at": ts, "qty": 0.0, "notional": 0.0, "fills": 0}
        legs[key] = leg
    leg["qty"] += qty
    leg["notional"] += price * qty
    leg["fills"] += 1
    leg["last_at"] = ts
    return leg


def _open(states: dict, fill: Fill, direction: str, qty: float, fee: float) -> None:
    if qty <= EPS:
        return
    key = (fill.symbol, direction)
    cyc = states.get(key)
    if cyc is None:
        cyc = _Cycle(symbol=fill.symbol, direction=direction, entry_ts=fill.ts)
        states[key] = cyc
    cyc.qty += qty
    cyc.cost += fill.price * qty
    cyc.fees += fee
    cyc.entry_fills.append(fill.id)
    cyc.last_ts = fill.ts
    _leg(cyc.entry_legs, fill.order_id or f"fill:{fill.id}", fill.ts, fill.price, qty)
    if cyc.qty > cyc.max_qty + EPS:
        cyc.max_qty = cyc.qty
        cyc.avg_at_max = cyc.cost / cyc.qty


def _close(states: dict, fill: Fill, direction: str, qty: float, fee: float, orders: dict[str, dict]):
    """닫힌 거래(dict) · 아직 열림(False) · 짝 없음(None) 과 남은 물량."""
    key = (fill.symbol, direction)
    cyc = states.get(key)
    if cyc is None or cyc.qty <= EPS:
        return None, qty
    close_qty = min(cyc.qty, qty)
    ratio = close_qty / qty if qty > 0 else 0.0
    avg_entry = cyc.cost / cyc.qty
    sign = 1.0 if direction == "long" else -1.0
    entry_notional = avg_entry * close_qty
    gross = (fill.price - avg_entry) * close_qty * sign
    cyc.closed_qty += close_qty
    cyc.closed_entry_notional += entry_notional
    cyc.exit_notional += fill.price * close_qty
    cyc.gross += gross
    cyc.fees += fee * ratio
    if fill.profit is not None:
        cyc.profit += fill.profit * ratio
        cyc.profit_seen = True
    else:
        cyc.profit += gross
    cyc.exit_fills.append(fill.id)
    cyc.last_ts = fill.ts
    leg = _leg(cyc.exit_legs, fill.order_id or f"fill:{fill.id}", fill.ts, fill.price, close_qty)
    leg.setdefault("avg_entry_notional", 0.0)
    leg["avg_entry_notional"] += entry_notional
    leg["pnl"] = leg.get("pnl", 0.0) + (fill.profit * ratio if fill.profit is not None else gross)
    leg["trade_side"] = fill.trade_side
    cyc.qty -= close_qty
    cyc.cost = max(0.0, cyc.cost - entry_notional)
    remainder = max(0.0, qty - close_qty)
    if cyc.qty > EPS:
        return False, remainder
    states.pop(key, None)
    return _finish(cyc, orders), remainder


def _finish(cyc: _Cycle, orders: dict[str, dict]) -> dict:
    sign = 1.0 if cyc.direction == "long" else -1.0
    avg_entry = cyc.closed_entry_notional / cyc.closed_qty
    avg_exit = cyc.exit_notional / cyc.closed_qty
    entries = []
    for leg in cyc.entry_legs.values():
        entries.append(
            {
                "order_id": None if leg["order_id"].startswith("fill:") else leg["order_id"],
                "at": iso(leg["at"]),
                "price": leg["notional"] / leg["qty"],
                "qty": leg["qty"],
                "qty_pct": leg["qty"] / cyc.max_qty * 100 if cyc.max_qty > 0 else None,
                "fills": leg["fills"],
            }
        )
    exits = []
    for leg in cyc.exit_legs.values():
        order = orders.get(leg["order_id"])
        price = leg["notional"] / leg["qty"]
        leg_entry = leg["avg_entry_notional"] / leg["qty"]
        exits.append(
            {
                "order_id": None if leg["order_id"].startswith("fill:") else leg["order_id"],
                "at": iso(leg["last_at"]),
                "price": price,
                "qty": leg["qty"],
                "qty_pct": leg["qty"] / cyc.closed_qty * 100,
                "return_pct": (price / leg_entry - 1) * 100 * sign,
                "pnl": leg["pnl"],
                "method": exit_method(order, leg.get("trade_side", "")),
                "fills": leg["fills"],
            }
        )
    first_order = next(iter(cyc.entry_legs))
    leverage = _f((orders.get(first_order) or {}).get("leverage"))
    notional = cyc.max_qty * cyc.avg_at_max
    trade_id = uuid5(NAMESPACE_URL, f"fomo:trader01:{cyc.symbol}:{cyc.direction}:{cyc.entry_fills[0]}:{cyc.exit_fills[-1]}")
    return {
        "id": str(trade_id),
        "symbol": cyc.symbol,
        "direction": cyc.direction,
        "entry_ms": cyc.entry_ts,
        "exit_ms": cyc.last_ts,
        "entry_at": iso(cyc.entry_ts),
        "exit_at": iso(cyc.last_ts),
        "avg_entry": avg_entry,
        "avg_exit": avg_exit,
        "entry_fills": len(cyc.entry_fills),
        "exit_fills": len(cyc.exit_fills),
        "entry_orders": len(cyc.entry_legs),
        "exit_orders": len(cyc.exit_legs),
        "split_entry": len(cyc.entry_legs) > 1,
        "split_exit": len(cyc.exit_legs) > 1,
        "max_qty": cyc.max_qty,
        "closed_qty": cyc.closed_qty,
        "notional_usdt": notional,
        "leverage": leverage,
        "margin_usdt": notional / leverage if leverage else None,
        "realized_pnl": cyc.profit,
        "realized_source": "exchange_profit" if cyc.profit_seen else "computed",
        "gross_pnl_calc": cyc.gross,
        "fees": cyc.fees,
        "funding": 0.0,
        "net_pnl": cyc.profit - cyc.fees,
        "return_pct": (avg_exit / avg_entry - 1) * 100 * sign,
        "hold_minutes": (cyc.last_ts - cyc.entry_ts) / 60_000,
        "exit_method": exits[-1]["method"] if exits else "unknown",
        "legs": {"entries": entries, "exits": exits},
        "fill_ids": {"entry": list(cyc.entry_fills), "exit": list(cyc.exit_fills)},
    }


def build_trades(fills: list[Fill], orders: dict[str, dict] | None = None) -> tuple[list[dict], dict]:
    orders = orders or {}
    states: dict[tuple[str, str], _Cycle] = {}
    trades: list[dict] = []
    unmatched: list[dict] = []
    ignored = 0
    seen: set[str] = set()

    def open_qty() -> dict[tuple[str, str], float]:
        return {k: v.qty for k, v in states.items()}

    for fill in sorted(fills, key=lambda f: (f.ts, _id_order(f.id))):
        if fill.id in seen:
            continue
        seen.add(fill.id)
        action = fill_action(fill, open_qty())
        if action is None:
            ignored += 1
            continue
        kind, direction = action
        if kind == "open":
            _open(states, fill, direction, fill.size, fill.fee)
            continue
        closed, remainder = _close(states, fill, direction, fill.size, fill.fee, orders)
        if closed is None:
            unmatched.append({"id": fill.id, "symbol": fill.symbol, "at": iso(fill.ts), "profit": fill.profit, "ts": fill.ts})
        elif isinstance(closed, dict):
            trades.append(closed)
        if remainder > EPS and fill.trade_side in {"buy_single", "sell_single"} and closed is not None:
            # 원웨이 모드에서 한 체결이 닫고 반대로 연다(flip).
            opposite = "long" if fill.side == "buy" else "short"
            _open(states, fill, opposite, remainder, fill.fee * (remainder / fill.size if fill.size else 0))

    open_positions = [
        {
            "symbol": c.symbol,
            "direction": c.direction,
            "qty": c.qty,
            "entry_at": iso(c.entry_ts),
            "realized_so_far": c.profit,
        }
        for c in states.values()
        if c.qty > EPS
    ]
    trades.sort(key=lambda t: t["exit_ms"])
    return trades, {
        "closed": len(trades),
        "open_positions": open_positions,
        "unmatched_close_fills": unmatched,
        "ignored_fills": ignored,
    }


def attach_funding(trades: list[dict], funding: list[dict]) -> list[dict]:
    """펀딩 장부(symbol · ts · amount)를 그 시각에 열려 있던 거래에 붙인다. 못 붙인 건 돌려준다.

    헤지 모드로 같은 종목 롱·숏이 동시에 열려 있으면 반씩 나눈다(거래소가 쪽을 안 알려준다).
    """
    loose: list[dict] = []
    by_symbol: dict[str, list[dict]] = {}
    for t in trades:
        by_symbol.setdefault(t["symbol"], []).append(t)
    for item in funding:
        hits = [t for t in by_symbol.get(item["symbol"], []) if t["entry_ms"] <= item["ts"] <= t["exit_ms"]]
        if not hits:
            loose.append(item)
            continue
        share = item["amount"] / len(hits)
        for t in hits:
            t["funding"] += share
    for t in trades:
        t["net_pnl"] = t["realized_pnl"] - t["fees"] + t["funding"]
    return loose


def _id_order(value: str) -> tuple[int, Any]:
    try:
        return 0, int(value)
    except (TypeError, ValueError):
        return 1, value
