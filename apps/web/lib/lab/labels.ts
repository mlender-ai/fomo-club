/**
 * 화면에 나가는 말 — **여러 화면이 같이 쓰는 것만** 여기 둔다.
 *
 * 한 화면에만 있으면 그 화면에 둔다. 두 곳에 같은 표가 있으면 한쪽만 고쳐져서
 * 화면마다 다른 말을 한다.
 */
import type { PillTone } from "../../components/ui";

/**
 * FCE 청산 사유 → 사람이 읽는 말. **실제로 오는 값**으로 적었다(147건 분포).
 * 모르는 값은 원문 그대로 둔다.
 */
export const EXIT_LABEL: Record<string, string> = {
  invalidation_breach: "전제 무효",
  take_profit_1: "목표 1",
  take_profit_2: "목표 2",
  take_profit_pressure: "목표 부근 압력",
  time_decay: "시간 소모",
  time_stop: "시간 만료",
  breakeven_stop: "본전 정지",
  opposite_stance_flip: "반대 전환",
  duplicate_bootstrap_suppressed: "중복 억제",
};

export function exitLabel(reason: string | null): string {
  if (!reason) return "—";
  return EXIT_LABEL[reason] ?? reason;
}

/**
 * 트랙 상태 → 알약 (UI-04 E-2).
 *
 * | 상태 | 알약 |
 * |---|---|
 * | 운용중 | `up` · 점 |
 * | 보류 | `warn` |
 * | 정지 | `dn` |
 * | 제외 | `mute` |
 *
 * UI-01 A-2 는 "초록·빨강은 손익에만" 이었다. UI-04 E-2 가 트랙 상태에 초록·빨강을 명시했고,
 * 더 뒤에 나온 구체적인 지시라 그쪽을 따른다. 여기서 초록은 "돌고 있다", 빨강은 "멈췄다" 다.
 *
 * `MDD 초과` 는 없다 — FCE 에 MDD 한도가 설정돼 있지 않다(`mdd_guard.configured: false`).
 * 한도 없이 "초과" 를 띄우면 랩이 기준을 지어내는 것이다.
 */
export const TRACK_STATUS: Record<string, { label: string; tone: PillTone; dot?: boolean }> = {
  running: { label: "운용중", tone: "up", dot: true },
  held: { label: "보류", tone: "warn" },
  stopped: { label: "정지", tone: "dn" },
  excluded: { label: "제외", tone: "mute" },
};

export function trackStatus(status: string): { label: string; tone: PillTone; dot?: boolean } {
  return TRACK_STATUS[status] ?? { label: status, tone: "mute" };
}

/**
 * 정지·보류·제외 사유 → 사람 말 (UI-FIX A-4).
 *
 * 에러 코드(`fill_price_outside_observed_range`)·내부 용어(`invariant` · `NAV`)는 화면에 내지 않는다.
 * 원문은 API 에 그대로 남는다 — 전략 상세의 ⓘ 가 연다. **사유를 지우는 게 아니라 접는다.**
 *
 * | 원문 | 화면 |
 * |---|---|
 * | `체결 invariant — fill_price_outside_observed_range` | 체결 가격 이상 |
 * | `봉 불일치 정지 예방 · 대기 주문 13,940건` | 데이터 불일치 |
 * | `451 지역 차단 · … NAV 미산출` | 지역 차단 |
 */
export function reasonLabel(status: string, reason: string | null): string {
  const r = reason ?? "";
  if (r.includes("fill_price_outside_observed_range")) return "체결 가격 이상";
  if (r.includes("봉 불일치")) return "데이터 불일치";
  if (r.includes("451")) return "지역 차단";
  if (status === "stopped") return "정지";
  if (status === "held") return "보류";
  if (status === "excluded") return "제외";
  return "";
}

/** 트랙 한 글자 — 이미지 없이도 행이 선다. 강조색을 새로 만들지 않는다(UI-01 A-2). */
const GLYPH: Record<string, string> = {
  crypto: "₿",
  whale: "🐋",
  stock_us: "US",
  stock_kr: "KR",
  polymarket: "P",
};

export function trackGlyph(key: string, label: string): string {
  return GLYPH[key] ?? label.slice(0, 1);
}

/** 롱·숏. */
export function sideLabel(direction: string): string {
  return direction === "short" || direction === "SHORT" ? "숏" : "롱";
}

/** `2026-09-22T12:00:00Z` → `09-22 12:00`. 연도는 화면에서 거의 안 필요하다. */
export function shortStamp(at: string | null): string {
  if (!at) return "—";
  return at.slice(5, 16).replace("T", " ");
}

/**
 * FCE 스탠스 → 사람 말 (UI-06 상태 알약). FCE 가 트랙 전체 시장을 보는 방향이다.
 * 포지션 방향과 **엇갈리면** 주의 색 — 롱을 들고 있는데 FCE 가 숏 쪽으로 기울었다.
 */
const STANCE: Record<string, string> = {
  long_leaning: "롱 우세",
  short_leaning: "숏 우세",
  conflicted: "엇갈림",
  neutral: "중립",
};

export function stanceLabel(stance: string | null, direction: string): { label: string; tone: PillTone } | null {
  if (!stance) return null;
  const label = STANCE[stance] ?? stance;
  const side = direction === "short" || direction === "SHORT" ? "short" : "long";
  const against =
    (side === "long" && stance === "short_leaning") || (side === "short" && stance === "long_leaning");
  return { label, tone: against ? "warn" : stance === "conflicted" ? "warn" : "mute" };
}

// ── 진입 근거 (UI-06) ─────────────────────────────────────────────────────

/** FCE 근거 엔진 → 사람 말. */
const ENGINE: Record<string, string> = {
  level: "가격대",
  mtf: "상위 시간봉",
  wyckoff: "와이코프",
  liquidity: "유동성",
  volume: "거래량",
  structure: "구조",
  harmonic: "하모닉",
};

export function engineLabel(engine: string): string {
  return ENGINE[engine] ?? engine;
}

const TREND: Record<string, string> = {
  bullish: "강세",
  bearish: "약세",
  neutral: "중립",
  neutral_to_bullish: "중립→강세",
  bearish_to_neutral: "약세→중립",
  neutral_to_bearish: "중립→약세",
  bullish_to_neutral: "강세→중립",
};

/**
 * FCE 근거 문장을 화면 말로 — **뜻은 바꾸지 않는다.**
 *
 * - `2.12154456` 같은 긴 가격은 유효 숫자 5자리(가격 표기와 같다)
 * - `neutral_to_bullish` 같은 코드는 한국어(UI-FIX A-4 — 코드는 화면에 안 나온다)
 */
export function claimText(claim: string): string {
  return claim
    .replace(/\b[a-z]+(?:_[a-z]+)+\b|\b(?:bullish|bearish|neutral)\b/g, (code) => TREND[code] ?? code.replace(/_/g, " "))
    .replace(/\d+\.\d{5,}/g, (n) => {
      const v = Number(n);
      const digits = Math.max(0, 4 - Math.floor(Math.log10(Math.abs(v) || 1)));
      return v.toFixed(Math.min(digits, 8)).replace(/\.?0+$/, "");
    });
}

/**
 * 패턴 용어 한 줄 설명 (UI-06 B-5 — "UTAD·Crab 같은 용어에 호버 설명을 붙인다").
 *
 * 근거 문장에 나오는 용어에만 붙는다. 판정이 아니라 **말뜻**이다.
 */
export const GLOSSARY: Record<string, string> = {
  Spring: "와이코프 — 지지선을 잠깐 깨고 바로 되돌아오는 움직임. 매집 끝의 신호로 본다",
  UTAD: "와이코프 — 저항선을 잠깐 뚫고 바로 되밀리는 움직임. 분산 끝의 신호로 본다",
  "매집 국면": "와이코프 — 큰손이 조용히 사 모으는 구간으로 읽힌다",
  "분산 국면": "와이코프 — 큰손이 조용히 파는 구간으로 읽힌다",
  POC: "거래량이 가장 많이 쌓인 가격. 그 위에 있으면 상방, 아래면 하방으로 본다",
  스윕: "직전 고점·저점을 살짝 넘겨 손절 물량을 쓸고 되돌아오는 움직임",
  Crab: "하모닉 패턴 하나 — 되돌림 비율이 극단적인 반전 패턴",
  하모닉: "피보나치 비율로 그리는 반전 패턴 묶음",
  "체결 델타": "매수 체결량 − 매도 체결량",
  "상위 TF": "상위 시간봉 — 이 포지션보다 긴 봉에서 본 추세",
};

/** 문장에서 용어를 찾아 `[글, 설명|null][]` 로 쪼갠다 — 화면이 설명 달린 조각만 `<abbr>` 로 감싼다. */
export function withGlossary(text: string): [string, string | null][] {
  const terms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text
    .split(re)
    .filter((part) => part.length > 0)
    .map((part) => [part, GLOSSARY[part] ?? null]);
}
