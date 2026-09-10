/**
 * WO-RESET-02 PART A-2 — 공시 제목을 종류로 분류한다. 순수 함수(네트워크·시간·난수 0).
 *
 * ## 규칙으로 한다. 모르겠으면 `기타`.
 *
 * WO 가 못을 박았다: **"분류를 못 하겠으면 `기타`로 둔다. 억지로 넣지 않는다."**
 * 그래서 여기 규칙은 **제목에 실제로 박혀 있는 말**만 본다. 추론하지 않는다 —
 * `단일판매·공급계약체결` 은 수주가 맞지만, `투자판단 관련 주요경영사항` 은 무엇이든 될 수
 * 있으므로 `기타`다.
 *
 * ## 순서가 규칙의 일부다
 *
 * 한 제목이 여러 규칙에 걸릴 수 있다(`유상증자결정` 은 `자금`, `타법인주식취득자금 조달을 위한
 * 유상증자` 는 둘 다 걸린다). 위에서 아래로 **처음 걸리는 것**을 쓰므로 순서를 바꾸면 분류가
 * 바뀐다. 표의 순서는 WO A-2 의 표 순서를 그대로 따른다.
 *
 * ## 정정 공시
 *
 * `[정정]`·`정정신고` 접두는 원 제목의 종류를 그대로 물려받는다 — 정정이라는 사실은 종류가
 * 아니라 상태다. 접두만 떼고 다시 본다.
 */

/** WO A-2 의 일곱 갈래. 화면에도 이 말을 그대로 쓴다. */
export type DisclosureKind = "실적" | "수주" | "투자" | "자금" | "주주환원" | "지분" | "기타";

/**
 * 종류별 제목 규칙. **위에서부터** 처음 맞는 것을 쓴다.
 *
 * 미국(SEC)은 제목이 아니라 **폼 번호**로 온다 — `8-K`, `10-Q` 처럼. 그래서 폼 번호도 같은
 * 표에서 다룬다(`classifyDisclosure` 가 폼 번호를 먼저 본다).
 */
const KR_RULES: ReadonlyArray<readonly [DisclosureKind, RegExp]> = [
  ["실적", /매출액또는손익구조|손익구조\s*30|영업[\s(]*잠정[\s)]*실적|영업실적|결산실적|실적발표/],
  ["수주", /단일판매|공급계약|수주|납품계약/],
  ["투자", /신규시설투자|시설투자|타법인\s*주식|타법인주식|출자|영업양수/],
  ["자금", /유상증자|무상증자|전환사채|신주인수권부사채|교환사채|사채발행|자금조달|차입/],
  ["주주환원", /자기주식|자사주|현금[·ㆍ]?배당|배당결정|주식소각/],
  ["지분", /최대주주\s*변경|최대주주변경|임원[ㆍ·]?\s*주요주주|주식등의\s*대량보유|대량보유상황|지분\s*변동/],
];

/**
 * SEC 폼 번호 → 종류.
 *
 * 폼 번호는 **의미가 고정**돼 있어 제목 정규식보다 정확하다. 표에 없는 폼은 `기타`다 —
 * `8-K` 는 무엇이든 담을 수 있어서 억지로 분류하지 않는다(WO: 모르겠으면 기타).
 */
const SEC_FORM_RULES: ReadonlyArray<readonly [DisclosureKind, RegExp]> = [
  ["실적", /^(10-Q|10-K|6-K)(\/A)?$/i],
  ["지분", /^(4|3|5|SC\s*13[DG])(\/A)?$/i],
  ["자금", /^(S-1|S-3|424B\d?)(\/A)?$/i],
];

/** `[정정]` · `[기재정정]` 같은 접두. 정정은 상태이지 종류가 아니다. */
const CORRECTION_PREFIX = /^\s*\[[^\]]*정정[^\]]*\]\s*/;

/**
 * 제목(또는 SEC 폼 번호)을 종류로 분류한다.
 *
 * @param title DART 는 `report_nm`, SEC 는 `form` 을 그대로 넘긴다.
 */
export function classifyDisclosure(title: string | undefined | null): DisclosureKind {
  const raw = title?.trim();
  if (!raw) return "기타";

  // SEC 폼 번호는 짧고 형태가 고정돼 있다 — 제목 규칙보다 먼저 본다.
  for (const [kind, pattern] of SEC_FORM_RULES) {
    if (pattern.test(raw)) return kind;
  }

  const text = raw.replace(CORRECTION_PREFIX, "").replace(/\s+/g, "");
  for (const [kind, pattern] of KR_RULES) {
    if (pattern.test(text)) return kind;
  }
  return "기타";
}

/**
 * 화면에 쓸 짧은 표현. 제목 전체는 길어서 한 줄에 안 들어간다.
 *
 * **제목을 고치지 않는다** — 잘라 쓰는 것과 바꿔 쓰는 것은 다르다. 여기서는 종류만 돌려주고,
 * 원 제목은 `[원문]` 링크 뒤에 그대로 있다.
 */
export function disclosureKindLabel(kind: DisclosureKind): string {
  return kind === "기타" ? "공시" : `${kind} 공시`;
}
