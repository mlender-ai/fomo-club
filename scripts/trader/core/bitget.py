"""Bitget 조회 — **GET 만 있다.** 주문 · 이체 · 출금 경로는 이 파일에 없다.

키는 환경변수(FCE 와 같은 이름)로만 받는다. 값은 출력하지 않는다.

  FCE_BITGET_API_KEY · FCE_BITGET_API_SECRET · FCE_BITGET_API_PASSPHRASE
  (또는 BITGET_API_KEY · BITGET_API_SECRET · BITGET_API_PASSPHRASE)

서명은 FCE `app/exchange/bitget/signer.py` 와 같다: base64(HMAC-SHA256(ts + METHOD + path?query)).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

BASE = "https://api.bitget.com"
PRODUCT = "USDT-FUTURES"


class BitgetError(RuntimeError):
    def __init__(self, code: str, message: str, path: str):
        super().__init__(f"{path}: [{code}] {message}")
        self.code = code
        self.path = path


def env_keys() -> tuple[str, str, str]:
    def pick(*names: str) -> str:
        for n in names:
            v = os.environ.get(n, "").strip()
            if v:
                return v
        return ""

    return (
        pick("FCE_BITGET_API_KEY", "BITGET_API_KEY"),
        pick("FCE_BITGET_API_SECRET", "BITGET_API_SECRET"),
        pick("FCE_BITGET_API_PASSPHRASE", "BITGET_API_PASSPHRASE"),
    )


def sign(secret: str, ts: str, method: str, path: str, query: str) -> str:
    msg = f"{ts}{method.upper()}{path}" + (f"?{query}" if query else "")
    return base64.b64encode(hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()).decode()


def _default_fetch(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:  # 거래소는 4xx 에도 JSON 본문을 준다
        body = exc.read().decode(errors="replace")
        try:
            return json.loads(body)
        except ValueError:
            return {"code": str(exc.code), "msg": body[:200]}


class Bitget:
    def __init__(
        self,
        key: str = "",
        secret: str = "",
        passphrase: str = "",
        base: str = BASE,
        pause: float = 0.12,
        fetch: Callable[[str, dict], dict] | None = None,
    ):
        self.key, self.secret, self.passphrase = key, secret, passphrase
        self.base = base.rstrip("/")
        self.pause = pause
        self.fetch = fetch or _default_fetch

    @property
    def private_ready(self) -> bool:
        return bool(self.key and self.secret and self.passphrase)

    def get(self, path: str, params: dict | None = None, private: bool = False) -> dict:
        clean = {k: str(v) for k, v in (params or {}).items() if v is not None}
        query = urllib.parse.urlencode(clean)
        headers = {"locale": "en-US", "Content-Type": "application/json"}
        if private:
            if not self.private_ready:
                raise BitgetError("not_configured", "조회 키가 없다(FCE_BITGET_API_*)", path)
            ts = str(int(time.time() * 1000))
            headers.update(
                {
                    "ACCESS-KEY": self.key,
                    "ACCESS-TIMESTAMP": ts,
                    "ACCESS-PASSPHRASE": self.passphrase,
                    "ACCESS-SIGN": sign(self.secret, ts, "GET", path, query),
                }
            )
        url = f"{self.base}{path}" + (f"?{query}" if query else "")
        payload = self.fetch(url, headers)
        if self.pause:
            time.sleep(self.pause)
        code = str(payload.get("code", ""))
        if code != "00000":
            raise BitgetError(code or "unknown", str(payload.get("msg") or "")[:200], path)
        return payload

    def paged(self, path: str, params: dict, list_key: str, max_pages: int = 200, limit: int = 100) -> list[dict]:
        """`idLessThan` = 직전 응답의 `endId` 로 뒤로 넘긴다."""
        out: list[dict] = []
        cursor: str | None = None
        for _ in range(max_pages):
            payload = self.get(path, {**params, "limit": limit, "idLessThan": cursor}, private=True)
            data = payload.get("data") or {}
            rows = data.get(list_key) if isinstance(data, dict) else data
            rows = [r for r in (rows or []) if isinstance(r, dict)]
            out.extend(rows)
            end_id = data.get("endId") if isinstance(data, dict) else None
            if len(rows) < limit or not end_id or end_id == cursor:
                break
            cursor = str(end_id)
        return out

    # ── 계좌(비공개 · 조회) ──

    def account_info(self) -> dict:
        """키 권한 확인용. `authorities` · `ips`."""
        return self.get("/api/v2/spot/account/info", private=True).get("data") or {}

    def fills(self, start_ms: int, end_ms: int) -> list[dict]:
        params = {"productType": PRODUCT, "startTime": start_ms, "endTime": end_ms}
        try:
            return self.paged("/api/v2/mix/order/fill-history", params, "fillList")
        except BitgetError:
            # FCE 가 쓰는 최근 체결 경로로 한 번 더(보관 범위가 다를 수 있다).
            return self.paged("/api/v2/mix/order/fills", params, "fillList")

    def orders(self, start_ms: int, end_ms: int) -> list[dict]:
        return self.paged(
            "/api/v2/mix/order/orders-history",
            {"productType": PRODUCT, "startTime": start_ms, "endTime": end_ms},
            "entrustedList",
        )

    def positions(self, start_ms: int, end_ms: int) -> list[dict]:
        return self.paged(
            "/api/v2/mix/position/history-position",
            {"productType": PRODUCT, "startTime": start_ms, "endTime": end_ms},
            "list",
        )

    def bills(self, start_ms: int, end_ms: int) -> list[dict]:
        return self.paged(
            "/api/v2/mix/account/bill",
            {"productType": PRODUCT, "startTime": start_ms, "endTime": end_ms},
            "bills",
        )

    # ── 시장(공개) ──

    def candles(self, symbol: str, granularity: str, end_ms: int | None, limit: int = 200) -> list[list]:
        payload = self.get(
            "/api/v2/mix/market/history-candles",
            {"symbol": symbol, "productType": PRODUCT, "granularity": granularity, "endTime": end_ms, "limit": limit},
        )
        return [row for row in (payload.get("data") or []) if isinstance(row, list)]

    def funding_history(self, symbol: str, page: int, size: int = 100) -> list[dict]:
        payload = self.get(
            "/api/v2/mix/market/history-fund-rate",
            {"symbol": symbol, "productType": PRODUCT, "pageSize": size, "pageNo": page},
        )
        return [row for row in (payload.get("data") or []) if isinstance(row, dict)]


# 권한 이름에 이런 말이 들어 있으면 조회 전용이 아니다. 목록에 없는 이름은 "확인 필요" 로 남긴다.
WRITE_HINTS = ("withdraw", "trade", "transfer", "order_w", "wtw", "wdr")
READ_HINTS = ("read", "readonly")


def judge_authorities(authorities: list) -> dict:
    """키 권한 판정. Bitget 권한 코드가 문서마다 달라 **기계 판정은 1차**다 — 최종은 광혁이 거래소 화면에서 본다."""
    names = [str(a).lower() for a in (authorities or [])]
    write = [n for n in names if any(h in n for h in WRITE_HINTS) or (len(n) <= 5 and n.endswith("w"))]
    unknown = [n for n in names if n not in write and not any(h in n for h in READ_HINTS) and not (len(n) <= 5 and n.endswith("r"))]
    return {
        "authorities": names,
        "write_like": write,
        "unknown": unknown,
        "read_only": bool(names) and not write and not unknown,
    }
