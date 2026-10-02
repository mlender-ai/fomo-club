"""랩 엔진(`packages/lab`) 부르기 — `npx tsx scripts/trader/engine.ts in.json out.json`.

입출력 파일은 비공개 자리(`trader02/work/`)에 둔다. 엔진 쪽은 네트워크 · DB 를 쓰지 않는다.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
BRIDGE = REPO / "scripts" / "trader" / "engine.ts"


class EngineError(RuntimeError):
    pass


def available() -> bool:
    return shutil.which("npx") is not None and (REPO / "node_modules" / ".bin" / "tsx").exists()


def call(payload: dict, work: Path) -> dict:
    if not available():
        raise EngineError("랩 엔진을 부를 수 없다 — 레포에서 `npm ci` 를 먼저(node_modules/.bin/tsx 가 필요하다)")
    tag = uuid.uuid4().hex[:8]
    src, dst = work / f"in-{tag}.json", work / f"out-{tag}.json"
    src.write_text(json.dumps(payload), encoding="utf-8")
    try:
        done = subprocess.run(
            [str(REPO / "node_modules" / ".bin" / "tsx"), str(BRIDGE), str(src), str(dst)],
            cwd=REPO,
            capture_output=True,
            text=True,
            timeout=1800,
            env={**os.environ, "NODE_NO_WARNINGS": "1"},
        )
        if done.returncode != 0:
            raise EngineError(f"엔진 실패: {done.stderr.strip()[-800:]}")
        return json.loads(dst.read_text(encoding="utf-8"))
    finally:
        # 거래 데이터가 든 중간 파일은 남기지 않는다(비공개 자리라도).
        for p in (src, dst):
            if p.exists():
                p.unlink()


def strip(definition: dict) -> dict:
    """엔진에 넘길 모양 — 이름 · 출처 · 메모 키를 뺀다(스키마가 모르는 키)."""
    return {k: v for k, v in definition.items() if k not in ("name", "source", "_todo_list", "derived_from", "notes")}


def rows(candles: list[tuple]) -> list[list]:
    return [[int(c[0]), c[1], c[2], c[3], c[4], c[5]] for c in candles]
