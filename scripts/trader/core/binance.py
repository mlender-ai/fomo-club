"""봉 예비 출처 — Binance USDT-M 선물 공개 봉(키 없음).

Bitget 과거 봉이 그 구간을 안 줄 때만 쓴다. 출처는 봉마다 `candles.source` 에 남는다.
(가격은 거래소마다 몇 bp 다르다 — MFE·MAE 를 Bitget 체결가와 견줄 때 그만큼 흔들린다.)
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

BASE = "https://fapi.binance.com/fapi/v1/klines"
INTERVAL = {"1m": "1m", "5m": "5m", "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d"}


def klines(symbol: str, tf: str, start_ms: int, end_ms: int, pause: float = 0.1) -> list[tuple]:
    out: list[tuple] = []
    cursor = start_ms
    while cursor < end_ms:
        query = urllib.parse.urlencode({"symbol": symbol, "interval": INTERVAL[tf], "startTime": cursor, "endTime": end_ms, "limit": 1500})
        with urllib.request.urlopen(f"{BASE}?{query}", timeout=20) as resp:
            rows = json.loads(resp.read().decode())
        if not rows:
            break
        out.extend((int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])) for r in rows)
        nxt = int(rows[-1][0]) + 1
        if nxt <= cursor:
            break
        cursor = nxt
        time.sleep(pause)
    return out
