"""주식 트랙 재개 (OPS-02 C · D) — **사람이 돌린다.** 기본은 미리보기만 한다.

    cd ~/fce/backend   # FCE 가 아직 옮겨지지 않았으면 ~/Documents/Fomo club engine/backend
    python3 ~/fomo-club/scripts/ops/stock-resume.py                  # 무엇을 바꿀지만 본다
    python3 ~/fomo-club/scripts/ops/stock-resume.py --apply          # 대기 주문 폐기
    python3 ~/fomo-club/scripts/ops/stock-resume.py --apply --resume-us   # + US 트랙 운용중으로

## 대기 주문 폐기 (C)

`status='queued'` 주문 전부 — KR 13,940 · US 1,971(2026-09-29). 전부 **같은 시간 청산(time_stop) 매도 신호가
틱마다 새 주문으로 쌓인 것**이다(KR 2종목 · US 1종목). 지금 가격에 체결하면 과거 판단을 현재 가격으로 채점한다.

1. 전부 `backups/ops02-queued-orders-<날짜>.jsonl` 로 저장한다 (지우기 전에)
2. 상태를 `cancelled` · 사유를 `cancelled_stale` 로 바꾼다 — **삭제하지 않는다**
   - WO 는 상태 `cancelled_stale` 을 적었지만, FCE 는 주문을 읽을 때 `OrderStatus(payload["status"])` 로 enum 을
     만든다(`stock_paper/store.py`). 없는 값이면 **주식 엔진 루프가 통째로 죽는다.** 그래서 상태는 FCE 가 아는
     `cancelled`, 사유 칸에 `cancelled_stale` 을 쓴다
3. payload 에 `stale_note: 봉 불일치 수정 전 생성 · 체결 시 성과 오염` 을 남긴다

**체결하지 않는다.** 포지션(KR 035420 2주 · 009150 1주 · US NVDA 1주)은 그대로 남는다. 시간 청산 조건이 여전하면
재개 뒤 **새 신호**가 다시 나고, 그 신호가 그때 가격으로 나간다 — 그게 정상 경로다.

## US 재개 (D-4)

`stock_paper_tracks` US 를 `running` 으로 · `stop_reason` 을 비운다. FCE RESTART_RUNBOOK "주식 트랙 정지 해제" 3번과 같다.
조건 — 대기 주문이 0 이고, 지금 가격 모형으로 과거 US 체결 재검사 위반이 0 이어야 한다(`stock-fill-audit.py`).
**KR 은 이미 `running` 이다** (큐 보류 `FCE_STOCK_PAPER_HOLD_QUEUED_ORDERS` 는 그대로 둔다 — FCE 런북 순서: US 24시간 재발 0 → 그다음 KR 보류 해제).

invariant 는 건드리지 않는다.
"""
from __future__ import annotations

import collections
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

DB = "fomo_control_engine.db"
REASON = "cancelled_stale"
NOTE = "봉 불일치 수정 전 생성 · 체결 시 성과 오염 (OPS-02 C · 2026-09-29)"
COLUMNS = ["id", "market", "symbol", "side", "status", "signal_at", "updated_at", "reason", "payload", "entry_mode"]


def main() -> int:
    apply = "--apply" in sys.argv
    resume_us = "--resume-us" in sys.argv
    if not os.path.exists(DB):
        print(f"{DB} 이 여기 없다 — FCE backend 폴더에서 돌린다 (cd ~/fce/backend)", file=sys.stderr)
        return 1
    db = sqlite3.connect(DB, timeout=60)
    db.execute("PRAGMA busy_timeout=60000")
    rows = db.execute(f"SELECT {', '.join(COLUMNS)} FROM stock_paper_orders WHERE status='queued'").fetchall()
    dist = collections.Counter((r[1], r[2], r[3], r[7]) for r in rows)
    print(f"대기 주문 {len(rows)}건")
    for (market, symbol, side, reason), n in dist.most_common():
        print(f"  {market} {symbol} {side} {reason} — {n}")
    tracks = db.execute("SELECT market, status, stop_reason FROM stock_paper_tracks ORDER BY market").fetchall()
    print("트랙", tracks)

    if not apply:
        print("\n(미리보기 — 바꾸려면 --apply)")
        return 0

    now = datetime.now(timezone.utc).isoformat()
    if rows:
        os.makedirs("backups", exist_ok=True)
        snap = f"backups/ops02-queued-orders-{now[:10]}.jsonl"
        with open(snap, "a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(dict(zip(COLUMNS, r)), ensure_ascii=False) + "\n")
        print(f"스냅샷 {snap} ({len(rows)}건)")
        with db:
            for r in rows:
                payload = json.loads(r[8])
                payload.update(status="cancelled", reason=REASON, stale_note=NOTE, cancelled_at=now)
                db.execute(
                    "UPDATE stock_paper_orders SET status='cancelled', reason=?, payload=?, updated_at=? WHERE id=? AND status='queued'",
                    (REASON, json.dumps(payload, ensure_ascii=False), now, r[0]),
                )
        left = db.execute("SELECT COUNT(*) FROM stock_paper_orders WHERE status='queued'").fetchone()[0]
        print(f"폐기 {len(rows)}건 · 남은 대기 {left}")

    if resume_us:
        left = db.execute("SELECT COUNT(*) FROM stock_paper_orders WHERE status='queued' AND market='US'").fetchone()[0]
        if left:
            print(f"US 대기 주문이 {left}건 남아 있다 — 재개하지 않는다", file=sys.stderr)
            return 1
        with db:
            db.execute(
                "UPDATE stock_paper_tracks SET status='running', stop_reason=NULL, updated_at=? WHERE market='US' AND status='stopped'",
                (now,),
            )
        print("US 트랙", db.execute("SELECT status, stop_reason FROM stock_paper_tracks WHERE market='US'").fetchone())
        print("재개 사유: 봉 불일치 수리(de609317 · 8/31) 배포 확인 · 과거 US 체결 재검사 위반 0 · 대기 주문 폐기 (OPS-02)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
