"""수집 → 시장 → 묶기 → 보고 한 바퀴. 가짜 거래소 · 가짜 FCE DB (합성 데이터)."""
from __future__ import annotations

import json
import math
import sqlite3
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import pipeline  # noqa: E402
from core.bitget import Bitget  # noqa: E402
from core.fce import connect_ro, iso  # noqa: E402
from core.market import TF_MS  # noqa: E402
from core.report import render  # noqa: E402
from core.store import Store  # noqa: E402

DAY = 86_400_000
H = 3_600_000
NOW = 1_790_000_000_000
OLD = NOW - 120 * DAY  # 거래소 보관(90일) 밖 — FCE 사본에만 있다
NEW = NOW - 20 * DAY


def price(symbol: str, t: int) -> float:
    base = 100.0 if symbol == "ETHUSDT" else 60_000.0
    return base * (1 + 0.05 * math.sin(t / (3 * DAY)))


class FakeBitget:
    """Bitget v2 응답 모양만 흉내 낸다. 90일보다 오래된 계좌 조회는 거부한다."""

    def __init__(self):
        self.fills = [
            {"tradeId": "11", "orderId": "A", "symbol": "ETHUSDT", "side": "buy", "tradeSide": "open", "price": "100", "baseVolume": "2",
             "profit": "0", "feeDetail": [{"feeCoin": "USDT", "totalFee": "-0.2"}], "cTime": str(NEW), "posMode": "hedge_mode"},
            {"tradeId": "12", "orderId": "B", "symbol": "ETHUSDT", "side": "buy", "tradeSide": "close", "price": "104", "baseVolume": "1",
             "profit": "4", "feeDetail": [{"feeCoin": "USDT", "totalFee": "-0.1"}], "cTime": str(NEW + 5 * H), "posMode": "hedge_mode"},
            {"tradeId": "13", "orderId": "C", "symbol": "ETHUSDT", "side": "buy", "tradeSide": "close", "price": "110", "baseVolume": "1",
             "profit": "10", "feeDetail": [{"feeCoin": "USDT", "totalFee": "-0.1"}], "cTime": str(NEW + 30 * H), "posMode": "hedge_mode"},
        ]
        self.orders = [
            {"orderId": "A", "symbol": "ETHUSDT", "orderType": "limit", "orderSource": "normal", "leverage": "5", "cTime": str(NEW)},
            {"orderId": "B", "symbol": "ETHUSDT", "orderType": "limit", "orderSource": "normal", "leverage": "5", "cTime": str(NEW + 5 * H)},
            {"orderId": "C", "symbol": "ETHUSDT", "orderType": "market", "orderSource": "loss_market", "leverage": "5", "cTime": str(NEW + 30 * H)},
        ]
        self.bills = [
            {"billId": "b1", "symbol": "", "amount": "1000", "fee": "0", "businessType": "trans_from_exchange", "coin": "USDT", "balance": "1000", "cTime": str(NEW - DAY)},
            {"billId": "b2", "symbol": "ETHUSDT", "amount": "0", "fee": "-0.2", "businessType": "open_long", "coin": "USDT", "balance": "999.8", "cTime": str(NEW)},
            {"billId": "b3", "symbol": "ETHUSDT", "amount": "-0.3", "fee": "0", "businessType": "contract_settle_fee", "coin": "USDT", "balance": "999.5", "cTime": str(NEW + 3 * H)},
            {"billId": "b4", "symbol": "ETHUSDT", "amount": "4", "fee": "-0.1", "businessType": "close_long", "coin": "USDT", "balance": "1003.4", "cTime": str(NEW + 5 * H)},
            {"billId": "b5", "symbol": "ETHUSDT", "amount": "10", "fee": "-0.1", "businessType": "close_long", "coin": "USDT", "balance": "1013.3", "cTime": str(NEW + 30 * H)},
            {"billId": "b6", "symbol": "", "amount": "-500", "fee": "0", "businessType": "trans_to_exchange", "coin": "USDT", "balance": "513.3", "cTime": str(NEW + 2 * DAY)},
        ]
        self.calls: list[str] = []

    def __call__(self, url: str, headers: dict) -> dict:
        parsed = urllib.parse.urlparse(url)
        q = dict(urllib.parse.parse_qsl(parsed.query))
        path = parsed.path
        self.calls.append(path)
        private = "ACCESS-SIGN" in headers
        if path == "/api/v2/spot/account/info":
            return {"code": "00000", "data": {"authorities": ["readonly"], "ips": "1.2.3.4"}}
        if private and int(q.get("startTime", NOW)) < NOW - 90 * DAY:
            return {"code": "40705", "msg": "The start and end time cannot exceed 90 days"}

        def window(rows, key):
            return [r for r in rows if int(q["startTime"]) <= int(r[key]) < int(q["endTime"])]

        if path == "/api/v2/mix/order/fill-history":
            return {"code": "00000", "data": {"fillList": window(self.fills, "cTime"), "endId": None}}
        if path == "/api/v2/mix/order/orders-history":
            return {"code": "00000", "data": {"entrustedList": window(self.orders, "cTime"), "endId": None}}
        if path == "/api/v2/mix/position/history-position":
            return {"code": "00000", "data": {"list": [], "endId": None}}
        if path == "/api/v2/mix/account/bill":
            return {"code": "00000", "data": {"bills": window(self.bills, "cTime"), "endId": None}}
        if path == "/api/v2/mix/market/history-candles":
            tf = TF_MS[q["granularity"]]
            end = int(q["endTime"]) // tf * tf
            rows = []
            for i in range(int(q["limit"])):
                t = end - i * tf
                p = price(q["symbol"], t)
                rows.append([str(t), str(p), str(p * 1.01), str(p * 0.99), str(p), "10", "1000"])
            return {"code": "00000", "data": list(reversed(rows))}
        if path == "/api/v2/mix/market/history-fund-rate":
            if q["pageNo"] != "1":
                return {"code": "00000", "data": []}
            return {"code": "00000", "data": [{"fundingTime": str(NOW - i * 8 * H), "fundingRate": "0.0001"} for i in range(0, 600)]}
        return {"code": "40404", "msg": f"unknown {path}"}


def make_fce_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE user_account_fills (trade_id TEXT PRIMARY KEY, symbol TEXT, timestamp TEXT, payload TEXT, fetched_at TEXT);
        CREATE TABLE paper_engine_states (symbol TEXT, timeframe TEXT, payload TEXT);
        CREATE TABLE whale_events (id TEXT PRIMARY KEY, wallet_address TEXT, symbol TEXT, event_type TEXT, event_at TEXT, size_usd REAL, payload TEXT);
        CREATE TABLE market_snapshots (id TEXT PRIMARY KEY, symbol TEXT, timeframe TEXT, provider TEXT, created_at TEXT, payload TEXT);
        CREATE TABLE deriv_metrics (id TEXT PRIMARY KEY, symbol TEXT, source TEXT, tier TEXT, as_of TEXT, created_at TEXT, payload TEXT);
        """
    )

    def fce_fill(tid, side, trade_side, px, size, profit, ts):
        return {"trade_id": tid, "order_id": f"fo{tid}", "symbol": "ETHUSDT", "price": px, "size": size, "side": side,
                "trade_side": trade_side, "position_mode": "hedge_mode", "profit": profit, "fee_usdt": 0.05, "fee_detail": [], "timestamp": iso(ts)}

    old = [fce_fill("1", "sell", "open", 100.0, 1.0, None, OLD), fce_fill("2", "sell", "close", 95.0, 1.0, 5.0, OLD + 2 * H)]
    # FCE 도 최근 체결 하나를 갖고 있다 — 같은 id 면 거래소 원본이 이긴다.
    dup = fce_fill("11", "buy", "open", 100.0, 2.0, 0.0, NEW)
    for f in old + [dup]:
        conn.execute("INSERT INTO user_account_fills VALUES (?, ?, ?, ?, ?)", (f["trade_id"], "ETHUSDT", f["timestamp"], json.dumps(f), iso(NOW)))
    conn.execute("INSERT INTO paper_engine_states VALUES ('__SYSTEM__', 'user_fill_sync', ?)", (json.dumps({"status": "ok"}),))
    for i, (wallet, side_code, start) in enumerate([("w1", "B", 0.0), ("w2", "A", 0.0), ("w3", "B", 0.0)]):
        payload = {"entry_px": 100.0, "side": "long" if side_code == "B" else "short", "event": "open", "size": 10.0,
                   "payload": {"raw": {"side": side_code, "sz": "10", "startPosition": str(start), "px": "100"}}}
        conn.execute("INSERT INTO whale_events VALUES (?, ?, ?, ?, ?, ?, ?)", (f"e{i}", wallet, "ETHUSDT", "open", iso(NEW - 5 * H), 1000.0, json.dumps(payload)))
    conn.execute("INSERT INTO market_snapshots VALUES ('m1', 'ETHUSDT', '1h', 'bitget', ?, ?)", (iso(NEW - H), json.dumps({"reason_codes": ["trend_up"], "scores": {"long": 0.7}})))
    for i, (t, oi) in enumerate([(NEW - DAY - 10 * 60_000, 1000.0), (NEW - 10 * 60_000, 1100.0)]):
        conn.execute("INSERT INTO deriv_metrics VALUES (?, 'ETHUSDT', 'bitget', 'bitget_public', ?, ?, ?)", (f"d{i}", iso(t), iso(t), json.dumps({"open_interest": oi, "oi_change_pct": 1.0, "funding": 0.0001})))
    conn.commit()
    conn.close()


class KeyCheck(unittest.TestCase):
    def test_permission_lookup_failure_is_not_a_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / "p")
            bg = Bitget("k", "s", "p", pause=0, fetch=lambda url, h: {"code": "40014", "msg": "Incorrect permissions"})
            v = pipeline.check_key(store, bg)
            self.assertFalse(v["read_only"])
            self.assertIn("40014", v["error"])
            self.assertTrue(pipeline.attest_readonly(store)["read_only"])  # 🧑 화면 확인 기록
            store.close()

    def test_attest_cannot_override_write_permission(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / "p")
            bg = Bitget("k", "s", "p", pause=0, fetch=lambda url, h: {"code": "00000", "data": {"authorities": ["withdraw"]}})
            pipeline.check_key(store, bg)
            with self.assertRaises(ValueError):
                pipeline.attest_readonly(store)
            store.close()


class Pipeline(unittest.TestCase):
    def test_full_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "fce.db"
            make_fce_db(db)
            fce = connect_ro(db)
            fake = FakeBitget()
            store = Store(Path(tmp) / "private")
            bg = Bitget("k", "s", "p", pause=0, fetch=fake)

            key = pipeline.check_key(store, bg)
            self.assertTrue(key["read_only"])

            summary = pipeline.collect(store, bg, fce, days=180, now=NOW)
            self.assertEqual(summary["fce_fills"]["rows"], 3)
            self.assertEqual(summary["fills"]["rows"], 3)
            self.assertGreater(summary["bills"]["failed_windows"], 0)  # 90일 밖은 거부 → 기록만
            # 보관 경계를 걸친 구간이 없다 — 실패는 전부 경계 앞(오래된 쪽)이다.
            for e in store.fetch_errors():
                self.assertLessEqual(e["end_ms"], NOW - 89 * DAY)

            trades, *_ = pipeline.assemble(store)
            self.assertEqual(len(trades), 2)  # FCE 옛 숏 1 + 거래소 최근 롱 1(분할 청산)
            pipeline.fetch_market(store, bg, trades, now=NOW)
            built = pipeline.build(store, fce, now=NOW)
            self.assertEqual(built["trades"], 2)

            r = pipeline.compute_report(store, now=NOW, app_30d=13.6)
            recent = next(t for t in pipeline.assemble(store)[0] if t["entry_ms"] == NEW)
            self.assertTrue(recent["split_exit"])
            self.assertAlmostEqual(recent["funding"], -0.3)
            self.assertEqual(recent["exit_method"], "stop_loss")

            rc = r["reconcile"]
            self.assertEqual(rc["status"], "ok", rc)
            self.assertAlmostEqual(rc["reconstructed"], 14.0)
            self.assertEqual(rc["outside_ledger"], 1)  # FCE 에만 있는 옛 거래는 대조 불가로 센다

            tw = r["metrics"]["twr"]
            self.assertEqual(tw["status"], "ok")
            self.assertAlmostEqual(tw["twr_pct"], (1013.3 / 1000 - 1) * 100, places=6)  # 출금 500 은 수익률에 안 섞인다

            ctx = json.loads(store.conn.execute("SELECT payload FROM trade_context WHERE trade_id = ?", (recent["id"],)).fetchone()[0])
            self.assertIsNotNone(ctx["entry"]["market"]["1H"]["vs_ma20_pct"])
            self.assertIsNotNone(ctx["entry"]["market"]["1D"]["vs_ma200_pct"])
            self.assertIsNotNone(ctx["hold"]["mfe_pct"])
            self.assertIsNotNone(ctx["after"]["after_7d_pct"])
            self.assertEqual(ctx["entry"]["whales"]["long_wallets"], 2)
            self.assertEqual(ctx["entry"]["patterns"]["1h"]["reason_codes"], ["trend_up"])
            self.assertAlmostEqual(ctx["entry"]["derivs"]["oi_change_24h_pct"], 10.0)
            self.assertAlmostEqual(ctx["entry"]["funding_rate"], 0.0001)

            checks = {c["no"]: c["ok"] for c in r["checks"]}
            self.assertTrue(checks[1] and checks[2] and checks[4] and checks[5] and checks[6] and checks[7])
            self.assertFalse(checks[3])  # 120일 — 180일 못 채웠다고 말한다

            self.assertEqual(r["ledger_check"]["fits_amount_plus_fee"], r["ledger_check"]["checked"])
            md = render(r)
            self.assertIn("시간가중수익률", md)
            self.assertIn("대조 불가 1건", md)
            path = store.put_report(r["at"], r, md)
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            # 조회만 했다 — 주문 · 이체 경로는 한 번도 안 불렀다.
            self.assertFalse([c for c in fake.calls if "place" in c or "transfer" in c or "withdraw" in c])
            store.close()
            fce.close()


if __name__ == "__main__":
    unittest.main()
