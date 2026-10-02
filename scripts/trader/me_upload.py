#!/usr/bin/env python3
"""TRADER-03 F — 실계좌 · 복제 · 매매법을 랩 **비공개 자리**(`/api/me/ingest`)로 올린다. 15분마다(launchd).

  python3 scripts/trader/me_upload.py --env-file ~/fce/backend/.env           # 수집(TRADER-01, 최근 7일) + 올리기
  python3 scripts/trader/me_upload.py --no-collect                            # 이미 있는 것만 올리기
  python3 scripts/trader/me_upload.py --dry                                   # 무엇을 올릴지 크기만(값은 안 찍는다)

| 환경변수 | 뜻 |
|---|---|
| `ME_INGEST_TOKEN` | 🧑 Vercel 과 같은 값. 랩 업로드 토큰과 **따로** |
| `LAB_BASE_URL` | 기본 정규 도메인 |

올리는 곳은 `/api/me/ingest` 하나뿐이다 — 공개 `/api/lab/*` 으로는 아무것도 보내지 않는다.
값을 화면 · 로그에 찍지 않는다(건수 · 바이트만).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from core import account as acc  # noqa: E402
from core import pipeline  # noqa: E402
from core import t2_order as order  # noqa: E402
from core.fce import connect_ro, find_db  # noqa: E402
from core.private import PrivacyError  # noqa: E402
from core.store import Store  # noqa: E402
from core.timeutil import DAY_MS, local_day  # noqa: E402

LAB = os.environ.get("LAB_BASE_URL", "https://fomo-web-mlender-ais-projects.vercel.app").rstrip("/")


def account_payload(store: Store) -> dict:
    trades, diag, bills, _ = pipeline.assemble(store)
    tw = acc.twr(bills)
    index = dict(tw.get("daily_index") or {})
    if index:
        # 첫날 앞에 1.0 — 첫날 손익도 기간 수익률에 들어가게.
        first = min(index)
        index = {local_day(_day_ms(first) - DAY_MS): 1.0, **index}
    return {
        "v": 1,
        "asOf": int(time.time() * 1000),
        "trades": [
            {
                "id": t["id"],
                "symbol": t["symbol"],
                "side": t["direction"],
                "entryMs": t["entry_ms"],
                "exitMs": t["exit_ms"],
                "net": t["net_pnl"],
                "gross": t["realized_pnl"],
                "fees": t["fees"],
                "funding": t["funding"],
                "margin": t["margin_usdt"],
                "notional": t["notional_usdt"],
                "leverage": t["leverage"],
            }
            for t in trades
        ],
        "daily": dict(acc.daily_pnl(bills)),
        "twr": index,
        "open": [{"symbol": p["symbol"], "side": p["direction"], "entryMs": _iso_ms(p["entry_at"])} for p in diag["open_positions"]],
    }


def _day_ms(day: str) -> int:
    from datetime import datetime, timedelta, timezone

    return int(datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone(timedelta(hours=9))).timestamp() * 1000)


def _iso_ms(value: str | None) -> int:
    from core.timeutil import parse_iso_ms

    return parse_iso_ms(value) if value else 0


def replica_payload(store: Store) -> dict | None:
    raw = store.meta("t2:paper")
    if not raw:
        return None
    meta = json.loads(raw)
    store.conn.executescript("CREATE TABLE IF NOT EXISTS t2_paper_trades (key TEXT PRIMARY KEY, symbol TEXT, side TEXT, entry_ms INTEGER, exit_ms INTEGER, payload TEXT);")
    rows = [json.loads(r[0]) for r in store.conn.execute("SELECT payload FROM t2_paper_trades ORDER BY exit_ms").fetchall()]
    lev = 1
    try:
        lev = json.loads(order.rule_path(store, meta["version"]).read_text(encoding="utf-8")).get("leverage") or 1
    except (OSError, ValueError):
        pass
    state = json.loads(store.meta("t2:paper_state") or "{}")
    return {
        "v": 1,
        "asOf": int(time.time() * 1000),
        "startMs": meta["start_ms"],
        "verdict": meta.get("verdict"),
        "liveCandidate": bool(meta.get("live_candidate")),
        "capital": meta["capital"],
        "trades": [
            {
                "symbol": t["symbol"],
                "side": "long" if t["side"] == "LONG" else "short",
                "entryMs": t["entryAt"],
                "exitMs": t["exitAt"],
                "net": t["pnl"],
                "notional": t["entryPrice"] * t["qty"],
                # 엔진은 명목으로 굴렸다(증거금 → 명목). 증거금 = 명목 ÷ 레버리지.
                "margin": t["entryPrice"] * t["qty"] / lev,
            }
            for t in rows
        ],
        "open": [
            {"symbol": p["symbol"], "side": "long" if p["side"] == "LONG" else "short", "entryMs": _iso_ms(p["entryAt"]) if isinstance(p["entryAt"], str) else p["entryAt"]}
            for p in state.get("open", [])
        ],
    }


def rules_payload(store: Store) -> dict | None:
    seal = order.stated_seal(store)
    if not seal:
        return None
    d = order.t2_dir(store)
    definitions = {}
    for v in order.VERSIONS:
        p = order.rule_path(store, v)
        if p.exists():
            definitions[v] = json.loads(p.read_text(encoding="utf-8"))
    analysis = json.loads((d / "analysis.json").read_text(encoding="utf-8")) if (d / "analysis.json").exists() else {}
    validation = json.loads((d / "validation.json").read_text(encoding="utf-8")) if (d / "validation.json").exists() else None
    freezes = json.loads(store.meta("t2:freezes") or "[]")
    return {
        "v": 1,
        "asOf": int(time.time() * 1000),
        "statedSealedAt": seal["at"],
        "contamination": order.contamination(store),
        "freezes": [{"at": f["at"], "hashes": f["hashes"], "afterValidation": bool(f.get("after_validation"))} for f in freezes],
        "definitions": definitions,
        "compare": analysis.get("compare", []),
        "validation": None
        if not validation
        else {
            "verdict": (validation.get("follows") or {}).get("verdict"),
            "table": validation.get("table", {}),
            "discretionary": validation.get("discretionary", {}),
        },
    }


def post(key: str, payload: dict, token: str) -> tuple[int, str]:
    body = json.dumps({"key": key, "payload": payload}).encode()
    req = urllib.request.Request(
        f"{LAB}/api/me/ingest",
        data=body,
        method="POST",
        headers={"content-type": "application/json", "authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, f"{len(body):,} bytes"
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(errors="replace")[:200]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="TRADER-03 실계좌 비교 — 비공개 업로드")
    ap.add_argument("--env-file", help="Bitget 조회 키 · ME_INGEST_TOKEN 이 든 env 파일(값은 읽기만)")
    ap.add_argument("--no-collect", action="store_true", help="수집(TRADER-01) 없이 있는 것만 올린다")
    ap.add_argument("--dry", action="store_true", help="올리지 않고 건수 · 크기만")
    ap.add_argument("--dir", help="비공개 저장 자리(기본 ~/.fomo/trader)")
    ap.add_argument("--fce-db")
    args = ap.parse_args(argv)
    if args.env_file:
        from trader01 import load_env_file

        load_env_file(args.env_file)
        # ME_INGEST_TOKEN 도 같은 파일에 둘 수 있다(값은 찍지 않는다).
        for line in Path(args.env_file).expanduser().read_text(encoding="utf-8").splitlines():
            name, _, value = line.strip().removeprefix("export ").partition("=")
            if name.strip() == "ME_INGEST_TOKEN" and not os.environ.get("ME_INGEST_TOKEN"):
                os.environ["ME_INGEST_TOKEN"] = value.strip().strip('"').strip("'")
    token = os.environ.get("ME_INGEST_TOKEN", "")
    if not token and not args.dry:
        print("ME_INGEST_TOKEN 이 없다 — Vercel 과 같은 값을 맥에 넣는다(🧑)", file=sys.stderr)
        return 2
    try:
        store = Store(Path(args.dir) if args.dir else None)
    except PrivacyError as exc:
        print(f"멈춤: {exc}", file=sys.stderr)
        return 2
    db = find_db(args.fce_db)
    fce = connect_ro(db) if db else None
    try:
        if not args.no_collect:
            from core.bitget import Bitget, env_keys

            key, secret, passphrase = env_keys()
            bg = Bitget(key, secret, passphrase)
            pipeline.collect(store, bg if bg.private_ready else None, fce, days=7)
            trades, *_ = pipeline.assemble(store)
            store.replace_trades(trades)
        failed = 0
        for name, build in (("account", account_payload), ("replica", replica_payload), ("rules", rules_payload)):
            payload = build(store)
            if payload is None:
                print(f"{name}: 아직 없음 — 건너뜀")
                continue
            size = len(json.dumps(payload))
            count = len(payload.get("trades", [])) if isinstance(payload.get("trades"), list) else None
            if args.dry:
                print(f"{name}: {size:,} bytes" + (f" · 거래 {count}" if count is not None else ""))
                continue
            status, info = post(name, payload, token)
            print(f"{name}: {status} {info if status == 200 else ''}".rstrip())
            failed += status != 200
        return 1 if failed else 0
    finally:
        store.close()
        if fce is not None:
            fce.close()


if __name__ == "__main__":
    sys.exit(main())
