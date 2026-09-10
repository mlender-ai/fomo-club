/**
 * CTX-03 재료 수집 — 타입 정본.
 *
 * §3 절대 규칙을 타입으로 강제한다:
 *  1. 소스 종류(`filing`/`earnings`/`news`/`market`)를 **섞지 않는다**.
 *  2. **뉴스는 링크만.** 제목·본문을 저장하지 않는다(§7 확정 — 조건부 분기 없음).
 *  4. 출처·시각 필수.
 *
 * §2 범위 밖: 재료의 **해석**(CTX-04) · 카드 표시(CTX-05) · 감성 분석·점수화.
 */

export type SourceKind = "filing" | "earnings" | "news" | "market";

/** §4 재료 유형. 분류 실패는 `OTHER` — 억지로 넣지 않는다(§4-1). */
export type EventType =
  | "EARNINGS_RESULT"
  | "GUIDANCE"
  | "CONTRACT"
  | "CAPACITY"
  | "MNA"
  | "CAPITAL_RAISE"
  | "BUYBACK_DIVIDEND"
  | "INSIDER_TRADE"
  | "GOVERNANCE"
  | "REGULATORY"
  | "OTHER"
  | "NONE";

/**
 * §4 `잠재 방향` — **내부 신호다.**
 *
 * §4-1·§11: 화면에 `+`/`−` 를 그대로 보여주면 **투자의견이 된다.** CTX-04 가 배경 후보를
 * 만들 때 입력으로만 쓴다. 이 타입이 카드 렌더 경로로 새어나가면 안 된다.
 */
export type PotentialDirection = "positive" | "negative" | "mixed";

/** §4 표의 잠재 방향. 화면 노출 금지. */
export const POTENTIAL_DIRECTION: Readonly<Partial<Record<EventType, PotentialDirection>>> = {
  EARNINGS_RESULT: "mixed",
  GUIDANCE: "mixed",
  CONTRACT: "positive",
  CAPACITY: "mixed",
  MNA: "mixed",
  CAPITAL_RAISE: "negative",
  BUYBACK_DIVIDEND: "positive",
  INSIDER_TRADE: "mixed",
  GOVERNANCE: "mixed",
  REGULATORY: "mixed",
};

/**
 * 공시·실적 이벤트. `kind` 가 `"news"` 가 **아닌** 경우에만 제목·본문을 갖는다.
 *
 * 뉴스와 공시가 같은 필드에 섞이는 경로를 타입으로 끊는다(§10 실패 모드 2).
 */
export interface TextualMaterialEvent {
  id: string;
  symbol: string;
  kind: Exclude<SourceKind, "news">;
  event_type: EventType;
  /** 공시 제목·보고서명. */
  title: string;
  /** 공시일. 필수(§3 규칙 4). */
  disclosed_at: string;
  url: string | null;
  /** 라이선스가 허용하는 범위에서만(§3 규칙 3). */
  body_excerpt: string | null;
  source: string;
  fetched_at: string;
}

/**
 * 뉴스 이벤트 — **링크·출처·시각만.**
 *
 * §7 은 CTX-00 B-3 결과를 따르라 하고, 그 결과는 **"본문 금지·링크만" 으로 확정**됐다
 * (조건부 분기 없음). 전재 제한 리스크 대비 본문 저장의 이득이 작다는 판단이었다.
 *
 * 그래서 `title`·`body_excerpt` 필드를 **아예 두지 않는다.** 옵셔널로 두면 언젠가 채워진다 —
 * 저장할 자리가 없어야 저장되지 않는다. §10 "뉴스를 라이선스 확인 없이 저장" 을 타입이 막는다.
 */
export interface NewsLinkEvent {
  id: string;
  symbol: string;
  kind: "news";
  /** 뉴스는 유형 분류를 하지 않는다 — 제목을 안 읽으므로 분류 근거가 없다. */
  event_type: "OTHER";
  disclosed_at: string;
  /** 링크가 없으면 뉴스 이벤트로서 의미가 없다. */
  url: string;
  source: string;
  fetched_at: string;
}

export type MaterialEvent = TextualMaterialEvent | NewsLinkEvent;

export type Coverage = "full" | "partial" | "none";

export interface MaterialWindow {
  symbol: string;
  window_days: 90;
  as_of: string;
  events: MaterialEvent[];

  // ── 파생 ──
  event_count_by_type: Partial<Record<EventType, number>>;
  days_since_last_filing: number | null;
  days_since_last_earnings: number | null;
  /** 예정일. 확보 시(§6) — CTX-04 와 판단 원장 채점 양쪽에 필요하다. */
  next_earnings_date: string | null;
  /** 재료 없는 연속 일수. 기존 "최근 30일 뉴스·공시 없어요" 문구를 대체한다(완료조건 5). */
  quiet_days: number | null;

  coverage: Coverage;
}

/** 뉴스 이벤트인지 좁히는 가드. 저장·표시 경로에서 분기할 때 쓴다. */
export function isNewsEvent(event: MaterialEvent): event is NewsLinkEvent {
  return event.kind === "news";
}
