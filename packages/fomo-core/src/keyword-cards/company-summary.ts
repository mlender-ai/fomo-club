/**
 * "어떤 회사예요" 요약 다듬기 (WO-SUB-HOOK PART 3-3) — 벤더 원문을 그대로 노출하지 않는다.
 *
 * ## 무엇이 문제였나 (2026-08-14 화면 실측 D7)
 *
 *   동사는 1990년 빅텍파워시스템으로 설립되어 1996년 법인 설립, 2003년 코스닥시장에 상장하였음.
 *   … 방위사업에서 전자전 시스템, 군용전원공급장치, … 생산하고, 민수사업에서는 공공자전거
 *   무인대여시스템을 운영하고 있음.
 *
 * 등기부 문체(`~하였음`)가 카드 전체 해요체와 충돌하고, **첫 문장이 설립·상장 연도로 시작한다.**
 * 처음 보는 회사에서 사용자가 알아야 할 것은 "무엇을 만들어 파는가"지 1996년 법인 설립이 아니다.
 *
 * ## 무엇을 하나
 *
 * 1. 설립·상장·법인 설립만 말하는 문장을 버린다(연혁은 판단에 쓰이지 않는다).
 * 2. 종결어미를 해요체로 바꾼다(`하였음` → `했어요`).
 * 3. 두 문장까지만 남긴다 — 카드 뎁스 첫 블록은 훑어보는 자리다.
 * 4. 원문은 버리지 않고 그대로 돌려준다. 화면이 "출처 보기"로 접어 둔다(정직 원칙).
 *
 * **요약을 새로 쓰지 않는다.** LLM 도 부르지 않는다(INV-14 — 렌더 경로에서 계산/LLM 금지).
 * 있는 문장을 고르고 어미만 바꾸는 순수 함수다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## FIX-02 PART A — **사업 문장을 순서 때문에 놓치고 있었다**
 *
 * 실측(2026-09-04): 덱 국내 12종목이 **전부** 200자 넘는 벤더 요약을 갖고 있는데
 * 화면에 회사 설명이 나온 것은 5종목뿐이었다. 데이터가 아니라 **우리가 버린 것**이다.
 *
 * 벤더 요약은 이렇게 생겼다 — **답은 맨 끝에 있다**:
 *
 * ```
 * ① 동사는 1990년 대원공업으로 설립되었으며 2001년 넥스틸로 상호 변경, 2023년 … 상장됨.
 * ② 연결대상 종속회사로 비상장 3개사를 보유하며, 미국 법인을 운영하고 …
 * ③ 동사는 강관의 생산과 판매가 주요사업으로, OCTG, 송유관, … 수출·판매하고 있음.   ← 이것
 * ```
 *
 * 종전 코드는 **원문 순서대로 훑다가 두 문장을 채우면 멈췄다.** ①은 연혁이라 버려도
 * ②(종속회사)가 통과해 자리를 차지하고, ③에는 **도달하지 못했다.** 그 뒤 화면 필터
 * (`companyBlurb`)가 ②를 연혁으로 다시 버리니 **남는 게 없어 설명이 사라졌다.**
 *
 * ## 그래서 **위치가 아니라 내용으로 고른다**
 *
 * 문장마다 점수를 매겨(무엇을 파는가 = +, 연혁·지배구조 = −) 높은 것부터 두 개를 고르고,
 * **원문 순서로 다시 늘어놓는다**(읽는 순서는 원문이 맞다).
 *
 * 지배구조 문장(`종속회사`·`계열사`·`지주회사 역할`)은 **버린다** — 「무엇을 파는가」가
 * 아니고, 그게 남으면 `대한항공` 처럼 계열사 나열이 회사 설명 자리에 앉는다(WO A-3 금지).
 */

export interface CompanySummaryCopy {
  /** 화면에 낼 문장(해요체, 연혁 제거, 최대 2문장). 남길 게 없으면 빈 문자열. */
  text: string;
  /** 벤더 원문 — "출처 보기"로 접어 둔다. */
  raw: string;
  /** 원문에서 실제로 덜어냈는가(접기 UI 노출 판단용). */
  trimmed: boolean;
}

/** 연혁 문장 — 설립·상장·법인만 말하는 문장은 첫 화면에서 뺀다. */
const HISTORY_ONLY = /(설립|상장|법인\s?설립|합병하였|분할하였|사명을?\s?변경)/;
/** 회사가 무엇을 하는지 말하는 문장 — 연혁 낱말이 섞여 있어도 이건 남긴다. */
const BUSINESS_HINT = /(생산|제조|판매|공급|서비스|운영|영위|제공|개발|사업)/;

/**
 * **무엇을 파는가**를 직접 말하는 표지 (FIX-02 A-3 첫 문장 규칙).
 * 이게 있는 문장을 가장 앞에 세운다 — 벤더 요약에서 그 문장은 보통 맨 끝에 있다.
 */
const SELLS_WHAT = /(주요\s?(사업|제품|매출)|주력|제품으로는|생산하고|제조하고|판매하고|공급하고|서비스를\s?제공|유통|만들|취급)/;

/**
 * 지배구조 문장 — 종속회사·계열사·지주 역할. **회사 설명이 아니다.**
 *
 * 실측에서 이 문장들이 설명 자리를 차지했다:
 *  · 대한항공: `아시아나항공, 진에어 등 항공운송 계열사와 … 계열사를 두고 있어요`
 *  · 유진기업: `주요 종속회사로 골프장 운영의 동화기업(주)·유진레저(주), …`
 *
 * WO A-3 이 금지한 「계열사 수」다. 사업 문장이 있으면 그걸 쓰고, 없으면 아무 말도 안 한다.
 */
const OWNERSHIP_ONLY = /(종속\s?회사|계열\s?(회사|사)|지주\s?회사\s?역할|중간지배)/;

/**
 * 사업 **부문·제품을 구체적으로** 말하는 표지 — 같은 점수 다툼에서 이걸 앞세운다.
 *
 * 실측(LIG아큐버): `계열사 Accuver 를 통해 전 세계에 제품과 서비스를 제공하고 있음` 과
 * `이동통신 사업부는 무선망 최적화 … 오토모티브는 차량용 반도체 유통 …` 이 같은 점수였고
 * **원문에서 앞선 전자가 이겼다.** 뒤엣것이 「무엇을 파는가」에 훨씬 가깝다.
 */
const SEGMENT_DETAIL = /(사업부|부문|주요\s?제품|제품으로는)/;

/** 등기부 종결어미 → 해요체. 긴 것부터 본다(부분 치환 방지). */
const ENDING_RULES: ReadonlyArray<[RegExp, string]> = [
  [/하고\s?있음$/, "하고 있어요"],
  [/되고\s?있음$/, "되고 있어요"],
  [/하였음$/, "했어요"],
  [/되었음$/, "됐어요"],
  [/이었음$/, "이었어요"],
  [/있음$/, "있어요"],
  [/없음$/, "없어요"],
  [/中임$/, "중이에요"],
  [/중임$/, "중이에요"],
  [/함$/, "해요"],
  [/됨$/, "돼요"],
  [/임$/, "이에요"],
];

const MAX_SENTENCES = 2;
/** 문장이 길면 카드 뎁스 첫 블록이 벽이 된다. 넘치면 문장 단위로 자른다. */
const MAX_CHARS = 140;

function toPoliteEnding(sentence: string): string {
  const body = sentence.replace(/\.$/, "").trim();
  for (const [pattern, replacement] of ENDING_RULES) {
    if (pattern.test(body)) return `${body.replace(pattern, replacement)}.`;
  }
  // 규칙에 없는 `~음` 은 일반 변환으로 내린다("영위음" 같은 조어는 원문에 없다).
  if (/음$/.test(body)) return `${body.replace(/음$/, "어요")}.`;
  return /[.!?]$/.test(sentence.trim()) ? sentence.trim() : `${body}.`;
}

/**
 * 벤더 요약 → 화면 문장. 한국어 원문이 아니면(영문 프로필 등) 손대지 않는다 —
 * 어미 규칙이 한국어 전용이라 영문에 적용하면 문장을 망가뜨린다.
 */
export function rewriteCompanySummary(raw: string | null | undefined): CompanySummaryCopy {
  const source = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!source) return { text: "", raw: "", trimmed: false };
  if (!/[가-힣]/.test(source)) return { text: source, raw: source, trimmed: false };

  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  /**
   * **위치가 아니라 내용으로 고른다**(FIX-02 A). 점수가 같으면 원문이 앞선 것이 이긴다.
   *
   * | 점수 | 무엇 |
   * |---|---|
   * | +2 | 무엇을 파는가를 직접 말한다(`주요 제품으로는` · `제조하고` …) |
   * | +1 | 사업 낱말이 있다(`서비스` · `개발` …) |
   * | −1 | 연혁 낱말이 섞였다(사업 문장이어도 뒤로 밀린다) |
   * | 제외 | 연혁만 · 지배구조만 말하는 문장 |
   */
  const scored = sentences
    .map((sentence, index) => {
      const history = HISTORY_ONLY.test(sentence);
      const business = BUSINESS_HINT.test(sentence);
      const sells = SELLS_WHAT.test(sentence);
      const ownership = OWNERSHIP_ONLY.test(sentence);
      // 연혁만 · 지배구조만 말하는 문장은 회사 설명이 아니다.
      if (history && !business) return null;
      if (ownership && !sells) return null;
      const score =
        (sells ? 2 : business ? 1 : 0) +
        (SEGMENT_DETAIL.test(sentence) ? 1 : 0) -
        (history ? 1 : 0) -
        // 계열사·종속회사를 끼고 말하는 문장은 사업 문장이어도 뒤로 밀린다(A-3: 계열사 금지).
        (ownership ? 1 : 0);
      return { sentence, index, score };
    })
    .filter((row): row is { sentence: string; index: number; score: number } => row !== null);

  /**
   * **더 나은 문장이 있으면 연혁을 아예 쓰지 않는다** (FIX-02 A-3: 설립·상장 연도 금지).
   *
   * CJ프레시웨이 실측: 연혁 문장이 짧아 길이 제한에 걸리지 않았고, 두 문장 상한 안에
   * 사업 문장과 나란히 앉았다. 그래서 화면 첫 문장이 `1988년 … 설립되어` 로 시작했다.
   * 「무엇을 파는가」를 직접 말하는 문장이 하나라도 있으면 연혁 문장은 자리를 얻지 못한다.
   */
  const hasSells = scored.some((row) => SELLS_WHAT.test(row.sentence));
  const preferred = hasSells ? scored.filter((row) => !HISTORY_ONLY.test(row.sentence)) : scored;
  const pool = preferred.length > 0 ? preferred : scored;

  const ranked = pool.slice().sort((a, b) => b.score - a.score || a.index - b.index).slice(0, MAX_SENTENCES);

  /**
   * 길이 초과 시 **점수가 낮은 문장을 버린다.**
   *
   * 종전에는 배열 끝을 잘랐다(`kept.pop()`). 고른 문장을 원문 순서로 늘어놓으면 사업 문장이
   * 뒤에 오는 일이 많아서, **길이 때문에 정작 필요한 문장이 날아갔다**
   * (제테마 실측: 사업 문장이 잘려 나가고 공장 준공 연혁만 남았다).
   */
  const chosen = [...ranked];
  const render = (rows: typeof ranked) =>
    rows
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(({ sentence }) => {
        // 주어가 "동사(同社)"면 등기부 말투다 — 문장에서 뺀다(뒤 문장이 회사를 이미 특정한다).
        const cleaned = sentence.replace(/^동사(는|의|가)\s*/, "").replace(/동사/g, "이 회사");
        return toPoliteEnding(cleaned);
      });

  let kept = render(chosen);
  let text = kept.join(" ");
  while (text.length > MAX_CHARS && chosen.length > 1) {
    // 점수가 가장 낮은 것(같으면 원문에서 뒤에 있던 것)을 뺀다.
    let worst = 0;
    for (let i = 1; i < chosen.length; i += 1) {
      const a = chosen[i]!;
      const b = chosen[worst]!;
      if (a.score < b.score || (a.score === b.score && a.index > b.index)) worst = i;
    }
    chosen.splice(worst, 1);
    kept = render(chosen);
    text = kept.join(" ");
  }

  return {
    text,
    raw: source,
    trimmed: text.replace(/\s+/g, "") !== source.replace(/\s+/g, ""),
  };
}
