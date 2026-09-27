"""FCE 가 라이브 계좌 포지션에만 붙이는 분석을 **페이퍼 포지션에** 돌린다 — FCE 자신의 함수로, 읽기 전용 (UI-10 B).

FCE 는 건강도 · 지금 볼 것 · 패턴 시간봉을 Bitget 실계좌 포지션(`/api/live/positions`)에만 계산한다.
같은 함수를 **메모리 안의 포지션**(페이퍼 거래의 심볼 · 방향 · 진입가 · 배수 · 현재가)에 부른다.

| 칸 | FCE 함수 |
|---|---|
| 건강도 · 상태 | `positions.engine.build_position_state` + `make_snapshot` |
| 지금 볼 것 · 무효화 · 익절 · 판정 | `positions.action_plan.build_action_plan` |
| 패턴 시간봉 | `positions.pattern_matrix.build_pattern_matrix` |
| 시장 스냅샷 · 리포트 | FCE 시세 공급자(`exchange.factory`) · `report.engine.generate_report` |

**DB 를 열지 않는다** — 저장소(`repository`)를 쓰는 함수는 부르지 않는다(`_live_position_payload` 는 리포트를 저장하고
포지션을 갱신하므로 쓰지 않는다). FCE 레포는 건드리지 않는다.

    cd "<FCE>/backend" && python3 <이 파일> < positions.json
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from uuid import UUID, uuid5, NAMESPACE_URL

sys.path.insert(0, os.getcwd())

from app.core.config import get_settings  # noqa: E402
from app.db.models import Direction, Position  # noqa: E402
from app.exchange.factory import create_market_data_provider  # noqa: E402
from app.positions.action_plan import build_action_plan  # noqa: E402
from app.positions.engine import build_position_state, make_snapshot  # noqa: E402
from app.positions.pattern_matrix import build_pattern_matrix  # noqa: E402
from app.report.engine import generate_report  # noqa: E402


def context_from_report(report) -> dict:
    """`http_handlers._action_plan_context_from_report` 와 같은 칸(파생 데이터 없이 — 저장소를 열지 않는다)."""
    raw = report.raw_json if isinstance(report.raw_json, dict) else {}
    levels = raw.get("structure_levels") if isinstance(raw.get("structure_levels"), dict) else {}
    return {
        "mark_price": report.price,
        "price_levels": {"support": levels.get("support", []), "resistance": levels.get("resistance", []), "invalidation": []},
        "liquidity": raw.get("liquidity", {}) if isinstance(raw.get("liquidity"), dict) else {},
        "derivatives": {},
        "volume_profile": raw.get("volume_profile", {}) if isinstance(raw.get("volume_profile"), dict) else {},
        "volume_xray": raw.get("volume_xray", {}) if isinstance(raw.get("volume_xray"), dict) else {},
        "candles": raw.get("candles", []) if isinstance(raw.get("candles"), list) else [],
    }


def compact_matrix(m: dict) -> list[dict]:
    out = []
    for row in m.get("timeframes", []):
        w = row.get("wyckoff") or {}
        h = row.get("harmonic") or {}
        best = h.get("best_pattern") or {}
        out.append({
            "timeframe": row.get("timeframe"),
            "status": row.get("status"),
            "wyckoffPhase": w.get("phase"),
            "wyckoffDetected": bool(w.get("detected")),
            "wyckoffEvents": [str(e.get("label") or e.get("type") or "") for e in (w.get("events") or [])][:3],
            "rangeDetected": bool(w.get("range_detected")),
            "harmonic": best.get("name") if isinstance(best, dict) else None,
            "harmonicScore": best.get("score") if isinstance(best, dict) else None,
            "harmonicCount": h.get("pattern_count") or 0,
        })
    return out


def analyze(p: dict, provider) -> dict:
    position = Position(
        id=uuid5(NAMESPACE_URL, f"lab-paper:{p['id']}"),
        symbol=p["symbol"],
        direction=Direction.long if p["direction"] == "long" else Direction.short,
        entry_price=float(p["entryPrice"]),
        quantity=float(p.get("quantity") or 1.0),
        leverage=float(p.get("leverage") or 1.0),
        mark_price=p.get("markPrice"),
    )
    snap4h = provider.get_snapshot(p["symbol"], "4h")
    report = generate_report(snap4h)
    state = build_position_state(position, report, [])
    snapshot = make_snapshot(position, state)
    plan = build_action_plan(position, snapshot, context_from_report(report))
    matrix = build_pattern_matrix(p["symbol"], provider.get_snapshot)
    return {
        "asOf": datetime.now(timezone.utc).isoformat(),
        "healthScore": state.get("health_score"),
        "statusLabel": state.get("status_label"),
        "verdictState": plan.get("verdict_state"),
        "headline": plan.get("headline_action"),
        "watch": [{"condition": w.get("condition"), "meaning": w.get("meaning")} for w in (plan.get("watch_triggers") or [])][:3],
        "patterns": compact_matrix(matrix),
    }


if __name__ == "__main__":
    positions = json.load(sys.stdin)
    provider = create_market_data_provider(get_settings())
    out = {}
    for p in positions:
        try:
            out[p["id"]] = analyze(p, provider)
        except Exception as exc:  # 한 포지션이 안 돼도 나머지는 낸다
            out[p["id"]] = {"error": str(exc)[:200]}
    print(json.dumps(out, ensure_ascii=False, default=str))
