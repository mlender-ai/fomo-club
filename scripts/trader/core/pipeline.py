"""TRADER-01 단계: 수집(A) → 시장(C 재료) → 묶기·붙이기(B·C) → 지표·대조(D·E).

각 단계는 저장소만 보고 다시 돌 수 있다(중간에 끊겨도 처음부터 안 받아도 된다).
"""
from __future__ import annotations

import json
import sqlite3
import time
from statistics import median
from typing import Any

from . import account, market
from .bitget import Bitget, BitgetError, judge_authorities
from .fce import WhaleBook, derivs_at, patterns_at, user_fill_sync_state, user_fills
from .store import Store
from .timeutil import DAY_MS, HOUR_MS, iso, local_day, windows
from .trades import EXIT_LABEL, Fill, attach_funding, build_trades, fill_action, fill_from_api, fill_from_fce

WINDOW_MS = 7 * DAY_MS  # 거래소 조회 한 번의 구간(체결·장부 모두 이 안쪽이면 안전)
EXCHANGE_RETENTION_DAYS = 90
TARGET_DAYS = 180


def now_ms() -> int:
    return int(time.time() * 1000)


# ── 0 키 확인 ───────────────────────────────────────────────────────────


def check_key(store: Store, bg: Bitget) -> dict:
    try:
        info = bg.account_info()
    except BitgetError as exc:
        if exc.code == "not_configured":
            raise
        # 권한 조회 자체가 막힌 키(현물 조회 꺼짐 등). 판정 못 함 — 사람이 화면에서 본다.
        verdict = {"authorities": [], "write_like": [], "unknown": [], "read_only": False, "error": str(exc), "checked_at": iso(now_ms())}
        store.set_meta("key_check", json.dumps(verdict))
        return verdict
    verdict = judge_authorities(info.get("authorities") or [])
    verdict["ip_bound"] = bool(info.get("ips"))
    verdict["checked_at"] = iso(now_ms())
    store.set_meta("key_check", json.dumps(verdict))
    return verdict


def attest_readonly(store: Store) -> dict:
    """🧑 광혁이 거래소 API 관리 화면에서 '읽기만' 을 눈으로 확인했다는 기록."""
    prev = json.loads(store.meta("key_check") or "null") or {}
    if prev.get("write_like"):
        raise ValueError(f"기계 판정이 쓰기 권한을 봤다({prev['write_like']}) — 키를 바꾸기 전엔 확인으로 덮지 않는다")
    verdict = {**prev, "read_only": True, "attested": True, "attested_at": iso(now_ms())}
    store.set_meta("key_check", json.dumps(verdict))
    return verdict


# ── A 수집 ──────────────────────────────────────────────────────────────


def collect(store: Store, bg: Bitget | None, fce_conn: sqlite3.Connection | None, days: int = TARGET_DAYS, now: int | None = None) -> dict:
    now = now or now_ms()
    summary: dict[str, Any] = {}
    if fce_conn is not None:
        payloads = user_fills(fce_conn)
        added = store.put_fills([(str(p["trade_id"]), "fce", str(p.get("symbol") or ""), fill_from_fce(p).ts, p) for p in payloads])
        summary["fce_fills"] = {"rows": len(payloads), "new": added, "sync_state": (user_fill_sync_state(fce_conn) or {}).get("status")}
    if bg is None or not bg.private_ready:
        summary["bitget"] = "조회 키 없음 — FCE 사본만 썼다"
        return summary
    start = now - days * DAY_MS
    # 거래소 보관 경계(90일)를 걸치는 구간은 통째로 거절된다 — 경계에서 한 번 끊는다.
    boundary = now - (EXCHANGE_RETENTION_DAYS - 1) * DAY_MS
    spans = windows(start, now, WINDOW_MS) if start >= boundary else windows(start, boundary, WINDOW_MS) + windows(boundary, now, WINDOW_MS)
    jobs = (
        ("fills", bg.fills),
        ("orders", bg.orders),
        ("positions", bg.positions),
        ("bills", bg.bills),
    )
    for kind, fn in jobs:
        got = errors = 0
        for w0, w1 in spans:
            try:
                rows = fn(w0, w1)
            except BitgetError as exc:
                if exc.code == "not_configured":
                    raise
                errors += 1
                note = "거래소 보관 기간 밖 추정" if w0 < boundary else "조회 실패"
                store.log_fetch(kind, w0, w1, "error", 0, f"{note}: {exc}")
                continue
            _store_rows(store, kind, rows)
            store.log_fetch(kind, w0, w1, "ok", len(rows))
            got += len(rows)
        summary[kind] = {"rows": got, "failed_windows": errors}
    store.set_meta("collected_at", str(now))
    store.set_meta("collect_days", str(days))
    return summary


def _store_rows(store: Store, kind: str, rows: list[dict]) -> None:
    if not rows:
        return
    if kind == "fills":
        store.put_fills([(str(r["tradeId"]), "bitget", str(r.get("symbol") or "").upper(), int(r["cTime"]), r) for r in rows])
    elif kind == "orders":
        store.put("raw_orders", [(str(r["orderId"]), str(r.get("symbol") or "").upper(), int(r.get("cTime") or 0), r) for r in rows])
    elif kind == "positions":
        store.put(
            "raw_positions",
            [(str(r.get("positionId") or f"{r.get('symbol')}:{r.get('ctime')}"), str(r.get("symbol") or "").upper(), int(r.get("utime") or r.get("ctime") or 0), r) for r in rows],
        )
    elif kind == "bills":
        store.put("raw_bills", [(str(r["billId"]), int(r["cTime"]), str(r.get("businessType") or ""), r) for r in rows])


# ── 읽어 오기 ───────────────────────────────────────────────────────────


def load_fills(store: Store) -> list[Fill]:
    out = []
    for source, payload in store.fill_rows():
        out.append(fill_from_api(payload) if source == "bitget" else fill_from_fce(payload))
    return out


def load_orders(store: Store) -> dict[str, dict]:
    return {str(p["orderId"]): p for p in store.payloads("raw_orders")}


def load_bills(store: Store) -> list[dict]:
    """USDT 장부만 — 다른 코인 줄이 섞이면 잔고 · 손익이 틀어진다."""
    bills = [account.normalize_bill(p) for p in store.payloads("raw_bills")]
    return [b for b in bills if b["coin"] in ("USDT", "")]


def assemble(store: Store) -> tuple[list[dict], dict, list[dict], list[Fill]]:
    fills = load_fills(store)
    trades, diag = build_trades(fills, load_orders(store))
    bills = load_bills(store)
    funding = [{"symbol": b["symbol"], "ts": b["ts"], "amount": b["amount"] + b["fee"]} for b in bills if b["kind"] == "funding"]
    diag["funding_unattributed"] = sum(x["amount"] for x in attach_funding(trades, funding))
    return trades, diag, bills, fills


# ── C 시장 재료 ─────────────────────────────────────────────────────────


def _bitget_rows(rows: list[list]) -> list[tuple]:
    return sorted((int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])) for r in rows)


def fetch_range(store: Store, bg: Bitget, symbol: str, tf: str, start: int, end: int, now: int, fallback: bool = True) -> str:
    span = market.TF_MS[tf]
    end = min(end, now)
    have = store.candles(symbol, tf, start, end)
    expected = max(1, (end - start) // span)
    if len(have) >= expected * 0.98:
        return "cached"
    got: list[tuple] = []
    cursor: int | None = end
    for _ in range(400):
        try:
            page = _bitget_rows(bg.candles(symbol, tf, cursor))
        except BitgetError as exc:
            store.log_fetch(f"candles:{symbol}:{tf}", start, end, "error", 0, str(exc))
            break
        if not page:
            break
        got.extend(page)
        oldest = page[0][0]
        if oldest <= start or (cursor is not None and oldest >= cursor):
            break
        cursor = oldest
    closed = [c for c in got if c[0] + span <= now and c[0] >= start - span]
    store.put_candles(symbol, tf, closed, "bitget")
    oldest = min((c[0] for c in closed), default=end)
    if fallback and oldest > start + span:
        try:
            from . import binance

            extra = [c for c in binance.klines(symbol, tf, start, oldest) if c[0] + span <= now]
            store.put_candles(symbol, tf, extra, "binance")
            store.log_fetch(f"candles:{symbol}:{tf}", start, oldest, "ok", len(extra), "binance 예비")
            return "bitget+binance"
        except Exception as exc:  # 예비는 실패해도 멈추지 않는다 — 빈칸으로 남는다
            store.log_fetch(f"candles:{symbol}:{tf}", start, oldest, "error", 0, f"binance: {exc}")
    return "bitget"


def fetch_market(store: Store, bg: Bitget, trades: list[dict], now: int | None = None) -> dict:
    now = now or now_ms()
    if not trades:
        return {"symbols": 0}
    first = min(t["entry_ms"] for t in trades)
    last = max(t["exit_ms"] for t in trades)
    symbols = sorted({t["symbol"] for t in trades} | {"BTCUSDT"})
    for symbol in symbols:
        for tf in market.CONTEXT_TFS:
            warmup = (max(market.MA_LENGTHS) + 10) * market.TF_MS[tf]
            fetch_range(store, bg, symbol, tf, first - warmup, last + 8 * DAY_MS, now)
        _fetch_funding(store, bg, symbol, first - DAY_MS)
    for t in trades:
        g = market.pick_granularity(t["exit_ms"] - t["entry_ms"])
        fetch_range(store, bg, t["symbol"], g, t["entry_ms"] - market.TF_MS[g], t["exit_ms"] + market.TF_MS[g], now)
    return {"symbols": len(symbols), "trades": len(trades)}


def _fetch_funding(store: Store, bg: Bitget, symbol: str, since: int) -> None:
    have = store.funding(symbol)
    if have and have[0][0] <= since:
        return
    rows: list[tuple[int, float]] = []
    for page in range(1, 60):
        try:
            batch = bg.funding_history(symbol, page)
        except BitgetError as exc:
            store.log_fetch(f"funding:{symbol}", since, 0, "error", 0, str(exc))
            break
        if not batch:
            break
        rows.extend((int(r["fundingTime"]), float(r["fundingRate"])) for r in batch if r.get("fundingTime") is not None)
        if min(int(r["fundingTime"]) for r in batch) <= since:
            break
    store.put_funding(symbol, rows)


# ── B·C 묶기 · 붙이기 ──────────────────────────────────────────────────


def build(store: Store, fce_conn: sqlite3.Connection | None, now: int | None = None) -> dict:
    now = now or now_ms()
    trades, diag, _, _ = assemble(store)
    store.replace_trades(trades)
    by_symbol: dict[str, dict[str, list]] = {}
    whales: dict[str, WhaleBook] = {}
    btc = {tf: store.candles("BTCUSDT", tf) for tf in market.CONTEXT_TFS}
    for t in trades:
        sym = t["symbol"]
        if sym not in by_symbol:
            by_symbol[sym] = {tf: store.candles(sym, tf) for tf in market.CONTEXT_TFS}
            if fce_conn is not None:
                whales[sym] = WhaleBook.load(fce_conn, sym)
        store.put_context(t["id"], trade_context(t, by_symbol[sym], btc, store.funding(sym), store, fce_conn, whales.get(sym), now))
    store.set_meta("built_at", str(now))
    return {"trades": len(trades), **{k: v for k, v in diag.items() if k != "unmatched_close_fills"}, "unmatched_close_fills": len(diag["unmatched_close_fills"])}


def _fce_side(fce_conn: sqlite3.Connection | None, book: WhaleBook | None, symbol: str, t_ms: int) -> dict:
    if fce_conn is None:
        return {"whales": None, "patterns": None, "derivs": None, "fce": "없음"}
    return {
        "whales": book.at(t_ms) if book else None,
        "patterns": patterns_at(fce_conn, symbol, t_ms) or None,
        "derivs": derivs_at(fce_conn, symbol, t_ms),
    }


def trade_context(t: dict, candles: dict[str, list], btc: dict[str, list], funding: list, store: Store, fce_conn, book, now: int) -> dict:
    entry, exit_ = t["entry_ms"], t["exit_ms"]
    g = market.pick_granularity(exit_ - entry)
    fine = store.candles(t["symbol"], g, entry - market.TF_MS[g], exit_ + market.TF_MS[g])
    at_entry = market.snapshot(candles, entry, t["avg_entry"])
    at_exit = market.snapshot(candles, exit_, t["avg_exit"])
    before_exit = market.snapshot(candles, exit_ - 4 * HOUR_MS, t["avg_exit"])
    return {
        "entry": {
            "market": at_entry,
            "btc": market.btc_trend(btc, entry),
            "funding_rate": market.funding_at(funding, entry),
            "session": market.session(entry),
            **_fce_side(fce_conn, book, t["symbol"], entry),
        },
        "hold": market.excursion(fine, g, entry, exit_, t["avg_entry"], t["direction"], t["return_pct"]),
        "exit": {
            "market": at_exit,
            "btc": market.btc_trend(btc, exit_),
            "funding_rate": market.funding_at(funding, exit_),
            "session": market.session(exit_),
            "changed_since_entry": market.flips(at_entry, at_exit),
            "changed_last_4h": market.flips(before_exit, at_exit),
            **_fce_side(fce_conn, book, t["symbol"], exit_),
        },
        "after": market.after_exit(candles.get("1H") or [], exit_, t["avg_exit"], t["direction"], now),
    }


# ── D·E 지표 · 대조 ─────────────────────────────────────────────────────


def compute_report(store: Store, now: int | None = None, app_30d: float | None = None, repo_root: str | None = None) -> dict:
    now = now or now_ms()
    trades, diag, bills, fills = assemble(store)
    contexts = {tid: json.loads(p) for tid, p in store.conn.execute("SELECT trade_id, payload FROM trade_context").fetchall()}
    fill_ms = [f.ts for f in fills]
    close_ms = _close_fill_ms(fills)
    span_days = ((max(fill_ms) - min(fill_ms)) / DAY_MS) if fill_ms else 0.0
    metrics = account.account_metrics(trades, bills, span_days)
    months = account.monthly(trades, bills, (metrics["twr"] or {}).get("daily_index"))
    recon = account.reconcile(trades, diag["unmatched_close_fills"], bills, ledger_from_ms=_ledger_from(store))
    coverage = account.coverage(fill_ms, close_ms, bills, store.fetch_errors(), ledger_from_ms=_ledger_from(store))
    sources = {r[0]: r[1] for r in store.conn.execute("SELECT source, COUNT(*) FROM raw_fills GROUP BY source").fetchall()}
    key = json.loads(store.meta("key_check") or "null")
    return {
        "at": now,
        "period": {"first_fill": iso(coverage["first_fill"]), "last_fill": iso(coverage["last_fill"]), "days": span_days},
        "sources": {"fills": sources, "orders": store.count("raw_orders"), "positions": store.count("raw_positions"), "bills": len(bills)},
        "trades": len(trades),
        "open_positions": diag["open_positions"],
        "unmatched_close_fills": len(diag["unmatched_close_fills"]),
        "funding_unattributed": diag["funding_unattributed"],
        "metrics": metrics,
        "monthly": months,
        "reconcile": recon,
        "thirty_day": account.thirty_day(bills, now, app_30d),
        "coverage": coverage,
        "ledger_check": account.ledger_consistency(bills),
        "structure": structure_summary(trades, contexts),
        "key_check": key,
        "checks": completion(key, store, span_days, trades, contexts, metrics, recon, repo_root),
    }


def _ledger_from(store: Store) -> int | None:
    """장부를 성공적으로 받은 첫 구간의 시작. 거래가 없던 날도 '덮었다' 로 친다."""
    row = store.conn.execute("SELECT MIN(start_ms) FROM fetch_log WHERE kind = 'bills' AND status = 'ok'").fetchone()
    return int(row[0]) if row and row[0] is not None else None


def _close_fill_ms(fills: list[Fill]) -> list[int]:
    """청산 체결 시각 — 어느 쪽이 열려 있었는지 따라가며 판정한다(원웨이 모드 때문)."""
    open_qty: dict[tuple[str, str], float] = {}
    out = []
    for f in sorted(fills, key=lambda x: x.ts):
        action = fill_action(f, open_qty)
        if action is None:
            continue
        kind, direction = action
        key = (f.symbol, direction)
        if kind == "open":
            open_qty[key] = open_qty.get(key, 0.0) + f.size
        else:
            out.append(f.ts)
            open_qty[key] = max(0.0, open_qty.get(key, 0.0) - f.size)
    return out


def structure_summary(trades: list[dict], contexts: dict[str, dict]) -> dict:
    """TRADER-02 로 넘길 모양만 — 판단은 하지 않는다."""
    methods: dict[str, int] = {}
    for t in trades:
        methods[EXIT_LABEL[t["exit_method"]]] = methods.get(EXIT_LABEL[t["exit_method"]], 0) + 1
    holds = [contexts.get(t["id"], {}).get("hold", {}) for t in trades]
    mfe = [h["mfe_pct"] for h in holds if h.get("mfe_pct") is not None]
    mae = [h["mae_pct"] for h in holds if h.get("mae_pct") is not None]
    cap = [h["capture"] for h in holds if h.get("capture") is not None]
    with_ctx = sum(1 for t in trades if (contexts.get(t["id"], {}).get("entry", {}).get("market", {}).get("1H", {}).get("vs_ma20_pct")) is not None)
    after_due = [t for t in trades if contexts.get(t["id"], {}).get("after", {}).get("after_24h_pct") is not None]
    return {
        "split_entry": sum(1 for t in trades if t["split_entry"]),
        "split_exit": sum(1 for t in trades if t["split_exit"]),
        "exit_methods": methods,
        "leverage_known": sum(1 for t in trades if t["leverage"]),
        "with_entry_context": with_ctx,
        "with_mfe": len(mfe),
        "with_after_24h": len(after_due),
        "with_whales": sum(1 for t in trades if contexts.get(t["id"], {}).get("entry", {}).get("whales")),
        "with_patterns": sum(1 for t in trades if contexts.get(t["id"], {}).get("entry", {}).get("patterns")),
        "with_oi": sum(1 for t in trades if contexts.get(t["id"], {}).get("entry", {}).get("derivs")),
        "mfe_median": median(mfe) if mfe else None,
        "mae_median": median(mae) if mae else None,
        "capture_median": median(cap) if cap else None,
        "hold_median_min": median([t["hold_minutes"] for t in trades]) if trades else None,
    }


def completion(key, store: Store, span_days: float, trades, contexts, metrics, recon, repo_root) -> list[dict]:
    n = len(trades)
    s = structure_summary(trades, contexts)
    in_repo = _repo_has_trade_data(repo_root)
    return [
        {"no": 1, "item": "조회 전용 키 · 출금 권한 없음", "ok": bool(key and key.get("read_only")), "detail": _key_detail(key)},
        {"no": 2, "item": "거래 데이터가 레포에 없다", "ok": not in_repo, "detail": f"저장 위치 {store.dir} (git 밖)" + (f" · 레포에 의심 파일: {in_repo}" if in_repo else "")},
        {"no": 3, "item": "180일 이상 거래가 거래 단위로 묶였다", "ok": span_days >= TARGET_DAYS and n > 0, "detail": f"{span_days:.0f}일 · {n}건"},
        {"no": 4, "item": "분할 진입·청산이 살아 있다", "ok": n > 0 and all(t["legs"]["exits"] for t in trades), "detail": f"주문 단위 다리 기록 {sum(1 for t in trades if t['legs']['exits'])}/{n}건 (분할 횟수는 TRADER-02 진술 봉인 뒤에 본다)"},
        {
            "no": 5,
            "item": "진입·보유(MFE·MAE)·청산·청산 후 상태",
            "ok": n > 0 and s["with_entry_context"] == n and s["with_mfe"] == n,
            "detail": f"진입 {s['with_entry_context']}/{n} · MFE {s['with_mfe']}/{n} · 청산 후 24h {s['with_after_24h']}/{n} · 고래 {s['with_whales']}/{n} · 패턴 {s['with_patterns']}/{n} · OI {s['with_oi']}/{n}",
        },
        {"no": 6, "item": "입출금 보정 시간가중수익률", "ok": metrics["twr"].get("status") == "ok", "detail": metrics["twr"].get("status")},
        {"no": 7, "item": "재구성 손익 = 거래소 손익 (±1%)", "ok": recon.get("status") == "ok", "detail": recon.get("status")},
    ]


def _key_detail(key: dict | None) -> str:
    if not key:
        return "아직 확인 안 함 — `trader01.py check-key`"
    bits = []
    if key.get("attested"):
        bits.append(f"광혁 화면 확인 {key.get('attested_at', '')[:10]}")
    if key.get("error"):
        bits.append(f"권한 조회 실패: {key['error']}")
    if key.get("write_like"):
        bits.append(f"쓰기 권한으로 보임: {', '.join(key['write_like'])}")
    if key.get("unknown"):
        bits.append(f"모르는 권한: {', '.join(key['unknown'])} — 거래소 화면에서 확인")
    bits.append("IP 묶임" if key.get("ip_bound") else "IP 묶임 없음")
    return " · ".join(bits)


def _repo_has_trade_data(repo_root: str | None) -> list[str]:
    if not repo_root:
        return []
    import subprocess

    try:
        files = subprocess.run(["git", "-C", repo_root, "ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
    except (OSError, subprocess.CalledProcessError):
        return []
    return [f for f in files if f.endswith("trader.db") or "TRADER-01-report" in f]


def day_label(ms: int | None) -> str:
    return local_day(ms) if ms else "-"
