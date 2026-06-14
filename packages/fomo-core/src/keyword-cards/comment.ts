import type { KeywordCard, KeywordCardSource } from "./types";
import type { KeywordSourceItem } from "./extract";
import type { ScoredKeyword, KeywordConfidence } from "./score";
import { josa } from "./josa";

/**
 * 코멘트 생성 — 룰 폴백 템플릿. KEYWORD_ENGINE_SPEC §4.4.
 *
 * 순수 함수. Phase 2 는 LLM 없이 점수 구간별 템플릿만 쓴다(LLM 은 Phase 3).
 * mock.ts 의 톤을 폴백 기준으로 삼는다: 친구 반말 + 담담함 + 반드시 균형추(진정)로 닫기.
 *
 * 변주: 같은 밴드라도 똑같은 문장이 반복되지 않게 밴드별 템플릿 2~3개 풀 + 키워드 해시로
 *   **결정적** 선택(랜덤 X → 새로고침/캐시에도 안 바뀜).
 * 조사: josa() 로 받침 처리("코인는"→"코인은").
 *
 * 정직성(운영자 피드백 2026-06-14): "N번 돌았어" 같은 *언급 횟수*는 백엔드 신호일 뿐
 *   유저에게 의미 없어 코멘트/why 에 노출하지 않는다. 대신 실제 핵심 뉴스(card.sources)로 근거를 보여준다.
 * 절대 규칙(§2): 예측·투자조언·전문용어·거래부추김 0, 모든 변주에 균형추 필수.
 * 가드 테스트(keyword-comment.test.ts)가 금칙어/균형추를 전 변주에서 검증한다.
 */

/** 진정(균형추) 마커 — 모든 코멘트·remember 에 최소 1개 포함되어야 한다(가드 테스트). */
export const CALM_MARKERS: readonly string[] = [
  "기회는 또 와",
  "안 급해도 돼",
  "급할 거 없어",
  "급할 것도 없어",
  "천천히",
  "조심",
  "아쉬워할 필요 없어",
  "아쉬워하지 않아도",
  "무서워할 것",
  "나쁜 게 아니야",
  "쉬어가는",
];

/** 키워드로 결정적 인덱스(랜덤 아님 — 캐시·새로고침에도 동일). */
function pick<T>(arr: readonly T[], key: string): T {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return arr[h % arr.length]!;
}

type CommentFn = (kw: string) => string;

interface BandTemplate {
  /** 구간 하한(이상). state.ts BANDS 와 동일 경계. */
  min: number;
  /** 앞면 코멘트 변주 풀(2~3개). 각 변주에 균형추 필수. */
  comments: readonly CommentFn[];
  whyTitle: string;
  rememberTitle: string;
  /** 균형추 한마디 변주 풀. */
  remembers: readonly CommentFn[];
}

const eun = (k: string) => `${k}${josa(k, "은는")}`;

// 점수 구간별 템플릿(state.ts 5구간 정합). 높을수록 진정 톤을 강하게(§4.4 규칙5).
const BANDS: readonly BandTemplate[] = [
  {
    min: 81,
    comments: [
      (k) =>
        `오늘 다들 ${k} 얘기뿐이야. 혼자 놓친 것 같은 기분 들기 쉬운 날이지. ` +
        `근데 이미 한참 달아오른 거 따라 들어가는 건 늘 조심하는 게 좋아.`,
      (k) =>
        `${eun(k)} 오늘 제일 시끄러운 키워드야. ` +
        `다 놓친 기분 들지? 그래도 따라가는 건 천천히, 늦었다고 조급해 말고.`,
    ],
    whyTitle: "오늘 왜 여기에 다들 쏠렸어?",
    rememberTitle: "근데 이건 기억해",
    remembers: [
      () => "다들 좋다고 몰릴 때가 보통 제일 비쌀 때야. 오늘 못 탔다고 아쉬워할 필요 없어. 기회는 또 와.",
      () => "제일 뜨거울 때 들어가면 늦는 경우가 많아. 오늘 놓쳤어도 괜찮아 — 기회는 또 와.",
    ],
  },
  {
    min: 61,
    comments: [
      (k) =>
        `${k} 얘기가 다시 뜨거워졌어. ` +
        `휩쓸리기 쉬운 주제니까 한 박자 천천히 봐도 돼.`,
      (k) =>
        `오늘 ${k} 쪽으로 시선이 꽤 쏠렸어. 다들 보니까 나도 봐야 하나 싶지? ` +
        `그 마음일수록 조심해서 천천히.`,
    ],
    whyTitle: "오늘 왜 여기에 다들 쏠렸어?",
    rememberTitle: "근데 이건 기억해",
    remembers: [
      () => "분위기로 달아오른 건 분위기로 식기도 해. '나만 놓쳤다'는 마음이 들 때일수록 천천히.",
      () => "다들 몰릴 때가 제일 휩쓸리기 쉬워. 안 급해도 돼.",
    ],
  },
  {
    min: 41,
    comments: [
      (k) =>
        `오늘은 ${k} 쪽으로 시선이 조금씩 모이는 날이야. ` +
        `크게 들뜨진 않았어. 급할 거 없어.`,
      (k) =>
        `${k} 얘기가 슬슬 보이네. 후끈하진 않고 관심 붙는 정도야. ` +
        `천천히 봐도 돼.`,
    ],
    whyTitle: "오늘 왜 여기에 시선이 모였어?",
    rememberTitle: "근데 이건 기억해",
    remembers: [
      () => "이런 날은 섣불리 움직이기보다 지켜보는 사람이 많아. 안 급해도 돼.",
      () => "조용히 붙는 관심은 천천히 봐도 늦지 않아. 급할 거 없어.",
    ],
  },
  {
    min: 21,
    comments: [
      (k) =>
        `${eun(k)} 오늘 좀 잠잠했어. 크게 들썩이진 않았어. ` +
        `무서워할 것도, 급할 것도 없어.`,
      (k) =>
        `오늘 ${k} 얘기는 조용한 편이야. 한 박자 쉬어가는 날이지. ` +
        `안 급해도 돼.`,
    ],
    whyTitle: "오늘은 왜 잠잠했어?",
    rememberTitle: "근데 이건 기억해",
    remembers: [
      () => "크게 올랐던 자리는 식을 때도 크게 식어. 오를 때 못 탔다고 아쉬워하지 않아도 되는 이유야.",
      () => "잠잠한 날은 잠잠한 대로 괜찮아. 무서워할 것 없어.",
    ],
  },
  {
    min: 0,
    comments: [
      (k) =>
        `${eun(k)} 오늘 거의 조용했어. 다들 관심이 다른 데 가 있어. ` +
        `조용한 건 나쁜 게 아니야.`,
      (k) =>
        `오늘 ${k} 얘기는 거의 안 보였어. 이런 날도 있는 거야. ` +
        `안 급해도 돼.`,
    ],
    whyTitle: "오늘은 왜 잠잠했어?",
    rememberTitle: "근데 이건 기억해",
    remembers: [
      () => "관심이 없다고 뭔가 잘못된 건 아니야. 시선은 매일 다른 곳으로 옮겨다니거든.",
      () => "조용한 건 나쁜 게 아니야. 안 급해도 돼.",
    ],
  },
];

function bandFor(score: number): BandTemplate {
  for (const b of BANDS) if (score >= b.min) return b;
  return BANDS[BANDS.length - 1]!;
}

/** 관련 종목 자연어 나열(시세 아님). "삼성전자·SK하이닉스 같은" 식. */
function relatedPhrase(related: readonly string[]): string {
  if (related.length === 0) return "관련 종목들";
  if (related.length === 1) return `${related[0]} 같은 곳`;
  return `${related.slice(0, 2).join("·")} 같은 곳`;
}

/**
 * depth.why — 오늘 데이터를 담담히. 예측 없이 "무슨 일이 있었나"만.
 * 언급 횟수 같은 백엔드 수치는 노출하지 않는다(운영자 피드백) — 근거는 card.sources(실제 뉴스)가 보여준다.
 */
function buildWhy(kw: ScoredKeyword): string {
  const phrase = relatedPhrase(kw.related);
  if (kw.mentions === 0) {
    return `오늘은 ${kw.keyword} 쪽에 새 소식이 거의 없어서 사람들 시선이 머물지 않았어. 새 소식이 없으면 이렇게 잠잠하기도 해.`;
  }
  return (
    `오늘 ${kw.keyword} 관련 소식이 여기저기서 돌았어. ` +
    `${phrase}이 같이 묶여 오르내리니까 '나도 봐야 하나' 하는 사람이 늘어난 거야. 아래 실제 뉴스가 그 근거야.`
  );
}

/**
 * card.sources — 이 키워드를 뽑게 한 실제 핵심 뉴스(상위 N). 최신 우선, 제목 중복 제거.
 * 추상 브리핑 대신 "무슨 기사 때문인지"를 직접 보여준다(운영자 피드백 2026-06-14).
 */
const MAX_SOURCES = 3;
function buildSources(articles: readonly KeywordSourceItem[]): KeywordCardSource[] {
  const sorted = [...articles].sort((a, b) =>
    (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")
  );
  const seen = new Set<string>();
  const out: KeywordCardSource[] = [];
  for (const a of sorted) {
    const title = a.title?.trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push({
      title,
      ...(a.source ? { source: a.source } : {}),
      ...(a.url ? { url: a.url } : {}),
    });
    if (out.length >= MAX_SOURCES) break;
  }
  return out;
}

/** ScoredKeyword → KeywordCard(룰 폴백 코멘트 포함, 키워드 해시로 변주 결정). */
export function buildKeywordCard(kw: ScoredKeyword): KeywordCard {
  const band = bandFor(kw.fomoScore);
  const comment = pick(band.comments, kw.keyword)(kw.keyword);
  const remember = pick(band.remembers, kw.keyword)(kw.keyword);
  return {
    id: kw.keyword,
    keyword: kw.keyword,
    emoji: kw.emoji,
    fomoScore: kw.fomoScore,
    comment,
    related: kw.related,
    sources: buildSources(kw.articles),
    depth: {
      whyTitle: band.whyTitle,
      why: buildWhy(kw),
      rememberTitle: band.rememberTitle,
      remember,
    },
  };
}

export function buildKeywordCards(scored: readonly ScoredKeyword[]): KeywordCard[] {
  return scored.map(buildKeywordCard);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — LLM 코멘트 + 가드레일 (KEYWORD_ENGINE_SPEC §4.4)
//
// 순수부: 프롬프트 빌더 + 응답 파서 + 가드(금칙어·균형추) + 룰 폴백 병합.
// 네트워크(LLM 호출)는 apps/web/lib/fomo-keyword-comment.ts 가 담당하고, 검증·병합은 여기로 모은다.
// LLM 실패·레이트리밋·가드 위반 시 자동으로 위 룰 폴백(buildKeywordCard)으로 강등한다.
// ─────────────────────────────────────────────────────────────────────────────

/** LLM 이 키워드별로 돌려주는 코멘트 묶음(앞면 comment + depth.why/remember). */
export interface LlmKeywordComment {
  keyword: string;
  comment: string;
  why: string;
  remember: string;
}

/**
 * 금칙어 가드(§2·§4.4 규칙 2·3). 위반 시 그 LLM 출력은 폐기 → 룰 폴백.
 * - 투자조언/매수매도/종목추천: 행동 지시·추천.
 * - 예측/미래 단정: "오른다/내린다/급등" 등 방향 단정.
 * - 전문용어: 차트·기술 지표 용어(중학생도 알아듣게 하라는 규칙 위반).
 * 주의: 룰 폴백 템플릿("따라 들어가는 건 조심" 등 과거·현재 설명)은 통과해야 하므로
 *   "들어가라/세요" 같은 명령형만 잡고 "들어가는/들어가면" 서술형은 건드리지 않는다.
 * 펀더멘탈(EPS·PER)은 §5 '따뜻하게 풀어줄' 대상이라 금칙에서 제외.
 */
export const COMMENT_FORBIDDEN: RegExp =
  /사라|팔아라|사세요|파세요|매수|매도|손절|익절|불타기|물타기|풀매수|추천|담아라|담으세요|들어가라|들어가세요|진입하|베팅|올인|줍줍|오른다|오를\s*(?:거|것|듯|전망|예정)|내린다|내릴\s*(?:거|것|듯)|상승할|하락할|급등할|폭등|폭락|반등할|텐배거|떡상|떡락|불장|가즈아|목표가|지금\s*안\s*사면|오더블럭|골든크로스|데드크로스|RSI|MACD|볼린저|이평선|지지선|저항선|과매수|과매도|손익비|레버리지|공매도|보조지표|피보나치|이격도/;

/**
 * 균형추(진정 결) 감지 — §4.4 규칙 4: 모든 코멘트는 진정 결로 닫혀야 한다.
 * 룰 폴백용 CALM_MARKERS 보다 넓게(LLM 의 자연스러운 표현까지 포착). 누락 시 폐기.
 */
const CALM_TONE =
  /급(?:해|할|하지|한|히)|기회는\s*또|천천히|조심|아쉬워|무서워할|쉬어가|쉬어도|괜찮|조급|서두르지|놓쳐도|늦었다고|뒤로\s*빠져|물러나|지켜보|한\s*박자|천천히\s*봐도/;

/** LLM 출력이 가드를 통과하는가(금칙어 없음 + 균형추 있음). */
export function isCommentSafe(text: string): boolean {
  if (!text) return false;
  return !COMMENT_FORBIDDEN.test(text);
}

/** comment + remember 묶음에 진정 결이 1개 이상 있는가. */
export function hasCalmTone(text: string): boolean {
  return CALM_TONE.test(text);
}

/**
 * LLM 코멘트 묶음 검증(§4.4). 하나라도 어기면 false → 호출부가 룰 폴백으로 강등.
 * - comment/why/remember 모두 비어있지 않을 것.
 * - 어느 필드에도 금칙어 없을 것.
 * - comment+remember 에 균형추(진정 결) 있을 것.
 */
export function validateLlmComment(c: LlmKeywordComment | undefined | null): c is LlmKeywordComment {
  if (!c) return false;
  const { comment, why, remember } = c;
  if (!comment?.trim() || !why?.trim() || !remember?.trim()) return false;
  const blob = `${comment} ${why} ${remember}`;
  if (!isCommentSafe(blob)) return false;
  return hasCalmTone(`${comment} ${remember}`);
}

/**
 * 룰 폴백 카드에 검증된 LLM 코멘트를 얹는다. LLM 이 없거나 가드 위반이면 룰 카드 그대로(자동 강등).
 * 점수·관련 종목·이모지 등 카드의 사실 부분은 LLM 이 건드리지 않는다(코멘트 텍스트만 교체).
 */
export function applyLlmComment(card: KeywordCard, llm: LlmKeywordComment | undefined): KeywordCard {
  if (!validateLlmComment(llm)) return card;
  return {
    ...card,
    comment: llm.comment.trim(),
    depth: {
      ...card.depth,
      why: llm.why.trim(),
      remember: llm.remember.trim(),
    },
  };
}

/** §4.4 가드레일 프롬프트(운영자 톤 스펙 반영). 배치: 여러 키워드를 한 콜로. */
export function buildKeywordCommentPrompt(
  items: readonly { keyword: string; score: number; titles: readonly string[]; related: readonly string[] }[]
): string {
  const payload = items.map((it) => ({
    keyword: it.keyword,
    score: it.score,
    titles: it.titles.slice(0, 5),
    related: it.related.slice(0, 3),
  }));
  return [
    "너는 'FOMO Club'의 마스코트 포모다. 새벽 1시에 차트 보며 똑같이 불안해하는 친구다.",
    "아래 키워드 각각에 대해, 오늘 그 키워드에 쏠린 흐름을 한마디로 짚어준다.",
    "",
    "톤(반드시 — '정중한 반말'):",
    '- 주어는 \'오늘/시장/흐름\'이다. 상대를 지목·평가하지 않는다. "너는/네가/너도/너만" 같은 2인칭 지목 금지.',
    '- 친구 같은 거리감의 반말 어미(~네/~더라/~야/~어)는 유지하되, 매너 있게. 위에서 가르치지 마라.',
    "- 상황을 짚고 즉시 진정시킨다. 결: \"오늘 이거 관심이 많이 몰렸네. 왜 그런지 보면 —",
    '  다들 그래서 더 술렁이는 거고. 잠깐 뒤로 빠져서 지켜봐도 돼." (베끼지 말고 이 결을 따를 것)',
    "",
    "규칙(어기면 그 키워드 출력은 폐기된다):",
    "1) 과거·현재 사실만 설명. 미래 단정·예측 절대 금지(오른다/내린다/급등/반등할 금지).",
    "2) 매수·매도·추천·종목 권유 금지(사라/팔아라/매수/들어가라 금지).",
    "3) 전문용어 금지. 꼭 나오면 친구가 풀어주듯 쉽게(예: \"오더블럭? 큰손들이 사 모은 가격대야\").",
    "4) 반드시 균형추(진정)로 닫는다: \"안 급해도 돼 / 기회는 또 와 / 잠깐 지켜보자\" 결.",
    "5) 점수가 높을수록(60+) 진정 톤을 더 강하게. 낮으면(40-) \"조용한 건 나쁜 게 아니야\" 결.",
    "6) '몇 번 언급됐다 / N건 돌았다' 같은 *횟수 수치* 금지(유저에게 의미 없음). 대신 실제 기사 흐름을 자연스럽게 녹여라.",
    "",
    'comment 는 2~3줄, why 는 왜 쏠렸는지 실제 기사 내용을 근거로 용어 없이, remember 는 균형추 한마디.',
    '출력은 JSON 배열만(그 외 텍스트 0): [{"keyword","comment","why","remember"}]',
    "",
    JSON.stringify(payload),
  ].join("\n");
}

/** LLM 응답(JSON 배열) 파서 — parseFomoComments 와 동형, 4필드. 코드펜스/잡텍스트 허용. */
export function parseKeywordComments(content: string): LlmKeywordComment[] {
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
  const out: LlmKeywordComment[] = [];
  for (const r of arr) {
    if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const keyword = typeof o.keyword === "string" ? o.keyword.trim() : "";
      const comment = typeof o.comment === "string" ? o.comment.trim() : "";
      const why = typeof o.why === "string" ? o.why.trim() : "";
      const remember = typeof o.remember === "string" ? o.remember.trim() : "";
      if (keyword && comment) out.push({ keyword, comment, why, remember });
    }
  }
  return out;
}

/**
 * 전체 산출 신뢰도(응답 confidence, §4.6·§5). 정직성 노출.
 * - 키워드 0건 → "fallback"(보여줄 게 없음 → 라우트가 mock 으로 대체).
 * - 키워드 있음 → Phase 2 는 30일 절대 기준선이 없어 'high' 도달 불가. 카드별 confidence 중 최선.
 *   (Phase 2 는 전부 'low' — (a)volume 은 당일 상대값, 절대 기준선은 Phase 4.)
 */
export function overallConfidence(scored: readonly ScoredKeyword[]): KeywordConfidence {
  if (scored.length === 0) return "fallback";
  const order: KeywordConfidence[] = ["high", "medium", "low", "fallback"];
  let best: KeywordConfidence = "fallback";
  for (const k of scored) {
    if (order.indexOf(k.confidence) < order.indexOf(best)) best = k.confidence;
  }
  return best;
}
