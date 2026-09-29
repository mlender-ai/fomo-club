"""ENG-02 C-3 — 가설을 재판정(과거 봉)으로 **거르기만** 한다. FCE 자신의 스윕 · 판정을 읽기 전용으로 부른다.

    stdin  {"param": "max_entry_cost_r", "value": 0.12, "symbols": 4, "limit": 1500}
    stdout {"verdict": "worse" | "ok", "symbols": [{symbol, verdict, delta_mean_net_r, baseline_n, variant_n}], ...}

`worse` = 심볼 과반이 FCE 판정 "악화 (유의)"(거래당 netR 부트스트랩 CI 비겹침)이고 "개선 (유의)" 가 하나도 없을 때.
통과했다고 좋은 게 아니다 — 명백히 나쁜 것을 그림자에 올리지 않는 용도다. 판정은 그림자 기간이 한다.
cwd 는 FCE backend. DB 는 읽기 전용.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from dataclasses import replace

sys.path.insert(0, os.getcwd())

from app.core.config import get_settings  # noqa: E402
from app.paper.service import policy_from_settings  # noqa: E402
from app.validation import paper_replay as pr  # noqa: E402
from scripts.paper_replay_report import load_candles, stored_symbols  # noqa: E402


def main() -> None:
    spec = json.loads(sys.stdin.read() or "{}")
    param, value = spec["param"], spec["value"]
    settings = get_settings()
    base = policy_from_settings(settings, "crypto")
    variant = replace(base, **{param: value})
    database = settings.database_url.removeprefix("sqlite:///")
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        stored = stored_symbols(connection, "4h")
        symbols = [name for name, _ in stored][: int(spec.get("symbols", 4))]
        rows = []
        for symbol in symbols:
            candles = load_candles(connection, symbol, "4h", int(spec.get("limit", 1500)))
            if len(candles) < 120:
                continue
            result = pr.sweep(symbol=symbol, timeframe="4h", candles=candles, variants=[("baseline", base), (f"{param}={value}", variant)])
            v = (result.get("verdicts") or [{}])[0]
            rows.append(
                {
                    "symbol": symbol,
                    "verdict": v.get("verdict"),
                    "delta_mean_net_r": v.get("delta_mean_net_r"),
                    "baseline_n": v.get("baseline_n"),
                    "variant_n": v.get("variant_n"),
                }
            )
    finally:
        connection.close()
    worse = sum(1 for r in rows if r["verdict"] == "악화 (유의)")
    better = sum(1 for r in rows if r["verdict"] == "개선 (유의)")
    verdict = "worse" if rows and worse * 2 > len(rows) and better == 0 else "ok"
    print(json.dumps({"verdict": verdict, "policy": base.version, "param": param, "value": value, "symbols": rows}, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
