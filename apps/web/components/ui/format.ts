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

/**
 * 원래 금액 — 통화 코드를 뒤에 (UI-04 E). `348.68 USDT` · `100,003.82 USD` · `₩99,999,340`.
 *
 * 환산값(`$6,974`)과 나란히 놓이므로 **같은 `$` 로 쓰지 않는다.** 둘 다 `$` 면 어느 쪽이 진짜
 * 잔고인지 구분이 안 된다. 원화만 기호를 앞에 둔다(UI-01 B-3).
 */
export function native(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  if (currency === "KRW") return money(value, "KRW");
  return `${num(value, 2)} ${currency}`;
}

const KST = "Asia/Seoul";

/**
 * 한국 시간 — `9월 18일 14:00`. 보는 사람이 한국에 있다. 브라우저 시간대에 맡기면 같은 점이
 * 사람마다 다른 날짜가 되므로 **시간대를 박는다.**
 */
export function kstStamp(at: string | number | Date): string {
  const d = new Date(at);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}월 ${get("day")}일 ${get("hour")}:${get("minute")}`;
}

/** 최근 활동의 시각 — 오늘이면 `14:33`, 어제면 `어제`, 그 전은 `9월 18일`. 한국 시간. */
export function kstWhen(at: string | number | Date, now: Date = new Date()): string {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: KST }).format(d); // YYYY-MM-DD
  const d = new Date(at);
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getTime() - 86_400_000));
  const day = fmt(d);
  if (day === today) {
    return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  }
  if (day === yesterday) return "어제";
  const [, m, dd] = day.split("-");
  return `${Number(m)}월 ${Number(dd)}일`;
}
