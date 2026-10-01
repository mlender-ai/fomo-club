"""TRADER-01 순수 함수 — 합성 데이터만 쓴다(실계좌 데이터는 레포에 없다)."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import account, market  # noqa: E402
from core.bitget import judge_authorities, sign  # noqa: E402
from core.private import PrivacyError, ensure_private_dir  # noqa: E402
from core.trades import Fill, attach_funding, build_trades, exit_method  # noqa: E402

H = 3_600_000
T0 = 1_780_000_000_000  # 2026-05 어딘가


def fill(i, side, ts, price, size, trade_side, order=None, profit=None, fee=0.1, symbol="ETHUSDT"):
    return Fill(str(i), order or f"o{i}", symbol, side, trade_side, price, size, ts, fee, profit)


class TradeGrouping(unittest.TestCase):
    def test_single_round_trip_hedge_mode(self):
        trades, diag = build_trades(
            [
                fill(1, "buy", T0, 100.0, 1.0, "open"),
                fill(2, "buy", T0 + H, 110.0, 1.0, "close", profit=10.0),
            ]
        )
        self.assertEqual(len(trades), 1)
        t = trades[0]
        self.assertEqual(t["direction"], "long")
        self.assertAlmostEqual(t["realized_pnl"], 10.0)
        self.assertAlmostEqual(t["fees"], 0.2)
        self.assertAlmostEqual(t["net_pnl"], 9.8)
        self.assertAlmostEqual(t["return_pct"], 10.0)
        self.assertEqual(t["hold_minutes"], 60)
        self.assertFalse(t["split_entry"] or t["split_exit"])
        self.assertEqual(diag["unmatched_close_fills"], [])

    def test_split_entry_and_split_exit_keep_legs(self):
        # 두 번 나눠 사고(같은 주문 체결 두 건은 분할이 아니다) · 30/30/40 으로 나눠 판다.
        fills = [
            fill(1, "buy", T0, 100.0, 0.5, "open", order="A"),
            fill(2, "buy", T0 + 1000, 100.0, 0.5, "open", order="A"),
            fill(3, "buy", T0 + H, 90.0, 1.0, "open", order="B"),
            fill(4, "buy", T0 + 2 * H, 97.0, 0.6, "close", order="X", profit=1.2),
            fill(5, "buy", T0 + 3 * H, 100.0, 0.6, "close", order="Y", profit=3.0),
            fill(6, "buy", T0 + 4 * H, 105.0, 0.8, "close", order="Z", profit=8.0),
        ]
        orders = {
            "A": {"leverage": "10", "orderType": "limit"},
            "X": {"orderSource": "normal", "orderType": "limit"},
            "Y": {"orderSource": "profit_market", "orderType": "market"},
            "Z": {"orderSource": "normal", "orderType": "market"},
        }
        (t,), _ = build_trades(fills, orders)
        self.assertEqual(t["entry_fills"], 3)
        self.assertEqual(t["entry_orders"], 2)
        self.assertTrue(t["split_entry"])
        self.assertTrue(t["split_exit"])
        self.assertAlmostEqual(t["avg_entry"], 95.0)
        self.assertEqual(t["leverage"], 10.0)
        self.assertAlmostEqual(t["notional_usdt"], 190.0)
        self.assertAlmostEqual(t["margin_usdt"], 19.0)
        exits = t["legs"]["exits"]
        self.assertEqual([round(e["qty_pct"]) for e in exits], [30, 30, 40])
        self.assertAlmostEqual(exits[0]["return_pct"], (97 / 95 - 1) * 100)
        self.assertEqual([e["method"] for e in exits], ["limit", "take_profit", "market"])
        self.assertEqual(t["exit_method"], "market")
        self.assertAlmostEqual(t["realized_pnl"], 12.2)

    def test_one_way_flip_closes_then_opens(self):
        fills = [
            fill(1, "buy", T0, 100.0, 1.0, "buy_single"),
            fill(2, "sell", T0 + H, 105.0, 3.0, "sell_single", profit=5.0),
            fill(3, "buy", T0 + 2 * H, 100.0, 2.0, "buy_single", profit=10.0),
        ]
        trades, diag = build_trades(fills)
        self.assertEqual([t["direction"] for t in trades], ["long", "short"])
        self.assertAlmostEqual(trades[1]["avg_entry"], 105.0)
        self.assertEqual(diag["open_positions"], [])

    def test_close_without_open_is_unmatched_not_dropped_silently(self):
        _, diag = build_trades([fill(1, "sell", T0, 100.0, 1.0, "close", profit=3.0)])
        self.assertEqual(len(diag["unmatched_close_fills"]), 1)

    def test_exit_methods(self):
        self.assertEqual(exit_method({"orderSource": "loss_market"}, "close"), "stop_loss")
        self.assertEqual(exit_method({"orderSource": "pos_loss_market"}, "close"), "stop_loss")
        self.assertEqual(exit_method({"orderSource": "pos_profit_limit"}, "close"), "take_profit")
        self.assertEqual(exit_method(None, "burst_sell_single"), "liquidation")
        self.assertEqual(exit_method(None, "close"), "unknown")

    def test_funding_goes_to_trade_open_at_that_time(self):
        trades, _ = build_trades([fill(1, "buy", T0, 100.0, 1.0, "open"), fill(2, "buy", T0 + 10 * H, 100.0, 1.0, "close", profit=0.0)])
        loose = attach_funding(
            trades,
            [{"symbol": "ETHUSDT", "ts": T0 + 8 * H, "amount": -0.5}, {"symbol": "ETHUSDT", "ts": T0 + 30 * H, "amount": -0.2}],
        )
        self.assertAlmostEqual(trades[0]["funding"], -0.5)
        self.assertAlmostEqual(trades[0]["net_pnl"], -0.7)
        self.assertEqual(len(loose), 1)


def candles(start, n, tf_ms, closes, highs=None, lows=None, vols=None):
    return [
        (start + i * tf_ms, closes[i], (highs or closes)[i], (lows or closes)[i], closes[i], (vols or [1.0] * n)[i])
        for i in range(n)
    ]


class Market(unittest.TestCase):
    def test_no_lookahead(self):
        c = candles(T0, 5, H, [1, 2, 3, 4, 5])
        # T0 + 3H 에 닫힌 봉: 0·1·2 (3번째 봉은 T0+3H 에 열려 아직 안 닫혔다)
        self.assertEqual(len(market.closed_upto(c, T0 + 3 * H, "1H")), 3)

    def test_rsi_extremes_and_sma(self):
        self.assertEqual(market.rsi([float(i) for i in range(30)]), 100.0)
        self.assertLess(market.rsi([float(30 - i) for i in range(30)]), 1.0)
        self.assertIsNone(market.rsi([1.0] * 5))
        self.assertEqual(market.sma([1, 2, 3, 4], 2), 3.5)

    def test_tf_state_ma_distance(self):
        c = candles(T0, 30, H, [100.0] * 30)
        s = market.tf_state(c, T0 + 30 * H, "1H", 110.0)
        self.assertAlmostEqual(s["vs_ma20_pct"], 10.0)
        self.assertIsNone(s["vs_ma60_pct"])

    def test_excursion_long_and_short(self):
        c = candles(T0, 4, H, [100, 100, 100, 100], highs=[101, 112, 103, 100], lows=[99, 98, 95, 100])
        long = market.excursion(c, "1H", T0, T0 + 4 * H, 100.0, "long", 4.0)
        self.assertAlmostEqual(long["mfe_pct"], 12.0)
        self.assertAlmostEqual(long["mae_pct"], -5.0)
        self.assertAlmostEqual(long["capture"], 4.0 / 12.0)
        short = market.excursion(c, "1H", T0, T0 + 4 * H, 100.0, "short", None)
        self.assertAlmostEqual(short["mfe_pct"], 5.0)
        self.assertAlmostEqual(short["mae_pct"], -12.0)

    def test_after_exit(self):
        c = candles(T0, 30, H, [100.0 + i for i in range(30)])
        out = market.after_exit(c, T0 + H, 101.0, "long", T0 + 100 * H)
        self.assertGreater(out["after_24h_pct"], 0)  # 판 뒤에 더 갔다
        self.assertIsNone(out["after_7d_pct"])  # 봉이 그만큼 없다
        self.assertIsNone(market.after_exit(c, T0, 100.0, "long", T0 + H)["after_24h_pct"])  # 아직 안 됐다

    def test_flips_and_granularity(self):
        before = {"1H": {"vs_ma20_pct": 1.0, "rsi14": 65.0}}
        after = {"1H": {"vs_ma20_pct": -0.5, "rsi14": 72.0}}
        self.assertEqual(market.flips(before, after), ["1H MA20 아래로", "1H RSI 70 돌파"])
        self.assertEqual(market.pick_granularity(10 * H), "1m")
        self.assertEqual(market.pick_granularity(48 * H), "5m")
        self.assertEqual(market.pick_granularity(30 * 24 * H), "1H")


def bill(i, ts, kind_type, amount, balance, fee=0.0, symbol="ETHUSDT"):
    return account.normalize_bill(
        {"billId": str(i), "cTime": str(ts), "businessType": kind_type, "amount": str(amount), "fee": str(fee), "balance": str(balance), "symbol": symbol}
    )


class Account(unittest.TestCase):
    def test_twr_ignores_deposit(self):
        # 1000 → +100 (10%) → 입금 1100 → +220 (10%) : 시간가중 21%. 단순 %(입금 섞임)면 66% 가 나온다.
        bills = [
            bill(1, T0, "trans_from_exchange", 1000, 1000),
            bill(2, T0 + 24 * H, "close_long", 100, 1100),
            bill(3, T0 + 48 * H, "trans_from_exchange", 1100, 2200),
            bill(4, T0 + 72 * H, "close_long", 220, 2420),
        ]
        out = account.twr(bills)
        self.assertEqual(out["status"], "ok")
        self.assertAlmostEqual(out["twr_pct"], 21.0, places=6)
        self.assertEqual(account.account_metrics([], bills, 3)["net_pnl_bills"], 320)

    def test_twr_mdd_and_missing_balance(self):
        bills = [
            bill(1, T0, "trans_from_exchange", 1000, 1000),
            bill(2, T0 + 24 * H, "close_long", 200, 1200),
            bill(3, T0 + 48 * H, "close_long", -300, 900),
        ]
        self.assertAlmostEqual(account.twr(bills)["mdd_pct"], -25.0)
        broken = [dict(b, balance=None) for b in bills]
        self.assertEqual(account.twr(broken)["status"], "no_balance_field")

    def test_daily_stats_streak(self):
        days = account.daily_pnl(
            [bill(i, T0 + i * 24 * H, "close_long", v, 0) for i, v in enumerate([5, -1, -2, -3, 4, -1])]
        )
        stats = account.daily_stats(days)
        self.assertEqual(stats["max_losing_streak_days"], 3)
        self.assertEqual(stats["max_daily_loss"], -3)

    def test_reconcile_gate(self):
        trades, diag = build_trades([fill(1, "buy", T0, 100.0, 1.0, "open"), fill(2, "buy", T0 + H, 110.0, 1.0, "close", profit=10.0)])
        ok = account.reconcile(trades, diag["unmatched_close_fills"], [bill(9, T0 + H, "close_long", 10.05, 0)])
        self.assertEqual(ok["status"], "ok")
        bad = account.reconcile(trades, [], [bill(9, T0 + H, "close_long", 12.0, 0)])
        self.assertEqual(bad["status"], "mismatch")
        self.assertEqual(account.reconcile(trades, [], [])["status"], "no_close_bills")

    def test_cost_share_matches_lab_definition(self):
        trades, _ = build_trades(
            [fill(1, "buy", T0, 100.0, 1.0, "open", fee=1.0), fill(2, "buy", T0 + H, 104.0, 1.0, "close", profit=4.0, fee=1.0)]
        )
        self.assertAlmostEqual(account.trade_stats(trades)["cost_share_pct"], 50.0)

    def test_ledger_consistency_catches_flipped_fee_sign(self):
        good = [bill(1, T0, "trans_from_exchange", 100, 100), bill(2, T0 + H, "close_long", 5, 104.9, fee=-0.1)]
        self.assertFalse(account.ledger_consistency(good)["fee_sign_flipped"])
        flipped = [bill(1, T0, "trans_from_exchange", 100, 100), bill(2, T0 + H, "close_long", 5, 104.9, fee=0.1)]
        self.assertTrue(account.ledger_consistency(flipped)["fee_sign_flipped"])

    def test_bill_kinds(self):
        self.assertEqual(account.bill_kind("trans_to_exchange"), "transfer")
        self.assertEqual(account.bill_kind("contract_settle_fee"), "funding")
        self.assertEqual(account.bill_kind("burst_long_loss_query"), "close")
        self.assertEqual(account.bill_kind("open_long"), "open")
        self.assertEqual(account.bill_kind("append_margin"), "margin")


class Safety(unittest.TestCase):
    def test_refuses_inside_git_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".git").mkdir()
            with self.assertRaises(PrivacyError):
                ensure_private_dir(Path(tmp) / "data")

    def test_private_dir_mode_700(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = ensure_private_dir(Path(tmp) / "x")
            self.assertEqual(oct(os.stat(d).st_mode & 0o777), "0o700")

    def test_authorities_judgement(self):
        self.assertTrue(judge_authorities(["readonly"])["read_only"])
        self.assertFalse(judge_authorities(["readonly", "withdraw"])["read_only"])
        self.assertEqual(judge_authorities(["coor", "coow"])["write_like"], ["coow"])
        self.assertFalse(judge_authorities([])["read_only"])

    def test_signature_matches_fce_formula(self):
        # FCE signer: base64(hmac_sha256(secret, ts + METHOD + path?query))
        import base64
        import hashlib
        import hmac

        expected = base64.b64encode(hmac.new(b"s", b"1GET/api/v2/x?a=1", hashlib.sha256).digest()).decode()
        self.assertEqual(sign("s", "1", "get", "/api/v2/x", "a=1"), expected)


if __name__ == "__main__":
    unittest.main()
