"""TRADER-02 단계 묶음. 각 단계는 비공개 저장소만 읽고 쓴다(`~/.fomo/trader/`)."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from . import t2_analysis as an
from . import t2_data as data
from . import t2_order as order
from . import t2_rules as rules
from . import t2_stated as stated
from . import t2_validate as val
from .pipeline import load_bills
from .store import Store
from .t2_engine import call, strip
from .timeutil import HOUR_MS, iso

ANALYSIS = "analysis.json"


def all_trades(store: Store) -> list[dict]:
    return store.payloads("trades")


def contexts(store: Store) -> dict[str, dict]:
    return {r[0]: json.loads(r[1]) for r in store.conn.execute("SELECT trade_id, payload FROM trade_context").fetchall()}


def answers(store: Store) -> dict:
    return stated.parse(order.stated_path(store).read_text(encoding="utf-8"))


def write_private(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    path.chmod(0o600)
    return path


# ── B · C ───────────────────────────────────────────────────────────────


def analyze(store: Store, fce: sqlite3.Connection | None) -> dict:
    """B-2 ~ B-5 + C. 앞 70% 만."""
    train = order.train_trades(store, all_trades(store))
    split = order.split_info(store)
    ctx = contexts(store)
    bills = load_bills(store)
    order.log(store, "describe", {"train": len(train)})
    desc = an.describe(train, ctx, bills)

    order.log(store, "candidates", {})
    symbols = sorted({t["symbol"] for t in train})
    bars = data.bars(store, symbols, split["start"], split["cut"])
    bars = {s: [r for r in rows if r[0] + HOUR_MS <= split["cut"]] for s, rows in bars.items()}
    whales = data.whales(fce, bars)
    feats = call({"cmd": "features", "bars": bars, "whale": whales, "specs": an.FEATURE_SPECS, "maxWindowBars": an.WINDOW_BARS}, order.t2_dir(store) / "work")
    chosen: dict[str, dict | None] = {}
    cand: dict[str, dict] = {}
    met: dict[str, int] = {}
    for direction in ("long", "short"):
        n = desc["sides"][direction]
        if n < an.MIN_ENTRIES:
            cand[direction] = {"skipped": f"진입 {n}건 — {an.MIN_ENTRIES}건 미만이라 후보를 안 만든다"}
            chosen[direction] = None
            continue
        grid = an.Grid(an.FEATURE_SPECS, bars, feats, train, direction, split["cut"])
        res = an.candidates(grid)
        mask = res.pop("_chosen_mask")
        cand[direction] = res
        chosen[direction] = res["chosen"]
        if res["chosen"]:
            met.update(_conditions_met(grid, res["chosen"], mask))
    exits = an.exit_rules(train, ctx, desc)
    size = an.sizing(train, ctx, bills, desc["_streak_rows"], met)
    pause = an.pause_rule(desc["_streak_rows"])
    compare = rules.stated_vs_revealed(answers(store), desc, exits, size, pause, train)
    desc.pop("_streak_rows")
    result = {
        "at": order.now_ms(),
        "split": split,
        "describe": desc,
        "candidates": cand,
        "exits": exits,
        "sizing": size,
        "pause": pause,
        "compare": compare,
        "symbols": symbols,
        "whales_symbols": sorted(whales),
    }
    write_private(order.t2_dir(store) / ANALYSIS, json.dumps(result, ensure_ascii=False, indent=1))
    order.log(store, "analyze_done", {"symbols": len(symbols)})
    return result


def _conditions_met(grid: an.Grid, chosen: dict, mask: int) -> dict[str, int]:
    """진입 봉에서 고른 규칙의 조건이 몇 개 참이었나(B-5 '진입 조건 개수')."""
    del mask
    out = {}
    specs = [an.spec_key(grid.specs[j]) for j in range(len(grid.specs))]
    conds = []
    for c in chosen["conditions"]:
        base = {k: v for k, v in c.items() if k not in ("min", "max")}
        j = specs.index(an.spec_key(base))
        conds.append((j, "min" if "min" in c else "max", c.get("min", c.get("max"))))
    for i, ids in grid.positive_ids.items():
        n = 0
        for j, op, th in conds:
            v = grid.values[j][i]
            if v is not None and (v >= th if op == "min" else v <= th):
                n += 1
        for tid in ids:
            out[tid] = n
    return out


def load_analysis(store: Store) -> dict:
    p = order.t2_dir(store) / ANALYSIS
    if not p.exists():
        raise order.OrderError("분석 결과가 없다 — `analyze` 먼저")
    return json.loads(p.read_text(encoding="utf-8"))


# ── D ───────────────────────────────────────────────────────────────────


def build_rules(store: Store) -> dict:
    order.require_stated(store)
    a = load_analysis(store)
    out = {}
    said_path = order.rule_path(store, "광혁-말")
    if not said_path.exists():
        write_private(said_path, json.dumps(stated.stated_definition(answers(store)), ensure_ascii=False, indent=2))
        out["광혁-말"] = "뼈대를 만들었다 — `_todo` 칸은 광혁 확인으로 채운다"
    else:
        out["광혁-말"] = "이미 있다(덮어쓰지 않는다)"
    chosen = {d: (c.get("chosen") if isinstance(c, dict) else None) for d, c in a["candidates"].items()}
    data_def = rules.data_definition(chosen, a["exits"], a["sizing"], a["pause"], a["symbols"], a["describe"]["concurrent"]["p90"])
    write_private(order.rule_path(store, "광혁-데이터"), json.dumps(data_def, ensure_ascii=False, indent=2))
    out["광혁-데이터"] = "만들었다"
    order.log(store, "build_rules", out)
    return out


def check_rules(store: Store) -> dict:
    """두 정의가 랩 스키마를 통과하나(엔진이 바로 돌릴 수 있나)."""
    res = {}
    for v in order.VERSIONS:
        body = json.loads(order.rule_path(store, v).read_text(encoding="utf-8"))
        res[v] = call({"cmd": "validate", "definition": strip(body)}, order.t2_dir(store) / "work")
    return res


# ── E ───────────────────────────────────────────────────────────────────


def replay(store: Store, fce, definition: dict, start: int, end: int, capital: float, fee: float, state=None) -> dict:
    symbols = definition["universe"]["symbols"]
    bars = data.bars(store, symbols, start, end)
    return call(
        {
            "cmd": "replay",
            "definition": strip(definition),
            "bars": bars,
            "funding": data.funding(store, symbols, bars),
            "whale": data.whales(fce, bars),
            "capital": capital,
            "takerFeeRate": fee,
            "startMs": start,
            "maxWindowBars": an.WINDOW_BARS,
            **({"state": state} if state else {}),
        },
        order.t2_dir(store) / "work",
    )


def validate(store: Store, fce) -> dict:
    frozen = order.require_frozen(store)
    trades = all_trades(store)
    split = order.split_info(store)
    train = order.train_trades(store, trades)
    actual = order.test_trades(store, trades)
    order.log(store, "validate", {"frozen_at": frozen["at"], "test": len(actual)})
    bills = load_bills(store)
    capital = an.equity_at(bills, split["cut"]) or 1000.0
    fee = data.fee_rate(train)
    results = {}
    for v in order.VERSIONS:
        body = json.loads(order.rule_path(store, v).read_text(encoding="utf-8"))
        results[v] = replay(store, fce, body, split["cut"], split["end"], capital, fee)
    ev = val.evaluate(actual, results)
    follow = val.follows(ev["table"]["광혁 실계좌"], ev["table"].get("광혁-데이터", {})) if results["광혁-데이터"].get("ok") else None
    disc = {v: val.discretionary(actual, ev["matched"].get(v, set())) for v in order.VERSIONS if v in ev["matched"]}
    store.conn.execute("CREATE TABLE IF NOT EXISTS t2_discretionary (trade_id TEXT, version TEXT, period TEXT, at INTEGER, PRIMARY KEY (trade_id, version, period))")
    for v, d in disc.items():
        for tid in d["ids"]:
            store.conn.execute("INSERT OR REPLACE INTO t2_discretionary VALUES (?, ?, 'test', ?)", (tid, v, order.now_ms()))
    store.conn.commit()
    out = {
        "at": order.now_ms(),
        "capital": capital,
        "fee_rate": fee,
        "period": [split["cut"], split["end"]],
        "table": ev["table"],
        "follows": follow,
        "discretionary": {v: {k: x for k, x in d.items() if k != "ids"} for v, d in disc.items()},
        "contamination": order.contamination(store),
        "frozen": frozen,
    }
    write_private(order.t2_dir(store) / "validation.json", json.dumps(out, ensure_ascii=False, indent=1))
    order.log(store, "validate_done", {"verdict": follow["verdict"] if follow else None})
    return out


# ── F 페이퍼(비공개) ────────────────────────────────────────────────────

PAPER_SCHEMA = """
CREATE TABLE IF NOT EXISTS t2_paper_trades (key TEXT PRIMARY KEY, symbol TEXT, side TEXT, entry_ms INTEGER, exit_ms INTEGER, payload TEXT);
"""


def paper_start(store: Store) -> dict:
    v = json.loads((order.t2_dir(store) / "validation.json").read_text(encoding="utf-8")) if (order.t2_dir(store) / "validation.json").exists() else None
    if not v:
        raise order.OrderError("검증(E)이 없다 — `validate` 먼저. 따라가든 못 따라가든 검증 뒤 페이퍼로 올린다")
    prev = store.meta("t2:paper")
    if prev:
        return json.loads(prev)
    follow = (v.get("follows") or {}).get("verdict")
    meta = {
        "start_ms": (order.now_ms() // HOUR_MS) * HOUR_MS,
        "version": "광혁-데이터",
        "rule_sha": order.rule_hashes(store)["광혁-데이터"],
        "verdict": follow,
        # 지시서 F: 따라가지 못해도 페이퍼로 올린다 — 비교 대상으로. 단 실매매 후보에서는 뺀다.
        "live_candidate": follow == "따라간다",
        "capital": v["capital"],
        "fee_rate": v["fee_rate"],
    }
    store.set_meta("t2:paper", json.dumps(meta, ensure_ascii=False))
    store.conn.executescript(PAPER_SCHEMA)
    order.log(store, "paper_start", meta)
    return meta


def paper_tick(store: Store, fce, now: int) -> dict:
    """새로 닫힌 봉으로 한 번 돈다. 상태는 비공개 DB 에. 랩 DB · 공개 사이트에는 쓰지 않는다."""
    raw = store.meta("t2:paper")
    if not raw:
        raise order.OrderError("페이퍼가 시작되지 않았다 — `paper-start`")
    meta = json.loads(raw)
    body = json.loads(order.rule_path(store, meta["version"]).read_text(encoding="utf-8"))
    if order.rule_hashes(store)[meta["version"]] != meta["rule_sha"]:
        raise order.OrderError("페이퍼 시작 뒤 규칙 파일이 바뀌었다 — 페이퍼는 시작할 때의 규칙으로만 돈다")
    store.conn.executescript(PAPER_SCHEMA)
    state_raw = store.meta("t2:paper_state")
    last = int(store.meta("t2:paper_last_bar") or meta["start_ms"])
    end = (now // HOUR_MS) * HOUR_MS  # 이 시각 전에 열린 봉 = 닫힌 봉
    symbols = body["universe"]["symbols"]
    if state_raw:
        bars = {s: [r for r in rows if r[0] >= last] for s, rows in data.bars(store, symbols, last, end).items()}
        payload = {
            "cmd": "replay",
            "definition": strip(body),
            "bars": bars,
            "funding": data.funding(store, symbols, bars),
            "whale": data.whales(fce, bars),
            "capital": meta["capital"],
            "takerFeeRate": meta["fee_rate"],
            "state": json.loads(state_raw),
            "maxWindowBars": an.WINDOW_BARS,
        }
        res = call(payload, order.t2_dir(store) / "work")
    else:
        res = replay(store, fce, body, meta["start_ms"], end, meta["capital"], meta["fee_rate"])
    if not res.get("ok"):
        raise order.OrderError(f"정의가 엔진을 통과하지 못했다: {res.get('errors')}")
    for t in res["trades"]:
        key = f"{t['symbol']}:{t['side']}:{t['entryAt']}"
        store.conn.execute("INSERT OR REPLACE INTO t2_paper_trades VALUES (?, ?, ?, ?, ?, ?)", (key, t["symbol"], t["side"], t["entryAt"], t["exitAt"], json.dumps(t)))
    store.set_meta("t2:paper_state", json.dumps(res["state"]))
    store.set_meta("t2:paper_last_bar", str(end))
    store.conn.commit()
    return {"new_trades": len(res["trades"]), "open": res["open"], "until": iso(end), "blocked": res["blocked"]}


def paper_status(store: Store) -> dict:
    meta = json.loads(store.meta("t2:paper") or "null")
    if not meta:
        return {"started": False}
    store.conn.executescript(PAPER_SCHEMA)
    replica = [json.loads(r[0]) for r in store.conn.execute("SELECT payload FROM t2_paper_trades ORDER BY exit_ms").fetchall()]
    actual = [t for t in all_trades(store) if t["entry_ms"] >= meta["start_ms"]]
    return {
        "meta": meta,
        "since": iso(meta["start_ms"]),
        "actual": val.structure(actual, "net_pnl", "exit_ms"),
        "replica": val.structure([{"pnl": t["pnl"], "exit": t["exitAt"]} for t in replica], "pnl", "exit"),
        "matched": len(val.match(actual, [{"symbol": t["symbol"], "side": t["side"], "entryAt": t["entryAt"]} for t in replica])[0]),
    }
