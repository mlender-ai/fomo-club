"""PART A-7 — 광혁 답변을 **질문 순서대로 구조화만** 한다. 해석을 덧붙이지 않는다.

서술 칸(`[A…]`)은 글 그대로 둔다. 숫자 칸(`[N.…]`)만 숫자 · 예/아니오 · 목록으로 읽는다 —
읽을 수 없으면 `None` 이고 원문은 `answer` 에 그대로 있다(추측하지 않는다).
"""
from __future__ import annotations

import re

QUESTION = re.compile(r"^\s*-\s*\[(?P<id>[AN][0-9A-Za-z_.]*)\]\s*(?P<q>[^:：]*)[:：]?\s*(?P<rest>.*)$")
SECTION = re.compile(r"^\s*#{1,6}\s")
YES = {"예", "네", "yes", "y", "o", "응", "함", "한다", "true"}
NO = {"아니오", "아니요", "no", "n", "x", "안함", "안 한다", "false"}
UNKNOWN = {"모름", "모르겠다", "?", "-"}


def parse(text: str) -> dict[str, dict]:
    """{질문 id: {question, answer, value}} — 파일에 나온 순서 그대로."""
    out: dict[str, dict] = {}
    current: str | None = None
    for line in text.splitlines():
        m = QUESTION.match(line)
        if m:
            current = m.group("id")
            out[current] = {"question": m.group("q").strip(), "answer": m.group("rest").strip()}
            continue
        if SECTION.match(line) or line.strip().startswith(">"):
            current = None
            continue
        if current and line.strip():
            prev = out[current]["answer"]
            out[current]["answer"] = (prev + "\n" + line.strip()).strip()
    for qid, item in out.items():
        item["value"] = value_of(qid, item["answer"]) if qid.startswith("N.") else None
    return out


def value_of(qid: str, answer: str):
    text = answer.strip()
    if not text or text in UNKNOWN:
        return None
    key = qid.split(".", 1)[1]
    if key == "symbols":
        items = [s.strip().upper() for s in re.split(r"[,\s]+", text) if s.strip()]
        return items or None
    if key == "side":
        low = text.lower()
        return low if low in ("long", "short", "both") else None
    if key in ("split_entry", "stop_order", "reentry_after_stop", "scale_out"):
        low = text.lower()
        if low in YES:
            return True
        if low in NO:
            return False
        return None
    m = re.fullmatch(r"[-+]?\d+(?:\.\d+)?\s*%?", text.replace(",", ""))
    return float(m.group(0).rstrip("%").strip()) if m else None


def values(answers: dict[str, dict]) -> dict:
    return {qid[2:]: item["value"] for qid, item in answers.items() if qid.startswith("N.")}


def stated_definition(answers: dict[str, dict]) -> dict:
    """`광혁-말` 뼈대 — **숫자 칸만** 옮긴다. 진입 조건은 서술이라 기계가 못 옮긴다 → `_todo`.

    `_todo` 가 남아 있으면 동결(`freeze`)이 거부한다. 진입 조건은 광혁 서술(A-2)을 에이전트가
    지표 이름으로 옮겨 적고 **광혁이 확인**한다 — 데이터는 보지 않고, 서술만 보고.
    """
    v = values(answers)
    todo: list[str] = []
    stop = v.get("stop_pct")
    if stop is not None and stop > 0:
        stop = -stop  # "3" 이라고 써도 손절은 음수다 — 부호만 맞춘다
    if stop is None:
        todo.append("exit.stop_pct — 손절 % 숫자 칸이 비었다(A-4 서술에서 광혁이 정한다)")
    exit_rules: dict = {"stop_pct": stop if stop is not None else "_todo", "target_pct": None}
    if v.get("scale_out") and v.get("first_tp_pct"):
        first = round(min(max((v.get("first_tp_size_pct") or 50.0) / 100.0, 0.05), 1.0), 2)
        legs: list[dict] = [{"at_pct": v["first_tp_pct"], "size": first}]
        rest = round(1.0 - first, 2)
        if rest > 0:
            if v.get("trail_pct"):
                legs.append({"trail": {"pct": v["trail_pct"], "activate_pct": v["first_tp_pct"]}, "size": rest})
            else:
                todo.append("exit.scale_out — 끌고 가는 몫을 어떻게 파는지 숫자 칸이 비었다")
                legs.append({"_todo": "남은 몫 청산 방식", "size": rest})
        exit_rules["scale_out"] = legs
    elif v.get("first_tp_pct"):
        exit_rules["target_pct"] = v["first_tp_pct"]
    if v.get("max_hold_hours"):
        exit_rules["max_hold_days"] = round(v["max_hold_hours"] / 24, 4)
    leverage = v.get("leverage") or 1
    margin = v.get("margin_pct")
    if margin is None:
        todo.append("sizing — 증거금 비율 숫자 칸이 비었다")
    pause = None
    if v.get("pause_after_losses") and v.get("pause_minutes"):
        pause = {"after_consecutive_losses": int(v["pause_after_losses"]), "minutes": v["pause_minutes"]}
    side = v.get("side") or "long"
    definition = {
        "name": "광혁-말",
        "source": "stated",
        "market": "crypto",
        "universe": {"type": "list", "symbols": v.get("symbols") or ["_todo"]},
        "side": side,
        "entry": {"all": [{"indicator": "_todo", "_todo": "A-2 서술(반드시 확인하는 것)을 지표로 — 광혁 확인"}]},
        "exit": exit_rules,
        "sizing": {"type": "fixed_pct", "fixed_pct": min(margin, 100.0) if margin else "_todo"},
        "leverage": max(1, leverage),
        "max_positions": 3,
        "pause": pause,
    }
    if side == "both":
        definition["entry_short"] = {"all": [{"indicator": "_todo", "_todo": "숏 진입 조건 — 광혁 확인"}]}
    if not v.get("symbols"):
        todo.append("universe — 종목 목록 숫자 칸이 비었다")
    definition["_todo_list"] = todo + ["entry — A-2 서술을 지표 조건으로(에이전트가 옮기고 광혁이 확인)"]
    return definition
