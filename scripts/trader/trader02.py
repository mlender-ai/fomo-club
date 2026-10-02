#!/usr/bin/env python3
"""TRADER-02 — 매매법 객관화. 절차 · 원칙은 `docs/trader/TRADER-02.md`.

순서(코드가 막는다):
  init-stated → (🧑 답 쓰기) → seal-stated → split → analyze → build-rules → (🧑 광혁-말 확인)
  → freeze → validate → paper-start → paper-tick(매시간)

  status        지금 어디까지 왔나 · 다음에 할 일
모든 산출물은 `~/.fomo/trader/trader02/` (레포 밖 · 700/600).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from core import t2_order as order  # noqa: E402
from core import t2_report as report  # noqa: E402
from core import t2_run as run  # noqa: E402
from core.fce import connect_ro, find_db  # noqa: E402
from core.private import PrivacyError  # noqa: E402
from core.store import Store  # noqa: E402
from core.t2_engine import EngineError  # noqa: E402
from core.timeutil import iso  # noqa: E402

TEMPLATE = HERE.parent.parent / "docs" / "trader" / "stated-rules.template.md"
STEPS = ["status", "init-stated", "seal-stated", "split", "analyze", "build-rules", "check-rules", "freeze", "validate", "paper-start", "paper-tick", "paper-status"]


def next_step(store: Store) -> str:
    if not order.stated_path(store).exists():
        return "init-stated — 그리고 🧑 데이터를 보기 전에 답을 쓴다"
    if not order.stated_seal(store):
        return f"🧑 {order.stated_path(store)} 에 답을 쓰고 seal-stated"
    if not order.split_info(store):
        return "split"
    if not (order.t2_dir(store) / run.ANALYSIS).exists():
        return "analyze"
    if not all(order.rule_hashes(store).values()):
        return "build-rules"
    if not store.meta("t2:freezes"):
        return "🧑 광혁-말 의 _todo 를 채우고(진입 조건은 에이전트가 서술을 옮기고 광혁 확인) freeze"
    if not (order.t2_dir(store) / "validation.json").exists():
        return "validate"
    if not store.meta("t2:paper"):
        return "paper-start"
    return "paper-tick (매시간 — launchd)"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="TRADER-02 매매법 객관화")
    ap.add_argument("step", choices=STEPS)
    ap.add_argument("--dir", help="비공개 저장 자리(기본 ~/.fomo/trader)")
    ap.add_argument("--fce-db", help="FCE SQLite 경로(읽기 전용)")
    ap.add_argument("--force", action="store_true", help="다시 봉인 · 다시 분할 — **기록에 남는다**")
    ap.add_argument("--no-refresh", action="store_true", help="paper-tick: 거래소 · FCE 새로 받기를 건너뛴다")
    ap.add_argument("--env-file", help="paper-tick: Bitget 조회 키 env 파일(FCE .env). 값은 읽기만 · 출력 안 함")
    args = ap.parse_args(argv)
    if args.env_file:
        from trader01 import load_env_file

        load_env_file(args.env_file)
    try:
        store = Store(Path(args.dir) if args.dir else None)
    except PrivacyError as exc:
        print(f"멈춤: {exc}", file=sys.stderr)
        return 2
    db = find_db(args.fce_db)
    fce = connect_ro(db) if db else None
    out_dir = order.t2_dir(store)
    try:
        if args.step == "status":
            for h in order.history(store):
                print(f"{iso(h['at'])}  {h['step']}")
            for w in order.contamination(store):
                print(f"⚠ {w}")
            print(f"다음: {next_step(store)}")
        elif args.step == "init-stated":
            p = order.init_stated(store, TEMPLATE)
            print(f"진술 파일: {p}\n데이터(TRADER-01 보고서 · 거래 내역 · 차트)를 다시 보지 말고 답을 쓴 뒤 `seal-stated`.")
        elif args.step == "seal-stated":
            seal = order.seal_stated(store, run.answers(store), force=args.force)
            print(f"봉인 {iso(seal['at'])} · 답 {seal['answered']}/{seal['questions']} · 지문 {seal['sha'][:12]}")
            for w in order.contamination(store):
                print(f"⚠ {w}")
        elif args.step == "split":
            s = order.split(store, run.all_trades(store), force=args.force)
            # 손익은 보여주지 않는다 — 건수와 날짜만.
            print(f"분할 고정: {iso(s['start'])} ~ {iso(s['cut'])} | {iso(s['cut'])} ~ {iso(s['end'])} · 앞 {s['train']}건 / 뒤 {s['test']}건 / 걸침 {s['straddle']}건")
        elif args.step == "analyze":
            a = run.analyze(store, fce)
            warn = order.contamination(store)
            p1 = run.write_private(out_dir / "analysis.md", report.analysis_md(a, warn))
            p2 = run.write_private(out_dir / "stated-vs-revealed.md", report.compare_md(a["compare"], warn))
            print(f"B: {p1}\nC: {p2}")
        elif args.step == "build-rules":
            for k, v in run.build_rules(store).items():
                print(f"{k}: {v}")
            said = json.loads(order.rule_path(store, "광혁-말").read_text(encoding="utf-8"))
            for t in said.get("_todo_list", []):
                print(f"  🧑 광혁-말 채울 것: {t}")
            print(f"규칙 파일: {out_dir / 'rules'}")
        elif args.step == "check-rules":
            for v, r in run.check_rules(store).items():
                print(f"{v}: {'스키마 통과' if r.get('ok') else r.get('errors')}")
        elif args.step == "freeze":
            for v, r in run.check_rules(store).items():
                if not r.get("ok"):
                    print(f"{v} 가 랩 스키마를 통과하지 못했다: {r.get('errors')}", file=sys.stderr)
                    return 3
            f = order.freeze(store)
            print(f"동결 {iso(f['at'])} · " + " · ".join(f"{k} {h[:12]}" for k, h in f["hashes"].items()))
            if f["after_validation"]:
                print("⚠ 검증 뒤 수정 — 모든 보고서에 남는다")
        elif args.step == "validate":
            v = run.validate(store, fce)
            p = run.write_private(out_dir / "validation.md", report.validation_md(v))
            print(report.validation_md(v))
            print(f"저장: {p}")
        elif args.step == "paper-start":
            m = run.paper_start(store)
            print(f"페이퍼 시작 {iso(m['start_ms'])} · 판정 {m['verdict']} · 실매매 후보 {'예' if m['live_candidate'] else '아니오'}")
        elif args.step == "paper-tick":
            if not args.no_refresh:
                refresh(store, fce)
            r = run.paper_tick(store, fce, order.now_ms())
            p = run.write_private(out_dir / "paper-status.md", report.paper_md(run.paper_status(store)))
            print(json.dumps(r, ensure_ascii=False))
            print(f"상태: {p}")
        elif args.step == "paper-status":
            print(report.paper_md(run.paper_status(store)))
    except (order.OrderError, EngineError) as exc:
        print(f"멈춤: {exc}", file=sys.stderr)
        return 4
    finally:
        store.close()
        if fce is not None:
            fce.close()
    return 0


def refresh(store: Store, fce) -> None:
    """실계좌 새 거래(TRADER-01 수집 · 묶기)와 복제 규칙 종목의 새 1시간봉. 키가 없으면 FCE 사본만."""
    from core import pipeline
    from core.bitget import Bitget, env_keys

    key, secret, passphrase = env_keys()
    bg = Bitget(key, secret, passphrase)
    pipeline.collect(store, bg if bg.private_ready else None, fce, days=7)
    trades, *_ = pipeline.assemble(store)
    store.replace_trades(trades)
    meta = json.loads(store.meta("t2:paper") or "{}")
    body = json.loads(order.rule_path(store, meta.get("version", "광혁-데이터")).read_text(encoding="utf-8"))
    now = order.now_ms()
    for symbol in body["universe"]["symbols"]:
        pipeline.fetch_range(store, bg, symbol, "1H", now - 3 * 86_400_000, now, now, fallback=False)


if __name__ == "__main__":
    sys.exit(main())
