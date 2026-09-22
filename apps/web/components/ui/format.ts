/**
 * 숫자 표기 — **화면에 나가는 모든 수가 여기를 지난다** (UI-01 B-3).
 *
 * | 규칙 | 왜 |
 * |---|---|
 * | 음수는 `−` (U+2212) | 하이픈 `-` 은 폭이 다르고 글자 사이에서 하이픈으로 읽힌다 |
 * | 통화 기호는 숫자 앞 | `$46,229.30` · `₩99,999,340` |
 * | 퍼센트는 소수점 둘째까지 | 트랙마다 자리수가 다르면 비교가 안 된다 |
 * | 모르는 값은 `—` | **`0` 으로 채우지 않는다.** 0 은 측정된 값이다 |
 */

/** 유니코드 마이너스. 하이픈과 다른 글자다. */
export const MINUS = "−";

/** 통화별 기호와 소수 자리. 기호가 없는 통화는 코드를 뒤에 붙인다. */
const CURRENCY: Record<string, { symbol: string; digits: number }> = {
  USD: { symbol: "$", digits: 2 },
  USDT: { symbol: "$", digits: 2 },
  USDC: { symbol: "$", digits: 2 },
  KRW: { symbol: "₩", digits: 0 },
};

function swapMinus(text: string): string {
  return text.replace(/-/g, MINUS);
}

/** 자리수 구분 + 유니코드 마이너스. 통화 없이 수만. */
export function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return swapMinus(
    value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  );
}

/** 통화 금액. 기호는 **숫자 앞**. */
export function money(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const spec = CURRENCY[currency];
  const digits = spec?.digits ?? 2;
  const body = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value < 0 ? MINUS : "";
  // 기호가 없는 통화는 만들어내지 않고 코드를 뒤에 붙인다.
  return spec ? `${sign}${spec.symbol}${body}` : `${sign}${body} ${currency}`;
}

/** 퍼센트. 항상 소수점 둘째까지, 양수에는 `+`. */
export function pct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** 부호 → 손익 색 이름. 0 은 색이 없다 — 이익도 손실도 아니다. */
export function tone(value: number | null | undefined): "up" | "dn" | "mute" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "mute";
  return value > 0 ? "up" : "dn";
}

/** 경과 시간 한 줄. 헤더 동기화 표시와 행 메타가 같이 쓴다. */
export function ago(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / (60 * 24))}일 전`;
}
