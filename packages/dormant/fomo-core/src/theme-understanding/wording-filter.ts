/**
 * 워딩 안전 필터 (룰 단계) — DATA_ENGINE_STRATEGY Track C 선행 안전장치.
 *
 * 커뮤니티 워딩을 카드에 넣기 전 거른다. 소스를 넓히면(C) 거친 말·단정·찌라시가 폭발하므로,
 * 필터 없이 노출하면 제품이 그 말을 *보증*하는 꼴이 된다. 룰(여기) + LLM 판정(apps/web) 조합.
 *
 * 거를 것: 욕설/비방, 종목 단정("무조건 간다/판다"), 찌라시/허위 단정, 정치/혐오.
 * 살릴 것: 감정·심리를 드러내는 생생한 표현("전강후약 쎄함" 등).
 * 애매하면 버린다(정직·안전 우선) — 단, 룰은 명백한 것만 자르고 애매함은 LLM 단계에 맡긴다.
 *
 * 통과한 워딩은 원문 그대로(변조 금지). 왜 걸렀는지 reason 을 남겨 검수 가능하게 한다.
 */

export interface WordingVerdict {
  /** 원문 워딩(변조 없음). */
  text: string;
  kept: boolean;
  /** 통과/탈락 사유(검수용). */
  reason: string;
  stage: "rule" | "llm";
}

/** 욕설·비방·혐오(명백). */
const PROFANITY =
  /(씨발|시발|ㅅㅂ|존나|ㅈㄴ|병신|ㅂㅅ|지랄|새끼|개[새세]끼|좆|썅|닥쳐|꺼져|애미|틀딱|급식충|한남|김치녀|메갈|일베|토착왜구|빨갱이)/;

/** 종목 단정·매매신호·허위/찌라시(명백). 감정 표현은 안 걸리게 '무조건/100%/확정' 등 강한 단정만. */
const ASSERTION_OR_RUMOR =
  /(무조건\s*(간다|오른다|먹는다|상한가|떡상)|반드시\s*(간다|오른다|먹는다)|100\s*%|확정\s*(상한가|떡상|간다)|올인\s*해|전재산|풀매수\s*각|필패|내부\s*정보|카더라|지라시|찌라시|상한가\s*간다|무조건간다|지금\s*안\s*사면\s*후회)/;

/**
 * 룰 단계 판정. 명백한 위반만 자르고(kept:false), 나머지는 통과(LLM 단계가 애매함 재판정).
 * 통과/탈락 모두 reason 을 남긴다.
 */
export function screenWordingRule(text: string): WordingVerdict {
  const t = text.trim();
  if (!t) return { text, kept: false, reason: "빈 워딩", stage: "rule" };
  if (PROFANITY.test(t)) return { text, kept: false, reason: "욕설/비방/혐오", stage: "rule" };
  if (ASSERTION_OR_RUMOR.test(t))
    return { text, kept: false, reason: "종목 단정/매매신호/찌라시", stage: "rule" };
  return { text, kept: true, reason: "룰 통과", stage: "rule" };
}
