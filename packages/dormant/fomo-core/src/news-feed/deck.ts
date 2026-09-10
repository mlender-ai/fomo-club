import { scoreToState } from "../state";
import type { FomoState } from "../types";
import type { ScoredArticle } from "./types";

/**
 * 스와이프 카드 덱 — 뉴스 카드 사이에 차트 카드를 끼워 한 화면 1장씩 보여준다.
 * docs/PIVOT_FEED_FIRST.md. 순수부(테스트 보장). 인터리브/코멘트폴백/스파크라인 경로.
 */

/** 차트 카드 — VIX/코스피/나스닥/엔비디아. 현재가는 안정 소스, 추이(series)는 best-effort. */
export interface ChartCard {
  key: "vix" | "kospi" | "ndq" | "nvda";
  label: string;
  /** 현재가/지수값. */
  value: number;
  /** 등락률(%). */
  changePct: number;
  /** 종가 시계열(스파크라인용). 없으면 숫자 카드. */
  series?: number[];
  /** 포모 한 줄 코멘트. */
  comment?: string;
  /** 값 단위 표기(선택). */
  unit?: string;
}

export type DeckCard =
  | { kind: "news"; article: ScoredArticle }
  | { kind: "chart"; chart: ChartCard };

/**
 * 뉴스(점수순) 사이에 차트 카드를 chartEvery 장마다 1장 끼워 덱을 만든다.
 * 차트가 없으면 뉴스만. 결정적(같은 입력 → 같은 순서).
 */
export function buildDeck(
  articles: ScoredArticle[],
  charts: ChartCard[],
  opts: { chartEvery?: number } = {}
): DeckCard[] {
  const chartEvery = Math.max(2, opts.chartEvery ?? 5);
  const deck: DeckCard[] = [];
  let ci = 0;
  articles.forEach((article, i) => {
    deck.push({ kind: "news", article });
    // chartEvery 장마다(끝 제외) 차트 1장 삽입.
    if (charts.length > 0 && (i + 1) % chartEvery === 0 && i + 1 < articles.length) {
      const chart = charts[ci % charts.length]!;
      deck.push({ kind: "chart", chart });
      ci += 1;
    }
  });
  // 뉴스가 거의 없고 차트만 남으면 뒤에 붙인다(빈 화면 방지).
  if (articles.length === 0) {
    for (const chart of charts) deck.push({ kind: "chart", chart });
  }
  return deck;
}

/**
 * 포모 한 줄 코멘트 — LLM 미동작 시 규칙 폴백. FOMO 점수 구간별 담담한 톤.
 * docs/IDENTITY_AND_MILESTONES.md "담담한 솔직함" — 투자조언/단정 없이, "너만 그런 거 아니야"의 결.
 */
const BAND_COMMENTS: Record<FomoState, readonly string[]> = {
  광기: [
    "다들 이거 보고 난리예요. 늦은 거 아니에요.",
    "오늘 제일 뜨거운 소식. 안 탄 사람도 여기 많아요.",
  ],
  FOMO: [
    "놓친 것 같아 조급하죠. 그 마음 알아요.",
    "다들 들떠 있어요. 다들 그래요.",
  ],
  관심: [
    "시선이 이쪽으로 모이는 중이에요. 다들 느끼는 분위기예요.",
    "슬슬 달아오르는 소식이에요. 같이 지켜봐요.",
  ],
  관망: [
    "큰일은 아니에요. 그냥 같이 훑어봐요.",
    "담담하게 보고 넘겨도 되는 소식.",
  ],
  무관심: [
    "오늘은 잔잔하네요. 가볍게 보고 가요.",
    "조용한 소식이에요. 쉬어가도 돼요.",
  ],
};

/** 제목 기반 결정적 인덱스(랜덤 금지 — 캐시/재현 안정). */
function pick(arr: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length]!;
}

export function fomoCommentFallback(opts: {
  title: string;
  fomoScore: number;
  category?: string;
}): string {
  const band = scoreToState(opts.fomoScore);
  return pick(BAND_COMMENTS[band], opts.title);
}

/**
 * 종가 시계열 → SVG 스파크라인 경로. 라이브러리 없이 인라인 SVG로 그린다.
 * 반환: line(절선) + area(채움) path d. 점이 2개 미만이면 null.
 * 좌표계: x 0..w, y 0..h (위가 0). 값이 클수록 위로(작은 y).
 */
export function sparklinePath(
  series: number[],
  w: number,
  h: number,
  pad = 2
): { line: string; area: string } | null {
  const pts = series.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const coords = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * innerW;
    const y = pad + (1 - (v - min) / span) * innerH;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const area = `${line} L${last[0]} ${h} L${first[0]} ${h} Z`;
  return { line, area };
}

/** 추세 방향 — 마지막이 처음보다 높으면 상승(true). */
export function seriesIsUp(series: number[]): boolean {
  const pts = series.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return true;
  return pts[pts.length - 1]! >= pts[0]!;
}

export interface FomoComment {
  id: string;
  comment: string;
}

/**
 * 코멘트 LLM 응답 → FomoComment[]. 코드펜스/잡텍스트 섞여도 첫 JSON 배열을 견고하게 추출.
 * (translate-ko 의 parseKoTranslations 와 동형.)
 */
export function parseFomoComments(content: string): FomoComment[] {
  if (!content) return [];
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(content.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: FomoComment[] = [];
  for (const r of arr) {
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : null;
      const comment = typeof o.comment === "string" ? o.comment.trim() : "";
      if (id && comment) out.push({ id, comment });
    }
  }
  return out;
}
