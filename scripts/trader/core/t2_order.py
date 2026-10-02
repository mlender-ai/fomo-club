"""TRADER-02 — 순서를 **코드로** 지킨다.

| 지시서 | 여기서 막는 것 |
|---|---|
| A  "광혁이 먼저 쓰고, 그다음 데이터를 본다" | 진술을 봉인(시각 · 지문)하기 전엔 분할 · 분석이 안 돈다 |
| B-1 "앞 70% / 뒤 30% 를 먼저 고정" | 분할을 한 번 고정하면 다시 못 자른다(`--force` 는 기록에 남는다) |
| B "뒤 30% 를 보지 않는다" | 분석은 `train_trades()` 로만 거래를 받는다 — 뒤 30% 를 돌려주는 함수가 분석 쪽에 없다 |
| E "여기서 처음으로 뒤 30% 를 본다" | `test_trades()` 는 두 규칙이 **동결된 뒤에만** 연다 |
| 하지 말 것 "뒤 30% 를 보면서 규칙을 다듬지 말 것" | 검증 뒤 규칙이 바뀌면 지문이 달라져 **모든 보고서에 '검증 후 수정' 이 찍힌다** |

모든 단계는 `t2_log` 에 시각과 함께 남는다(완료 확인 1 · 2 의 근거).
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

from .store import Store
from .timeutil import iso

STATED = "stated-rules.md"
VERSIONS = ("광혁-말", "광혁-데이터")
TRAIN_SHARE = 0.7

LOG_SCHEMA = "CREATE TABLE IF NOT EXISTS t2_log (at INTEGER, step TEXT, detail TEXT)"


class OrderError(RuntimeError):
    """순서를 어겼다. 메시지는 무엇을 먼저 해야 하는지 말한다."""


def now_ms() -> int:
    return int(time.time() * 1000)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def t2_dir(store: Store) -> Path:
    d = store.dir / "trader02"
    d.mkdir(mode=0o700, exist_ok=True)
    (d / "rules").mkdir(mode=0o700, exist_ok=True)
    (d / "work").mkdir(mode=0o700, exist_ok=True)
    return d


def log(store: Store, step: str, detail: dict | None = None) -> None:
    store.conn.execute(LOG_SCHEMA)
    store.conn.execute("INSERT INTO t2_log VALUES (?, ?, ?)", (now_ms(), step, json.dumps(detail or {}, ensure_ascii=False)))
    store.conn.commit()


def history(store: Store) -> list[dict]:
    store.conn.execute(LOG_SCHEMA)
    rows = store.conn.execute("SELECT at, step, detail FROM t2_log ORDER BY at, rowid").fetchall()
    return [{"at": r[0], "step": r[1], "detail": json.loads(r[2])} for r in rows]


def first(store: Store, step: str) -> dict | None:
    return next((h for h in history(store) if h["step"] == step), None)


def _meta(store: Store, key: str) -> Any:
    raw = store.meta(f"t2:{key}")
    return json.loads(raw) if raw else None


def _set(store: Store, key: str, value: Any) -> None:
    store.set_meta(f"t2:{key}", json.dumps(value, ensure_ascii=False))


# ── A 진술 ──────────────────────────────────────────────────────────────


def stated_path(store: Store) -> Path:
    return t2_dir(store) / STATED


def init_stated(store: Store, template: Path) -> Path:
    path = stated_path(store)
    if path.exists():
        return path
    path.write_text(template.read_text(encoding="utf-8"), encoding="utf-8")
    path.chmod(0o600)
    log(store, "init_stated", {"template_sha": sha(template.read_bytes())})
    return path


def seal_stated(store: Store, answers: dict, force: bool = False) -> dict:
    """봉인. 빈 칸이 있으면 거부(모르면 '모름' 이라고 쓴다). 분석이 이미 돌았으면 그 사실을 남긴다."""
    path = stated_path(store)
    if not path.exists():
        raise OrderError("진술 파일이 없다 — 먼저 `init-stated` 로 만들고 답을 쓴다")
    blanks = [k for k, v in answers.items() if not k.startswith("N.") and not v["answer"].strip()]
    if blanks:
        raise OrderError(f"빈 서술 칸 {len(blanks)}개: {', '.join(blanks)} — 모르면 '모름' 이라고 쓴다")
    prev = _meta(store, "stated_seal")
    if prev and not force:
        raise OrderError(f"이미 봉인했다({iso(prev['at'])}). 다시 봉인하면 '봉인 후 수정' 으로 남는다 — `--force`")
    seen_data = [h["step"] for h in history(store) if h["step"] in ("split", "describe", "candidates")]
    t1 = store.conn.execute("SELECT MIN(at) FROM reports").fetchone()[0]
    seal = {
        "at": now_ms(),
        "sha": sha(path.read_bytes()),
        "file_mtime": int(path.stat().st_mtime * 1000),
        "answered": sum(1 for v in answers.values() if v["answer"].strip()),
        "questions": len(answers),
        "resealed": bool(prev),
        "analysis_before_seal": seen_data,
        "trader01_report_before_seal": t1 is not None,
        "trader01_first_report_at": t1,
    }
    _set(store, "stated_seal", seal)
    (t2_dir(store) / "stated.json").write_text(json.dumps(answers, ensure_ascii=False, indent=2), encoding="utf-8")
    log(store, "seal_stated" if not prev else "reseal_stated", seal)
    return seal


def stated_seal(store: Store) -> dict | None:
    return _meta(store, "stated_seal")


def require_stated(store: Store) -> dict:
    seal = stated_seal(store)
    if not seal:
        raise OrderError("광혁 진술이 봉인되지 않았다 — 데이터를 보기 전에 `init-stated` → 작성 → `seal-stated` (지시서 PART A)")
    current = sha(stated_path(store).read_bytes())
    if current != seal["sha"]:
        raise OrderError("봉인 뒤 진술 파일이 바뀌었다. 데이터를 본 뒤 고친 진술은 '말한 매매법' 이 아니다 — 되돌리거나 `seal-stated --force`(기록에 남는다)")
    return seal


# ── B-1 분할 ────────────────────────────────────────────────────────────


def split(store: Store, trades: list[dict], force: bool = False) -> dict:
    """앞 70% 기간 / 뒤 30% 기간. **기간**(시각)으로 자른다.

    앞 = 자르는 시각 **전에 청산까지 끝난** 거래, 뒤 = 그 시각 **뒤에 진입한** 거래.
    걸친 거래는 어느 쪽에도 넣지 않는다 — 앞에 넣으면 뒤 기간 가격을 본 결과가 섞이고,
    뒤에 넣으면 앞 기간에 시작한 판단을 검증하게 된다. 몇 건인지는 기록한다.
    """
    require_stated(store)
    prev = _meta(store, "split")
    if prev and not force:
        raise OrderError(f"분할은 이미 고정됐다({iso(prev['at'])} · 자른 시각 {iso(prev['cut'])}). 다시 자르지 않는다")
    if not trades:
        raise OrderError("거래가 없다 — TRADER-01 을 먼저 돌린다")
    start = min(t["entry_ms"] for t in trades)
    end = max(t["exit_ms"] for t in trades)
    cut = int(start + (end - start) * TRAIN_SHARE)
    train = sorted(t["id"] for t in trades if t["exit_ms"] <= cut)
    test = sorted(t["id"] for t in trades if t["entry_ms"] >= cut)
    straddle = sorted(t["id"] for t in trades if t["entry_ms"] < cut < t["exit_ms"])
    info = {
        "at": now_ms(),
        "start": start,
        "cut": cut,
        "end": end,
        "train": len(train),
        "test": len(test),
        "straddle": len(straddle),
        "train_sha": sha("\n".join(train).encode()),
        "test_sha": sha("\n".join(test).encode()),
        "forced": bool(prev),
    }
    _set(store, "split", info)
    _set(store, "split_ids", {"train": train, "test": test, "straddle": straddle})
    log(store, "split" if not prev else "resplit", info)
    return info


def split_info(store: Store) -> dict | None:
    return _meta(store, "split")


def train_trades(store: Store, trades: list[dict]) -> list[dict]:
    """분석(B · C · D)이 받는 **유일한** 거래 목록. 뒤 30% 는 여기서 나오지 않는다."""
    require_stated(store)
    ids = _meta(store, "split_ids")
    if not ids:
        raise OrderError("분할이 고정되지 않았다 — `split` 먼저(지시서 B-1)")
    keep = set(ids["train"])
    return [t for t in trades if t["id"] in keep]


# ── D → E 동결 ──────────────────────────────────────────────────────────


def rule_path(store: Store, version: str) -> Path:
    return t2_dir(store) / "rules" / f"{version}.json"


def rule_hashes(store: Store) -> dict[str, str | None]:
    out = {}
    for v in VERSIONS:
        p = rule_path(store, v)
        out[v] = sha(p.read_bytes()) if p.exists() else None
    return out


def freeze(store: Store) -> dict:
    """두 규칙을 동결한다. 검증(E)은 동결된 지문과 같은 파일로만 돈다."""
    hashes = rule_hashes(store)
    missing = [v for v, h in hashes.items() if h is None]
    if missing:
        raise OrderError(f"규칙 파일이 없다: {', '.join(missing)} — D 를 먼저")
    for v in VERSIONS:
        body = json.loads(rule_path(store, v).read_text(encoding="utf-8"))
        if "_todo" in json.dumps(body, ensure_ascii=False):
            raise OrderError(f"{v} 에 아직 채우지 않은 칸(_todo)이 있다 — 광혁 확인을 받아 채운다")
    validated = first(store, "validate") is not None
    info = {"at": now_ms(), "hashes": hashes, "after_validation": validated}
    prev = _meta(store, "freezes") or []
    prev.append(info)
    _set(store, "freezes", prev)
    log(store, "freeze_after_validation" if validated else "freeze", info)
    return info


def require_frozen(store: Store) -> dict:
    freezes = _meta(store, "freezes") or []
    if not freezes:
        raise OrderError("규칙이 동결되지 않았다 — `freeze` 먼저. 뒤 30% 는 동결된 규칙으로만 본다")
    last = freezes[-1]
    if rule_hashes(store) != last["hashes"]:
        raise OrderError("동결 뒤 규칙 파일이 바뀌었다 — 다시 `freeze` 해야 한다(검증 뒤라면 기록에 남는다)")
    return last


def test_trades(store: Store, trades: list[dict]) -> list[dict]:
    """뒤 30%. **동결된 뒤에만** 연다."""
    require_frozen(store)
    ids = _meta(store, "split_ids") or {}
    keep = set(ids.get("test", []))
    return [t for t in trades if t["id"] in keep]


def contamination(store: Store) -> list[str]:
    """보고서 머리에 찍을 경고. 비어 있으면 순서를 다 지켰다."""
    out = []
    seal = stated_seal(store)
    if seal and seal.get("analysis_before_seal"):
        out.append(f"진술 봉인 전에 분석이 돌았다: {', '.join(seal['analysis_before_seal'])}")
    if seal and seal.get("resealed"):
        out.append("진술을 봉인 뒤 다시 봉인했다")
    if seal and seal.get("trader01_report_before_seal"):
        out.append("진술 봉인 전에 TRADER-01 계좌 보고서(손익 · 승률)가 만들어졌다 — 매매법 질문엔 영향이 작지만 기록해 둔다")
    split_meta = split_info(store)
    if split_meta and split_meta.get("forced"):
        out.append("분할을 다시 잘랐다")
    freezes = _meta(store, "freezes") or []
    after = [f for f in freezes if f.get("after_validation")]
    if after:
        out.append(f"**검증 후 규칙 수정 {len(after)}회** — 그 뒤 검증 결과는 뒤 30% 에 맞춘 것이라 매매법의 증거가 못 된다")
    return out
