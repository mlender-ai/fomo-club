"""비공개 저장소 — `~/.fomo/trader/trader.db` (레포 밖 · 권한 600).

원본은 거래소가 준 JSON 그대로(`raw_*`), 가공은 다시 만들 수 있게 따로(`trades` · `trade_context` · `reports`).
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

from .private import ensure_private_dir, lock_file

SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_fills (id TEXT PRIMARY KEY, source TEXT NOT NULL, symbol TEXT, ts INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS raw_orders (id TEXT PRIMARY KEY, symbol TEXT, ts INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS raw_positions (id TEXT PRIMARY KEY, symbol TEXT, ts INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS raw_bills (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, business_type TEXT, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candles (symbol TEXT, tf TEXT, ts INTEGER, o REAL, h REAL, l REAL, c REAL, v REAL, source TEXT, PRIMARY KEY (symbol, tf, ts));
CREATE TABLE IF NOT EXISTS funding (symbol TEXT, ts INTEGER, rate REAL, PRIMARY KEY (symbol, ts));
CREATE TABLE IF NOT EXISTS fetch_log (kind TEXT, start_ms INTEGER, end_ms INTEGER, status TEXT, rows INTEGER, error TEXT, at INTEGER);
CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, symbol TEXT, direction TEXT, entry_ms INTEGER, exit_ms INTEGER, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trade_context (trade_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (at INTEGER PRIMARY KEY, payload TEXT NOT NULL, markdown TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


class Store:
    def __init__(self, directory: Path | None = None):
        self.dir = ensure_private_dir(directory)
        self.path = self.dir / "trader.db"
        self.conn = sqlite3.connect(self.path)
        self.conn.executescript(SCHEMA)
        lock_file(self.path)

    def close(self) -> None:
        self.conn.commit()
        self.conn.close()

    # ── 원본 ──

    def put_fills(self, rows: list[tuple[str, str, str, int, dict]]) -> int:
        """(id, source, symbol, ts, payload). 거래소 원본이 FCE 사본보다 앞선다(같은 id 면 덮어쓴다)."""
        before = self.count("raw_fills")
        for fid, source, symbol, ts, payload in rows:
            existing = self.conn.execute("SELECT source FROM raw_fills WHERE id = ?", (fid,)).fetchone()
            if existing and existing[0] == "bitget" and source != "bitget":
                continue
            self.conn.execute(
                "INSERT OR REPLACE INTO raw_fills VALUES (?, ?, ?, ?, ?)", (fid, source, symbol, ts, json.dumps(payload))
            )
        self.conn.commit()
        return self.count("raw_fills") - before

    def put(self, table: str, rows: list[tuple]) -> None:
        marks = ", ".join("?" for _ in rows[0]) if rows else ""
        for r in rows:
            self.conn.execute(f"INSERT OR REPLACE INTO {table} VALUES ({marks})", tuple(json.dumps(x) if isinstance(x, (dict, list)) else x for x in r))
        self.conn.commit()

    def log_fetch(self, kind: str, start_ms: int, end_ms: int, status: str, rows: int, error: str | None = None) -> None:
        self.conn.execute(
            "INSERT INTO fetch_log VALUES (?, ?, ?, ?, ?, ?, ?)", (kind, start_ms, end_ms, status, rows, error, int(time.time() * 1000))
        )
        self.conn.commit()

    def count(self, table: str) -> int:
        return int(self.conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

    def payloads(self, table: str, where: str = "", params: tuple = ()) -> list[dict]:
        sql = f"SELECT payload FROM {table}" + (f" WHERE {where}" if where else "")
        return [json.loads(r[0]) for r in self.conn.execute(sql, params).fetchall()]

    def fill_rows(self) -> list[tuple[str, dict]]:
        return [(r[0], json.loads(r[1])) for r in self.conn.execute("SELECT source, payload FROM raw_fills ORDER BY ts").fetchall()]

    def fetch_errors(self) -> list[dict]:
        rows = self.conn.execute("SELECT kind, start_ms, end_ms, error FROM fetch_log WHERE status = 'error' ORDER BY at").fetchall()
        return [{"kind": r[0], "start_ms": r[1], "end_ms": r[2], "error": r[3]} for r in rows]

    # ── 봉 · 펀딩 ──

    def put_candles(self, symbol: str, tf: str, rows: list[tuple], source: str) -> None:
        self.conn.executemany(
            "INSERT OR REPLACE INTO candles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(symbol, tf, int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5]), source) for r in rows],
        )
        self.conn.commit()

    def candles(self, symbol: str, tf: str, start_ms: int | None = None, end_ms: int | None = None) -> list[tuple]:
        sql = "SELECT ts, o, h, l, c, v FROM candles WHERE symbol = ? AND tf = ?"
        params: list = [symbol, tf]
        if start_ms is not None:
            sql += " AND ts >= ?"
            params.append(start_ms)
        if end_ms is not None:
            sql += " AND ts <= ?"
            params.append(end_ms)
        return [tuple(r) for r in self.conn.execute(sql + " ORDER BY ts", params).fetchall()]

    def candle_span(self, symbol: str, tf: str) -> tuple[int | None, int | None]:
        r = self.conn.execute("SELECT MIN(ts), MAX(ts) FROM candles WHERE symbol = ? AND tf = ?", (symbol, tf)).fetchone()
        return r[0], r[1]

    def put_funding(self, symbol: str, rows: list[tuple[int, float]]) -> None:
        self.conn.executemany("INSERT OR REPLACE INTO funding VALUES (?, ?, ?)", [(symbol, ts, rate) for ts, rate in rows])
        self.conn.commit()

    def funding(self, symbol: str) -> list[tuple[int, float]]:
        return [tuple(r) for r in self.conn.execute("SELECT ts, rate FROM funding WHERE symbol = ? ORDER BY ts", (symbol,)).fetchall()]

    # ── 가공 ──

    def replace_trades(self, trades: list[dict]) -> None:
        self.conn.execute("DELETE FROM trades")
        self.conn.executemany(
            "INSERT INTO trades VALUES (?, ?, ?, ?, ?, ?)",
            [(t["id"], t["symbol"], t["direction"], t["entry_ms"], t["exit_ms"], json.dumps(t)) for t in trades],
        )
        self.conn.commit()

    def put_context(self, trade_id: str, context: dict) -> None:
        self.conn.execute("INSERT OR REPLACE INTO trade_context VALUES (?, ?)", (trade_id, json.dumps(context)))
        self.conn.commit()

    def put_report(self, at_ms: int, payload: dict, markdown: str) -> Path:
        self.conn.execute("INSERT OR REPLACE INTO reports VALUES (?, ?, ?)", (at_ms, json.dumps(payload), markdown))
        self.conn.commit()
        path = self.dir / "TRADER-01-report.md"
        path.write_text(markdown, encoding="utf-8")
        lock_file(path)
        return path

    def set_meta(self, key: str, value: str) -> None:
        self.conn.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (key, value))
        self.conn.commit()

    def meta(self, key: str) -> str | None:
        r = self.conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return r[0] if r else None
