"""TRADER-02 한 바퀴 — 합성 '광혁' 이 아는 규칙(1시간봉 3연속 하락 뒤 롱)으로 거래한다.

체결 · 장부만 보고 파이프라인이 그 규칙을 다시 찾아내는지, 순서 장치가 막아야 할 것을 막는지 본다.
실계좌 데이터는 없다. 랩 엔진(node · tsx)이 없으면 엔진 단계는 건너뛴다.
"""
from __future__ import annotations

import json
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import pipeline  # noqa: E402
from core import t2_order as order  # noqa: E402
from core import t2_report as report  # noqa: E402
from core import t2_run as run  # noqa: E402
from core import t2_stated as stated  # noqa: E402
from core.store import Store  # noqa: E402
from core.t2_engine import available  # noqa: E402

M5 = 300_000
H = 3_600_000
DAY = 86_400_000
T0 = 1_775_001_600_000  # UTC 자정
DAYS = 100
TEMPLATE = Path(__file__).resolve().parents[3] / "docs" / "trader" / "stated-rules.template.md"


def agg(rows, span):
    out = {}
    for r in rows:
        k = r[0] // span * span
        if k not in out:
            out[k] = [k, r[1], r[2], r[3], r[4], r[5]]
        else:
            o = out[k]
            o[2], o[3], o[4], o[5] = max(o[2], r[2]), min(o[3], r[3]), r[4], o[5] + r[5]
    return [tuple(v) for v in out.values()]


def synthetic_market(seed=7):
    rnd = random.Random(seed)
    p = 100.0
    rows = []
    for i in range(DAYS * 288):
        o = p
        p *= 1 + rnd.gauss(0, 0.0025)
        hi, lo = max(o, p) * (1 + abs(rnd.gauss(0, 0.0008))), min(o, p) * (1 - abs(rnd.gauss(0, 0.0008)))
        rows.append((T0 + i * M5, o, hi, lo, p, 100.0 + rnd.random() * 50))
    return rows


def synthetic_trader(h1, rnd):
    """3연속 하락 1시간봉이 닫히면 다음 봉 시가 근처에 롱. 6시간 뒤 반, 20시간 뒤 나머지. 재량 거래 몇 개."""
    fills, orders = [], []
    busy_until = 0
    fid = 0

    def add(ts, side, ts_side, px, qty, profit, oid, otype="market", source="normal"):
        nonlocal fid
        fid += 1
        fills.append({"tradeId": str(fid), "orderId": oid, "symbol": "ETHUSDT", "side": side, "tradeSide": ts_side, "price": str(px),
                      "baseVolume": str(qty), "profit": str(profit), "feeDetail": [{"feeCoin": "USDT", "totalFee": str(-px * qty * 0.0006)}],
                      "cTime": str(ts), "posMode": "hedge_mode"})
        orders.append({"orderId": oid, "symbol": "ETHUSDT", "orderType": otype, "orderSource": source, "leverage": "5", "cTime": str(ts)})

    def trade(i, qty, oid):
        e_bar, a_bar, b_bar = h1[i + 1], h1[min(i + 7, len(h1) - 1)], h1[min(i + 21, len(h1) - 1)]
        e_px = e_bar[1]
        add(e_bar[0] + 30_000, "buy", "open", e_px, qty, 0, f"{oid}o")
        add(a_bar[0] + 30_000, "buy", "close", a_bar[1], qty / 2, (a_bar[1] - e_px) * qty / 2, f"{oid}a", "limit")
        add(b_bar[0] + 30_000, "buy", "close", b_bar[1], qty / 2, (b_bar[1] - e_px) * qty / 2, f"{oid}b")
        return b_bar[0] + 30_000

    for i in range(30, len(h1) - 25):
        if h1[i][0] + H < busy_until:
            continue
        closes = [h1[i - k][4] for k in range(4)]
        if closes[0] < closes[1] < closes[2] < closes[3]:
            busy_until = trade(i, 10.0, f"r{i}")
        elif rnd.random() < 0.004:
            busy_until = trade(i, 10.0, f"d{i}")  # 재량
    return fills, orders


def bills_from(fills):
    bal = 10_000.0
    out = [{"billId": "dep", "symbol": "", "amount": "10000", "fee": "0", "businessType": "trans_from_exchange", "coin": "USDT", "balance": "10000", "cTime": str(T0)}]
    for f in sorted(fills, key=lambda x: int(x["cTime"])):
        fee = float(f["feeDetail"][0]["totalFee"])
        amt = float(f["profit"]) if f["tradeSide"] == "close" else 0.0
        bal += amt + fee
        out.append({"billId": f"b{f['tradeId']}", "symbol": "ETHUSDT", "amount": str(amt), "fee": str(fee),
                    "businessType": "close_long" if f["tradeSide"] == "close" else "open_long", "coin": "USDT", "balance": str(bal), "cTime": f["cTime"]})
    return out


def answer_all(text: str) -> str:
    nums = {"N.stop_pct": "-3", "N.leverage": "5", "N.margin_pct": "10", "N.scale_out": "예", "N.first_tp_pct": "2",
            "N.first_tp_size_pct": "50", "N.trail_pct": "1", "N.pause_after_losses": "3", "N.pause_minutes": "120", "N.side": "long",
            "N.symbols": "ETHUSDT", "N.trades_per_day": "1"}
    out = []
    for line in text.splitlines():
        m = stated.QUESTION.match(line)
        if m:
            line = line.rstrip() + " " + nums.get(m.group("id"), "모름" if m.group("id").startswith("A") else "")
        out.append(line)
    return "\n".join(out)


class Stated(unittest.TestCase):
    def test_template_questions_have_one_colon(self):
        # 질문 안에 ':' 이 있으면 답이 어디서 시작하는지 못 찾는다.
        for line in TEMPLATE.read_text(encoding="utf-8").splitlines():
            if stated.QUESTION.match(line):
                self.assertEqual(line.count(":"), 1, line)
                self.assertTrue(line.rstrip().endswith(":"), line)

    def test_parse_keeps_text_and_reads_numbers_only(self):
        parsed = stated.parse(answer_all(TEMPLATE.read_text(encoding="utf-8")))
        self.assertEqual(parsed["A4.stop"]["answer"], "모름")
        self.assertIsNone(parsed["A4.stop"]["value"])  # 서술은 해석하지 않는다
        self.assertEqual(parsed["N.stop_pct"]["value"], -3.0)
        self.assertIs(parsed["N.scale_out"]["value"], True)
        self.assertEqual(parsed["N.symbols"]["value"], ["ETHUSDT"])
        ids = list(parsed)
        self.assertEqual(ids[0], "A1.symbols")  # 질문 순서 그대로

    def test_stated_definition_leaves_entry_for_kwanghyuk(self):
        d = stated.stated_definition(stated.parse(answer_all(TEMPLATE.read_text(encoding="utf-8"))))
        self.assertIn("_todo", json.dumps(d, ensure_ascii=False))
        self.assertEqual(d["exit"]["stop_pct"], -3.0)
        self.assertEqual(d["exit"]["scale_out"][0], {"at_pct": 2.0, "size": 0.5})
        self.assertEqual(d["pause"], {"after_consecutive_losses": 3, "minutes": 120.0})


class FullRun(unittest.TestCase):
    def test_order_guards_and_rule_recovery(self):
        m5 = synthetic_market()
        h1, h4, d1 = agg(m5, H), agg(m5, 4 * H), agg(m5, DAY)
        fills, orders = synthetic_trader(h1, random.Random(3))
        now = T0 + DAYS * DAY
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / "p")
            store.put_fills([(f["tradeId"], "bitget", "ETHUSDT", int(f["cTime"]), f) for f in fills])
            store.put("raw_orders", [(o["orderId"], "ETHUSDT", int(o["cTime"]), o) for o in orders])
            store.put("raw_bills", [(b["billId"], int(b["cTime"]), b["businessType"], b) for b in bills_from(fills)])
            store.log_fetch("bills", T0, now, "ok", 1)
            for tf, rows in (("5m", m5), ("1H", h1), ("4H", h4), ("1D", d1)):
                store.put_candles("ETHUSDT", tf, rows, "bitget")
                store.put_candles("BTCUSDT", tf, rows, "bitget")
            pipeline.build(store, None, now=now)
            trades = run.all_trades(store)
            self.assertGreater(len(trades), 40)

            # 순서: 진술 봉인 전엔 분할도 분석도 안 된다.
            with self.assertRaises(order.OrderError):
                order.split(store, trades)
            path = order.init_stated(store, TEMPLATE)
            with self.assertRaises(order.OrderError):  # 빈 칸
                order.seal_stated(store, run.answers(store))
            path.write_text(answer_all(path.read_text(encoding="utf-8")), encoding="utf-8")
            seal = order.seal_stated(store, run.answers(store))
            self.assertEqual(seal["analysis_before_seal"], [])
            path.write_text(path.read_text(encoding="utf-8") + "\n고침", encoding="utf-8")
            with self.assertRaises(order.OrderError):  # 봉인 뒤 수정
                order.require_stated(store)
            order.seal_stated(store, run.answers(store), force=True)
            self.assertIn("진술을 봉인 뒤 다시 봉인했다", order.contamination(store))

            s = order.split(store, trades)
            self.assertGreater(s["train"], s["test"])
            with self.assertRaises(order.OrderError):
                order.split(store, trades)  # 다시 못 자른다
            train = order.train_trades(store, trades)
            self.assertTrue(all(t["exit_ms"] <= s["cut"] for t in train))
            with self.assertRaises(order.OrderError):
                order.test_trades(store, trades)  # 동결 전엔 뒤 30% 를 안 연다

            if not available():
                self.skipTest("랩 엔진(node_modules/.bin/tsx) 없음 — 엔진 단계 건너뜀")

            a = run.analyze(store, None)
            chosen = a["candidates"]["long"]["chosen"]
            # 아는 규칙: 3연속 하락. 후보에 consecutive ≤ -3 근처가 잡혀야 한다.
            self.assertTrue(any(c["indicator"] == "consecutive" and c.get("max", 0) <= -2 for c in chosen["conditions"]), chosen)
            self.assertGreater(chosen["recall"], 0.6)
            self.assertGreater(chosen["lift"], 3)
            self.assertIn("skipped", a["candidates"]["short"])
            self.assertIn("scale_out", a["exits"])
            md = report.analysis_md(a, order.contamination(store))
            self.assertIn("재현율", md)
            self.assertTrue(any(r["item"] == "손절" for r in a["compare"]))

            run.build_rules(store)
            said = order.rule_path(store, "광혁-말")
            with self.assertRaises(order.OrderError):
                order.freeze(store)  # _todo 남음
            body = json.loads(said.read_text(encoding="utf-8"))
            body["entry"] = {"all": [{"indicator": "rsi", "period": 14, "tf": "1h", "max": 35}]}
            body.pop("_todo_list")
            said.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
            checks = run.check_rules(store)
            self.assertTrue(all(r["ok"] for r in checks.values()), checks)
            order.freeze(store)

            v = run.validate(store, None)
            table = v["table"]
            self.assertEqual(set(table), {"광혁 실계좌", "광혁-말", "광혁-데이터"})
            self.assertGreater(table["광혁-데이터"]["recall"], 0.5)
            self.assertGreater(v["discretionary"]["광혁-데이터"]["n"], 0)  # 재량 거래가 따로 모였다
            self.assertIn(v["follows"]["verdict"], ("따라간다", "일부만 따라간다", "못 따라간다"))
            self.assertIn("E-2", report.validation_md(v))
            kept = store.conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
            self.assertEqual(kept, len(trades))  # 재량 거래를 지우지 않았다

            # 검증 뒤 규칙을 고치면 기록에 남는다.
            data_path = order.rule_path(store, "광혁-데이터")
            d = json.loads(data_path.read_text(encoding="utf-8"))
            d["max_positions"] = 2
            data_path.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
            with self.assertRaises(order.OrderError):
                run.validate(store, None)
            order.freeze(store)
            self.assertTrue(any("검증 후 규칙 수정" in w for w in order.contamination(store)))

            meta = run.paper_start(store)
            self.assertIn("live_candidate", meta)
            store.set_meta("t2:paper", json.dumps({**meta, "start_ms": now - 5 * DAY, "rule_sha": order.rule_hashes(store)["광혁-데이터"]}))
            tick = run.paper_tick(store, None, now)
            self.assertIn("new_trades", tick)
            status = run.paper_status(store)
            self.assertIn("광혁 복제", report.paper_md(status))
            store.close()


if __name__ == "__main__":
    unittest.main()
