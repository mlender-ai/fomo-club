import type { PriceCause, SourceDoc } from "@fomo/core";

/**
 * 원인 연결 엔진 (WO 뎁스 재건 A) — "이 종목이 왜 움직였는지에 대한 세상에서 제일 쉬운 답".
 *
 * 치명 모순(2026-07-17 실측): IBM 뎁스에 7/14 실적 8-K가 떠 있는데 "계기 미확인"이라 말했다 —
 * 수집 실패가 아니라 연결(linking) 실패. 이 모듈이 그 연결 층이다:
 *   ① 이미 수집된 공시·뉴스와 가격 급변동의 시간창 매칭(공시 ±2거래일 ≈ ±3일력, 뉴스 ±1일)
 *   ② 실적하회/가이던스하향/잠정실적 등 원인 패턴 사전(뉴스 제목 grounded)
 *   ③ 지수 동반 사실 설명(같은 방향 ±1.5%+)
 *   ④ 최후에만 정직한 미확인(±3% 카드 중 ≤10% 목표)
 * 전부 결정론·실데이터 — 추측 인과 지어내기 금지(시간창 + 원문 사실만).
 */

/** 큰 움직임 문턱 — 당일 ±3%(WO). 이 미만이면 cause 엔진은 개입하지 않는다. */
export const PRICE_CAUSE_MIN_MOVE_PCT = 3;
/** 공시 시간창 — 공시일 ±2거래일 ≈ 달력 3일. */
const OFFICIAL_WINDOW_DAYS = 3;
/** 뉴스 시간창 — 당일 ±1일(전일 저녁 보도가 다음 날 반영되는 케이스). */
const NEWS_WINDOW_DAYS = 1;
/** 지수 동반 판정 — 같은 방향 ±1.5% 이상. */
const CO_MOVE_MIN_INDEX_PCT = 1.5;

/**
 * 원인 후보 패턴 — 뉴스 제목에서 급변동 원인으로 읽히는 재료(WO A-2: 실적하회 계열 명시 추가).
 * 제목이 이 패턴에 걸리면 그 제목 자체가 원인 문장(grounded — 지어내지 않는다).
 */
export const CAUSE_NEWS_PATTERN =
  /(잠정\s*실적|실적\s*(?:하회|부진|쇼크|호조|상회|서프라이즈|발표)|어닝\s*(?:쇼크|서프라이즈)|가이던스\s*(?:하향|상향|하회|철회)|preliminary|misses|beats|cuts?\s+guidance|raises?\s+guidance|profit\s+warning|유상증자|무상증자|자사주|블록딜|수주|공급\s*계약|계약\s*(?:체결|해지)|인수|합병|매각|상장\s*폐지|거래\s*정지|임상|승인|허가|반려|소송|담합|리콜|화재|파업|목표가\s*(?:상향|하향))/i;

interface CauseDateWindowInput {
  /** 오늘(KST) YYYY-MM-DD. */
  today: string;
  /** 당일 등락률(%). */
  changePct: number;
  /** 수집된 원문(공시 kind=official + 뉴스 kind=news). */
  docs: readonly SourceDoc[];
  /** 지수 동반 판정용 — 종목 국적에 맞는 지수 등락률(%). 예: KR→코스피/코스닥, US→S&P/나스닥. */
  indexMoves?: ReadonlyArray<{ label: string; changePct: number }>;
}

function daysBetween(aIso: string, bIso: string): number | undefined {
  const a = Date.parse(aIso.slice(0, 10));
  const b = Date.parse(bIso.slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.abs(a - b) / 86_400_000;
}

function moveWord(changePct: number): string {
  return changePct > 0 ? `급등(+${changePct.toFixed(1)}%)` : `급락(${changePct.toFixed(1)}%)`;
}

function mmdd(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 원인 계산 — 결정론(같은 입력 → 같은 출력). |changePct| < 3% 면 undefined(엔진 비개입).
 * 반환된 text 는 그대로 "확인된 계기"에 노출 가능한 완성 문장(쉬운말·사실만).
 */
export function computePriceCause(input: CauseDateWindowInput): PriceCause | undefined {
  const { today, changePct, docs, indexMoves } = input;
  if (!Number.isFinite(changePct) || Math.abs(changePct) < PRICE_CAUSE_MIN_MOVE_PCT) return undefined;

  // ① 공식 공시 시간창 매칭 — DART·SEC(FRED 거시는 종목 원인이 아님). 최신순.
  const officials = docs
    .filter((d) => d.kind === "official" && d.source !== "FRED(미 연준)")
    .map((d) => ({ doc: d, date: (d.publishedAt ?? "").slice(0, 10) }))
    .filter((x) => x.date && (daysBetween(x.date, today) ?? Infinity) <= OFFICIAL_WINDOW_DAYS)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const official = officials[0];
  if (official) {
    return {
      text: `이번 ${moveWord(changePct)}과 같은 시기의 공식 공시: ${official.doc.title} (${mmdd(official.date)})`,
      kind: "material",
      ...(official.doc.source ? { sourceLabel: official.doc.source } : {}),
      ...(official.doc.url ? { url: official.doc.url } : {}),
      asOf: official.date,
    };
  }

  // ② 뉴스 원인 패턴 매칭 — 당일 ±1일 보도 중 원인성 제목(grounded — 제목 그대로).
  const news = docs
    .filter((d) => d.kind === "news" && d.publishedAt)
    .filter((d) => (daysBetween(d.publishedAt!, today) ?? Infinity) <= NEWS_WINDOW_DAYS)
    .filter((d) => CAUSE_NEWS_PATTERN.test(`${d.title} ${d.body ?? ""}`))
    .sort((a, b) => ((a.publishedAt ?? "") < (b.publishedAt ?? "") ? 1 : -1))[0];
  if (news) {
    return {
      text: `같은 날 보도된 재료: "${news.title.trim()}"`,
      kind: "material",
      ...(news.source ? { sourceLabel: news.source } : {}),
      ...(news.url ? { url: news.url } : {}),
      ...(news.publishedAt ? { asOf: news.publishedAt.slice(0, 10) } : {}),
    };
  }

  // ③ 지수 동반 — 같은 방향으로 지수도 크게 움직였으면 그 사실로 설명(종목 고유 재료 아님을 명시).
  const coMove = (indexMoves ?? [])
    .filter((m) => Number.isFinite(m.changePct) && Math.abs(m.changePct) >= CO_MOVE_MIN_INDEX_PCT)
    .filter((m) => Math.sign(m.changePct) === Math.sign(changePct))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
  if (coMove) {
    const sign = coMove.changePct > 0 ? "+" : "";
    return {
      text: `이날 ${coMove.label} 지수도 ${sign}${coMove.changePct.toFixed(1)}% — 시장 전반과 같은 방향이에요. 종목 고유 재료는 확인되지 않았어요.`,
      kind: "co-move",
      asOf: today,
    };
  }

  // ④ 최후 — 정직한 미확인(수집 원문 안에서 답을 못 찾은 사실 그대로).
  return {
    text: `오늘 ${moveWord(changePct)}의 원인 후보를 수집 원문(공시·뉴스)에서 찾지 못했어요.`,
    kind: "unknown",
    asOf: today,
  };
}
