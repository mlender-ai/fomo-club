#!/usr/bin/env python3
"""TRADER-01 — 실계좌 거래 수집. 절차 · 원칙은 `docs/trader/TRADER-01.md`.

  python3 scripts/trader/trader01.py check-key   --env-file ~/fce/backend/.env
  python3 scripts/trader/trader01.py all         --env-file ~/fce/backend/.env --app-30d-pnl <앱 30D PnL>

단계를 따로 돌릴 수도 있다: collect → market → build → report.
거래 데이터 · 보고서는 `~/.fomo/trader/` (레포 밖 · 권한 700/600) 에만 쓴다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from core import pipeline  # noqa: E402
from core.bitget import Bitget, BitgetError, env_keys  # noqa: E402
from core.fce import connect_ro, find_db  # noqa: E402
from core.private import PrivacyError  # noqa: E402
from core.report import render  # noqa: E402
from core.store import Store  # noqa: E402

REPO = str(HERE.parent.parent)
KEY_NAMES = ("FCE_BITGET_API_KEY", "FCE_BITGET_API_SECRET", "FCE_BITGET_API_PASSPHRASE", "BITGET_API_KEY", "BITGET_API_SECRET", "BITGET_API_PASSPHRASE")


def load_env_file(path: str) -> int:
    """KEY=VALUE 파일에서 Bitget 키 세 개만 읽는다. 값은 출력하지 않는다."""
    loaded = 0
    for line in Path(path).expanduser().read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        name = name.strip().removeprefix("export ").strip()
        if name in KEY_NAMES and not os.environ.get(name):
            os.environ[name] = value.strip().strip('"').strip("'")
            loaded += 1
    return loaded


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="TRADER-01 실계좌 거래 수집")
    ap.add_argument("step", choices=["check-key", "collect", "market", "build", "report", "all"])
    ap.add_argument("--env-file", help="Bitget 조회 키가 든 env 파일(FCE 의 .env). 값은 읽기만 한다")
    ap.add_argument("--fce-db", help="FCE SQLite 경로(기본: ~/fce/backend/fomo_control_engine.db)")
    ap.add_argument("--days", type=int, default=pipeline.TARGET_DAYS, help="거래소에 요청할 기간(일). 기본 180")
    ap.add_argument("--app-30d-pnl", type=float, help="거래소 앱의 30D PnL(USDT) — E-2 대조")
    ap.add_argument("--dir", help="비공개 저장 자리(기본 ~/.fomo/trader, git 밖이어야 한다)")
    ap.add_argument("--confirm-readonly", action="store_true", help="🧑 거래소 API 관리 화면에서 '읽기만' 켜진 걸 눈으로 확인했다(check-key 와 함께)")
    args = ap.parse_args(argv)

    if args.env_file:
        print(f"env 파일에서 키 {load_env_file(args.env_file)}개 읽음 (값은 표시하지 않는다)")
    try:
        store = Store(Path(args.dir) if args.dir else None)
    except PrivacyError as exc:
        print(f"멈춤: {exc}", file=sys.stderr)
        return 2
    print(f"비공개 저장소: {store.path}")
    key, secret, passphrase = env_keys()
    bg = Bitget(key, secret, passphrase)
    db = find_db(args.fce_db)
    fce = connect_ro(db) if db else None
    print(f"FCE DB: {db or '못 찾음 — 고래 · 패턴 · OI 는 빈칸'}")

    steps = ["check-key", "collect", "market", "build", "report"] if args.step == "all" else [args.step]
    try:
        for step in steps:
            if step == "check-key":
                if not bg.private_ready:
                    print("조회 키 없음 — FCE_BITGET_API_KEY/SECRET/PASSPHRASE (또는 --env-file)")
                    if args.step == "check-key":
                        return 1
                    continue
                v = pipeline.check_key(store, bg)
                if v.get("error"):
                    print(f"[키] 권한 조회 실패 — {v['error']}")
                else:
                    print(f"[키] 권한 {v['authorities']} → 조회 전용 판정 {'예' if v['read_only'] else '아니오/확인 필요'}")
                if v["write_like"]:
                    print(f"  ⚠ 쓰기로 보이는 권한: {v['write_like']} — 주문·출금 권한 없는 키로 바꿔라. 여기서 멈춘다.")
                    return 3
                if args.confirm_readonly:
                    pipeline.attest_readonly(store)
                    print("  ✓ 광혁 화면 확인으로 기록했다(완료 확인 1).")
                elif not v["read_only"]:
                    print("  ? 기계로 판정 못 했다 — 거래소 API 관리 화면에서 '읽기' 만 켜졌는지 보고 `check-key --confirm-readonly`.")
            elif step == "collect":
                print("[수집]", json.dumps(pipeline.collect(store, bg, fce, args.days), ensure_ascii=False))
            elif step == "market":
                trades, *_ = pipeline.assemble(store)
                print("[시장]", json.dumps(pipeline.fetch_market(store, bg, trades), ensure_ascii=False))
            elif step == "build":
                print("[묶기]", json.dumps(pipeline.build(store, fce), ensure_ascii=False))
            elif step == "report":
                r = pipeline.compute_report(store, app_30d=args.app_30d_pnl, repo_root=REPO)
                md = render(r)
                path = store.put_report(r["at"], r, md)
                print(md)
                print(f"보고서 저장: {path} (비공개)")
                if r["reconcile"].get("status") != "ok":
                    print("E-1 재구성 손익 ≠ 거래소 손익 — TRADER-02 로 넘어가지 않는다.", file=sys.stderr)
                    return 4
    except BitgetError as exc:
        print(f"Bitget: {exc}", file=sys.stderr)
        return 5
    finally:
        store.close()
        if fce is not None:
            fce.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
