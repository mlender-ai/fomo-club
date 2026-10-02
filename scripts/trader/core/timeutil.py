from __future__ import annotations

from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
DAY_MS = 86_400_000
HOUR_MS = 3_600_000


def to_ms(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def from_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def parse_iso_ms(value: str) -> int:
    text = str(value).strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return to_ms(parsed)


def iso(ms: int | None) -> str | None:
    return from_ms(ms).isoformat().replace("+00:00", "Z") if ms is not None else None


def local_day(ms: int, tz: timezone = KST) -> str:
    return from_ms(ms).astimezone(tz).strftime("%Y-%m-%d")


def local_month(ms: int, tz: timezone = KST) -> str:
    return from_ms(ms).astimezone(tz).strftime("%Y-%m")


def windows(start_ms: int, end_ms: int, span_ms: int) -> list[tuple[int, int]]:
    """[start, end) 를 span 단위로 자른다. 거래소 조회 한 번의 최대 구간을 지키려고 쓴다."""
    out: list[tuple[int, int]] = []
    cursor = start_ms
    while cursor < end_ms:
        nxt = min(cursor + span_ms, end_ms)
        out.append((cursor, nxt))
        cursor = nxt
    return out
