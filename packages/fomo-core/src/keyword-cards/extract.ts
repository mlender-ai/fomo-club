import type { NewsLang } from "../news-feed/types";

/**
 * 키워드/테마 추출 — 사전 기반 1차. KEYWORD_ENGINE_SPEC §4.2.
 *
 * 순수 함수(네트워크·DB 0). 입력: 점수 매기기 전 뉴스/커뮤니티 글 배열.
 * 출력: 테마별 버킷 { keyword, articles, mentions, engagement, emoji }.
 * LLM 클러스터링 X(예측 불가·디버깅 난해) — 사전 매칭으로 정직·재현 가능하게. v2에서 임베딩 확장.
 */

/** 추출 입력 — 뉴스 기사 또는 커뮤니티 글. fetch 는 Phase 2 라우트 담당. */
export interface KeywordSourceItem {
  title: string;
  summary?: string;
  /** 원문 링크(있으면 카드 소스에서 클릭 가능). */
  url?: string;
  /** 소스 신뢰도 등급(DATA_ENGINE_STRATEGY §4.5). 이해 레이어로 전달돼 가중·표기에 쓰임. */
  tier?: import("../news-feed/types").SourceTier;
  /** 발행/작성 시각 ISO. 최신성·가속 계산용(없으면 무시). */
  publishedAt?: string;
  /** 커뮤니티 참여도(upvote+댓글 합). 뉴스는 0/생략. */
  engagement?: number;
  source?: string;
  lang?: NewsLang;
}

interface ThemeDef {
  /** 고정 이모지(분위기). §4.2 */
  emoji: string;
  /** 매칭 용어 — EN+KO. 한 글이 복수 테마에 매칭될 수 있다. */
  terms: readonly string[];
  /** 관련 종목/테마 미니 리스트(시세 아님 — "다들 이런 것들 봤어"). KeywordCard.related 소스. */
  related: readonly string[];
}

/**
 * 테마 사전(MVP). 코인+주식 테마만(PRODUCT_TRUTH §4 Now). 부동산·환율은 Later.
 * 용어 추가/조정은 운영 중 데이터 보며 튜닝. 오추출 1건이 신뢰를 깨므로 보수적으로.
 */
export const THEME_DICTIONARY: Record<string, ThemeDef> = {
  반도체: {
    emoji: "🔥",
    terms: ["반도체", "HBM", "엔비디아", "SK하이닉스", "삼성전자", "TSMC", "메모리", "파운드리", "semiconductor", "chip", "nvidia"],
    related: ["삼성전자", "SK하이닉스", "엔비디아"],
  },
  AI: {
    emoji: "🤖",
    terms: ["AI", "인공지능", "오픈AI", "챗GPT", "ChatGPT", "LLM", "GPT", "openai", "엔비디아"],
    related: ["엔비디아", "마이크로소프트", "팔란티어"],
  },
  코인: {
    emoji: "₿",
    // "ETF" 제외 — 일반 래퍼라 반도체/지수 ETF 기사까지 코인으로 오추출(2026-06-14 false-positive).
    terms: ["비트코인", "이더리움", "코인", "암호화폐", "가상자산", "스테이블코인", "crypto", "bitcoin", "btc", "ethereum", "eth"],
    related: ["비트코인", "이더리움"],
  },
  금리: {
    emoji: "💵",
    terms: ["금리", "연준", "FOMC", "기준금리", "채권", "인플레", "물가", "rate", "fed", "fomc"],
    related: ["은행주", "채권"],
  },
  "2차전지": {
    emoji: "🔋",
    terms: ["2차전지", "2차 전지", "배터리", "에코프로", "LG에너지", "전기차", "battery"],
    related: ["에코프로비엠", "LG에너지솔루션"],
  },
};

export interface ExtractedKeyword {
  keyword: string;
  emoji: string;
  /** 관련 종목/테마 미니 리스트(시세 아님). 테마 사전 고정값. */
  related: readonly string[];
  /** 이 테마에 매칭된 원본 글. */
  articles: KeywordSourceItem[];
  /** 매칭 글 수(언급량). */
  mentions: number;
  /** 참여도 합(커뮤니티 upvote+댓글). */
  engagement: number;
  // ── 미래 확장 자리(Phase 2+, PRODUCT_VISION §7) — 지금은 미산출. 타입을 닫지 않기 위해 선점. ──
  /** 쏠림 첫 감지일(YYYY-MM-DD). 일일 스냅샷 누적 시 채운다(타이밍 판단 보조용). */
  firstDetectedAt?: string;
  /** 연속 감지일 수. 스냅샷 누적 시 채운다. */
  consecutiveDays?: number;
}

/** ASCII 영숫자 용어(단어경계 매칭 대상)인가. "AI"/"GPT"/"eth" 등 — 'shanghai'의 'ai' 부분일치 방지. */
function isAsciiTerm(t: string): boolean {
  return /^[a-z0-9]+$/i.test(t);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ThemeMatcher {
  keyword: string;
  /** 비-ASCII(한글 등) 용어 — 부분일치(소문자). */
  substrings: readonly string[];
  /** ASCII 약어 — 단어경계 매칭(앞뒤에 영숫자 없을 때만). 룩비하인드 없이 호환되게. */
  regexes: readonly RegExp[];
}

/**
 * 테마별 매처 사전 컴파일. ASCII 용어는 단어경계로, 한글 용어는 부분일치로.
 * (2026-06-14) 단순 substring 이 "AI"→"shanghai", "fed"→"federal" 같은 오추출을 냈다.
 */
const THEME_MATCHERS: readonly ThemeMatcher[] = Object.entries(THEME_DICTIONARY).map(
  ([keyword, def]) => {
    const substrings: string[] = [];
    const regexes: RegExp[] = [];
    for (const t of def.terms) {
      const low = t.toLowerCase();
      if (isAsciiTerm(t)) {
        // 앞뒤가 문자열 끝이거나 비영숫자일 때만 — "ai"가 "shanghai" 안에서 안 걸리게.
        regexes.push(new RegExp(`(^|[^a-z0-9])${escapeRegex(low)}([^a-z0-9]|$)`));
      } else {
        substrings.push(low);
      }
    }
    return { keyword, substrings, regexes };
  }
);

/** 한 글이 어떤 테마에 매칭되는지 — 한글=부분일치, 영문 약어=단어경계(대소문자 무시). */
function matchedThemes(item: KeywordSourceItem): string[] {
  const blob = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const hits: string[] = [];
  for (const m of THEME_MATCHERS) {
    if (m.substrings.some((s) => blob.includes(s)) || m.regexes.some((re) => re.test(blob))) {
      hits.push(m.keyword);
    }
  }
  return hits;
}

/**
 * 글 배열 → 테마 버킷. mention 0 테마는 제외(정직: 안 쏠렸으면 안 보여준다, §4.2 step 3).
 * 정렬: 언급량 내림차순(동률이면 참여도) — 점수는 score.ts가 매긴다.
 */
export function extractKeywords(items: KeywordSourceItem[]): ExtractedKeyword[] {
  const buckets = new Map<string, KeywordSourceItem[]>();
  for (const item of items) {
    for (const keyword of matchedThemes(item)) {
      const arr = buckets.get(keyword) ?? [];
      arr.push(item);
      buckets.set(keyword, arr);
    }
  }

  const out: ExtractedKeyword[] = [];
  for (const [keyword, articles] of buckets) {
    out.push({
      keyword,
      emoji: THEME_DICTIONARY[keyword]!.emoji,
      related: THEME_DICTIONARY[keyword]!.related,
      articles,
      mentions: articles.length,
      engagement: articles.reduce((s, a) => s + (a.engagement ?? 0), 0),
    });
  }
  out.sort((a, b) => b.mentions - a.mentions || b.engagement - a.engagement);
  return out;
}
