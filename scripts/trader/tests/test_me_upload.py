"""TRADER-03 업로더 — 올리는 모양(서버 `lib/me/types.ts` 와 같아야 한다). 합성 데이터만."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import me_upload  # noqa: E402
from core import pipeline  # noqa: E402
from core.bitget import Bitget  # noqa: E402
from core.fce import connect_ro  # noqa: E402
from core.store import Store  # noqa: E402
from test_pipeline import NOW, FakeBitget, make_fce_db  # noqa: E402

ACCOUNT_KEYS = {"v", "asOf", "trades", "daily", "twr", "open"}
TRADE_KEYS = {"id", "symbol", "side", "entryMs", "exitMs", "net", "gross", "fees", "funding", "margin", "notional", "leverage"}


class Upload(unittest.TestCase):
    def test_payload_shapes_match_server_types(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "fce.db"
            make_fce_db(db)
            fce = connect_ro(db)
            store = Store(Path(tmp) / "p")
            pipeline.collect(store, Bitget("k", "s", "p", pause=0, fetch=FakeBitget()), fce, days=180, now=NOW)
            a = me_upload.account_payload(store)
            self.assertEqual(set(a), ACCOUNT_KEYS)
            self.assertEqual(a["v"], 1)
            self.assertTrue(a["trades"])
            self.assertTrue(all(set(t) == TRADE_KEYS for t in a["trades"]))
            self.assertTrue(all(t["side"] in ("long", "short") for t in a["trades"]))
            # 지수는 첫날 앞에 1.0 이 붙는다 — 첫날 손익도 기간 수익률에 들어간다.
            first = min(a["twr"])
            self.assertEqual(a["twr"][first], 1.0)
            json.dumps(a)  # 직렬화 가능
            self.assertIsNone(me_upload.replica_payload(store))  # TRADER-02 전
            self.assertIsNone(me_upload.rules_payload(store))
            store.close()
            fce.close()

    def test_dry_run_needs_no_token_and_posts_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            calls = []
            orig = me_upload.post
            me_upload.post = lambda *a, **k: calls.append(a) or (200, "")
            try:
                code = me_upload.main(["--dry", "--no-collect", "--dir", str(Path(tmp) / "p")])
            finally:
                me_upload.post = orig
            self.assertEqual(code, 0)
            self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
