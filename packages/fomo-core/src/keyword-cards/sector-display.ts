/**
 * 업종 **표시명** 표 (FLOW-01 A-1 · DETAIL-01 PART E). 순수 데이터·함수(네트워크·시간·난수 0).
 *
 * ## 왜 필요한가
 *
 * 집계에 쓰는 업종명은 **네이버 산업분류 원문**이다(`sector-map` 이 매일 받아 온다).
 * 그 이름은 분류용이라 화면에 그대로 쓰면 두 가지가 깨진다.
 *
 * ```
 * 잘림     반도체와반...        ← 카드 폭을 넘긴다
 * 어려움   전자장비와기기        ← 무슨 업종인지 모른다
 * ```
 *
 * **이름을 자르지 않는다**(FLOW-01 「하지 말 것」). 자르는 대신 짧은 표시명을 따로 둔다.
 *
 * ## 원문을 바꾸지 않는다
 *
 * 이 표는 **표시 전용**이다. 집계 키·`MACRO_SENSITIVITY` 의 업종 목록·`sector-map` 의
 * `byCode` 는 전부 원문 그대로다. 표시명을 집계에 쓰면 두 이름이 갈라져 연결이 끊긴다 —
 * `macro-link.ts` 가 「우리 분류표에 없는 이름을 적으면 영영 연결이 안 된다」고 적어 둔 것과
 * 같은 함정이다.
 *
 * ## 사람이 검토한다
 *
 * 표시명은 우리가 지은 이름이라 **틀릴 수 있다.** `제약` 을 `바이오` 로 부르는 것 같은 판단은
 * 코드가 정할 일이 아니다. 표에 없는 업종은 원문을 그대로 쓴다 —
 * **모르면 지어내지 않고 원문을 보여준다.**
 *
 * 원본 목록 실측: 2026-09-02 네이버 산업분류 **79개**.
 */

/**
 * 카드·상세에서 한 줄에 들어가는 한글 길이 상한.
 *
 * 실측 기준이 아니라 규약이다 — 이 값을 넘는 표시명이 생기면 테스트가 잡는다.
 * 넘겼다는 것은 표시명을 더 줄이거나, 그 업종은 원문이 이미 짧다는 뜻이다.
 */
export const SECTOR_DISPLAY_MAX_CHARS = 7;

/**
 * 원문 → 표시명. **다른 것만 적는다** — 원문이 이미 짧고 읽히면 표에 넣지 않는다
 * (`화학` · `조선` · `은행` 처럼).
 *
 * 줄이는 규칙:
 *  - 접속어(`와` · `과` · `및`)로 이어붙인 나열은 **대표 하나**로 (`반도체와반도체장비` → `반도체`)
 *  - 분류용 수식어(`다각화된` · `기타`)는 뗀다
 *  - 사람이 실제로 쓰는 말이 있으면 그것을 쓴다 (`우주항공과국방` → `방산`)
 */
export const SECTOR_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // ── 자르지 않으면 확실히 넘치는 것들 ──
  반도체와반도체장비: "반도체",
  전자장비와기기: "전자부품",
  디스플레이장비및부품: "디스플레이",
  디스플레이패널: "디스플레이",
  컴퓨터와주변기기: "IT하드웨어",
  사무용전자제품: "사무기기",
  전자제품: "전자제품",
  통신장비: "통신장비",
  핸드셋: "휴대폰",

  // ── 운송·물류 ──
  항공화물운송과물류: "물류",
  도로와철도운송: "육상운송",
  운송인프라: "운송인프라",
  항공사: "항공",
  해운사: "해운",

  // ── 헬스케어 ──
  건강관리업체및서비스: "의료서비스",
  건강관리장비와용품: "의료기기",
  건강관리기술: "의료IT",
  생명과학도구및서비스: "생명과학",
  생물공학: "바이오",

  // ── 소비 ──
  "섬유,의류,신발,호화품": "의류·패션",
  "호텔,레스토랑,레저": "호텔·레저",
  다각화된소비자서비스: "소비자서비스",
  식품과기본식료품소매: "식품유통",
  인터넷과카탈로그소매: "온라인쇼핑",
  백화점과일반상점: "유통",
  전문소매: "전문소매",
  판매업체: "판매업체",
  무역회사와판매업체: "무역",
  레저용장비와제품: "레저용품",
  가정용기기와용품: "가전",
  가정용품: "생활용품",

  // ── 미디어·통신 ──
  양방향미디어와서비스: "인터넷",
  방송과엔터테인먼트: "미디어",
  게임엔터테인먼트: "게임",
  다각화된통신서비스: "통신",
  무선통신서비스: "무선통신",

  // ── 산업재 ──
  우주항공과국방: "방산",
  상업서비스와공급품: "기업서비스",
  에너지장비및서비스: "에너지설비",
  전기장비: "전기장비",
  건축제품: "건축부품",
  건축자재: "건축자재",

  // ── 유틸리티·에너지 ──
  전기유틸리티: "전력",
  가스유틸리티: "가스",
  복합유틸리티: "복합전력",
  석유와가스: "정유·가스",

  // ── 금융 ──
  기타금융: "금융",
  창업투자: "벤처투자",

  // ── 기타 ──
  복합기업: "지주·복합",
  종이와목재: "제지·목재",
};

/**
 * 화면에 쓸 이름. 표에 없으면 **원문 그대로** — 자르지 않는다.
 *
 * 공백은 정규화하되 원문 자체는 건드리지 않는다(집계 키와 갈라지면 안 되므로,
 * 이 함수의 반환값을 다시 집계에 넣지 말 것).
 */
export function sectorDisplayName(sector: string | null | undefined): string {
  const raw = (sector ?? "").trim();
  if (!raw) return "";
  return SECTOR_DISPLAY_NAMES[raw] ?? raw;
}

/**
 * 표시명이 상한을 넘는 업종 — 검토 대상 목록.
 *
 * 표를 채우다 빠뜨린 것을 **테스트가 잡게** 하려고 둔다. 화면에서 조용히 잘리는 것보다
 * 목록으로 드러나는 편이 낫다.
 */
export function overlongSectorNames(sectors: readonly string[]): string[] {
  return sectors.filter((sector) => sectorDisplayName(sector).length > SECTOR_DISPLAY_MAX_CHARS);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-01 PART E — 미국 업종명. **영어가 화면에 그대로 나가고 있었다.**
//
//     PBR 1.02배
//     Major Banks 업종 중간값 1.02배와 비슷해요      ← 이게 뭔지 모른다
//     ●●●○○  Major Banks 업종 안에서 가운데쯤이에요
//
// 국내는 위 표가 이 일을 하고 있었는데(`반도체와반도체장비` → `반도체`) 미국 종목은
// 아무 표도 타지 않았다. 팩트시트의 `classification.industry` 가 나스닥 원문
// (`api.nasdaq.com/.../summary` 의 `Industry`)이기 때문이다.
//
// ## 모르는 이름은 **지어내지 않고 이름을 뺀다**
//
// 국내 표는 「없으면 원문 그대로」였다. 영어에는 그 규칙을 쓸 수 없다 — 원문이 곧 문제다.
// 그래서 표에 없으면 `null` 을 주고, 문장은 이름 없이 `같은 업종` 으로 쓴다.
// **`금융` 같은 상위 이름으로 갈아치우지 않는다**: 통계는 `Major Banks` 구성원으로 낸
// 값이므로 `금융 업종 평균` 이라고 부르면 없는 모수를 말하는 것이 된다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 나스닥 `Industry` 원문 → 한글 표시명.
 *
 * **키는 실측 문자열이다.** ★ 표시한 것은 `packages/fomo-core/src/archetype/ruleset.ts`
 * 가 실제 응답에서 그대로 가져온 것이고(그 파일 머리말: "추측한 업종명으로 집합을 만들면
 * 매칭이 조용히 실패한다"), 나머지는 나스닥 스크리너 어휘에서 온 것이라 **표기가 다르면
 * 조용히 안 맞는다.** 안 맞으면 이름 없이 `같은 업종` 으로 나가므로 화면은 깨지지 않고,
 * 무엇이 안 맞았는지는 `untranslatedIndustryNames` 가 목록으로 준다.
 *
 * 사람 검토용 정본은 `docs/wo/FIX-01-sentence-repair.md` 의 표다.
 */
export const US_INDUSTRY_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // ── 금융 (★ 실측) ──
  "Major Banks": "은행",
  Banks: "은행",
  "Savings Institutions": "저축은행",
  "Finance: Consumer Services": "소비자금융",
  "Investment Bankers/Brokers/Service": "증권",
  "Investment Managers": "자산운용",
  "Property-Casualty Insurers": "손해보험",
  "Life Insurance": "생명보험",
  "Accident &Health Insurance": "건강보험",
  "Specialty Insurers": "특종보험",
  "Diversified Financial Services": "종합금융",
  "Finance Companies": "여신금융",
  "Real Estate Investment Trusts": "리츠",

  // ── 헬스케어 (★ 실측 + 스크리너 어휘) ──
  "Biotechnology: Biological Products (No Diagnostic Substances)": "바이오의약품",
  "Biotechnology: In Vitro & In Vivo Diagnostic Substances": "진단시약",
  "Biotechnology: Commercial Physical & Biological Resarch": "바이오연구",
  "Biotechnology: Laboratory Analytical Instruments": "실험장비",
  "Biotechnology: Pharmaceutical Preparations": "제약",
  "Biotechnology: Electromedical & Electrotherapeutic Apparatus": "의료전자",
  "Major Pharmaceuticals": "제약",
  "Other Pharmaceuticals": "제약",
  "Medicinal Chemicals & Botanical Products": "의약원료",
  "Medical/Nursing Services": "의료서비스",
  "Medical Specialities": "의료기기",
  "Medical/Dental Instruments": "의료기기",
  "Hospital/Nursing Management": "병원운영",
  "Ophthalmic Goods": "안경·렌즈",

  // ── 반도체·전자 (★ 실측 + 스크리너 어휘) ──
  Semiconductors: "반도체",
  "Electronic Components": "전자부품",
  "Electrical Products": "전기제품",
  "Consumer Electronics/Appliances": "가전",
  "Computer Manufacturing": "컴퓨터",
  "Computer peripheral equipment": "컴퓨터주변기기",
  "Telecommunications Equipment": "통신장비",
  "Radio And Television Broadcasting And Communications Equipment": "방송장비",

  // ── 소프트웨어·인터넷 ──
  "Computer Software: Prepackaged Software": "소프트웨어",
  "Computer Software: Programming, Data Processing": "IT서비스",
  "EDP Services": "IT서비스",
  "Internet and Information Services": "인터넷",
  Advertising: "광고",

  // ── 소재·에너지 (★ 실측) ──
  "Steel/Iron Ore": "철강",
  "Metal Mining": "금속광업",
  "Precious Metals": "귀금속",
  Aluminum: "알루미늄",
  "Major Chemicals": "화학",
  "Specialty Chemicals": "특수화학",
  "Paints/Coatings": "도료",
  "Agricultural Chemicals": "농화학",
  "Containers/Packaging": "포장재",
  "Forest Products": "임산물",
  "Integrated oil Companies": "종합석유",
  "Oil Refining/Marketing": "정유",
  "Oil & Gas Production": "석유·가스",
  "Coal Mining": "석탄광업",
  "Oilfield Services/Equipment": "유전서비스",
  "Oil/Gas Transmission": "가스수송",

  // ── 산업재·운송 (★ 실측 + 스크리너 어휘) ──
  "Construction/Ag Equipment/Trucks": "건설·농기계",
  "Industrial Machinery/Components": "산업기계",
  "Metal Fabrications": "금속가공",
  "Auto Manufacturing": "자동차",
  "Auto Parts:O.E.M.": "자동차부품",
  Homebuilding: "주택건설",
  "Building Products": "건축부품",
  "Engineering & Construction": "건설",
  Aerospace: "항공우주",
  "Military Government/Technical": "방산",
  "Marine Transportation": "해운",
  "Air Freight/Delivery Services": "물류",
  "Trucking Freight/Courier Services": "육상운송",
  Railroads: "철도",
  "Major Airlines": "항공",

  // ── 유틸리티 (★ 실측) ──
  "Electric Utilities: Central": "전력",
  "Power Generation": "발전",
  "Natural Gas Distribution": "가스공급",
  "Water Supply": "수도",

  // ── 소비 ──
  "Packaged Foods": "식품",
  "Food Chains": "식품유통",
  "Beverages (Production/Distribution)": "음료",
  "Farming/Seeds/Milling": "농업",
  Tobacco: "담배",
  Restaurants: "외식",
  "Hotels/Resorts": "호텔·리조트",
  "Clothing/Shoe/Accessory Stores": "의류유통",
  Apparel: "의류",
  "Shoe Manufacturing": "신발",
  Textiles: "섬유",
  "Department/Specialty Retail Stores": "유통",
  "Other Specialty Stores": "전문소매",
  "Home Furnishings": "가구",
  "Recreational Products/Toys": "레저용품",
  "Consumer Specialties": "생활용품",
  "Other Consumer Services": "소비자서비스",
  "Services-Misc. Amusement & Recreation": "레저",
  "Movies/Entertainment": "영화·엔터",
  Broadcasting: "방송",
  Publishing: "출판",
  "Wireless Telecommunications": "무선통신",

  // ── 기타 ──
  "Business Services": "기업서비스",
  "Professional Services": "전문서비스",
  "Real Estate": "부동산",
  "Miscellaneous manufacturing industries": "기타제조",
};

/** 한글이 한 자라도 있으면 국내 분류로 본다 — 표를 갈라 타야 한다. */
const HAS_HANGUL = /[가-힣]/;

/**
 * 화면에 쓸 업종 이름. **영어를 그대로 내보내지 않는다**(FIX-01 완료 확인 5).
 *
 * - 국내 분류(한글) → 위 `sectorDisplayName` 표. 없으면 원문(이미 한글이라 읽힌다)
 * - 미국 분류(영문) → `US_INDUSTRY_DISPLAY_NAMES`. **없으면 `null`**
 *
 * `null` 을 받은 호출부는 이름 없이 `같은 업종` 으로 쓴다 — 모르는 이름을 지어내지도,
 * 영어를 노출하지도 않는다.
 */
export function industryDisplayLabel(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (HAS_HANGUL.test(value)) return sectorDisplayName(value);
  const hit = US_INDUSTRY_DISPLAY_NAMES[value];
  if (hit) return hit;
  // 표기 흔들림(공백·대소문자)까지는 받아 준다. 그 이상은 추측이다.
  const loose = Object.entries(US_INDUSTRY_DISPLAY_NAMES).find(
    ([key]) => key.replace(/\s+/g, " ").toLowerCase() === value.replace(/\s+/g, " ").toLowerCase()
  );
  return loose?.[1] ?? null;
}

/**
 * 표에 없어 이름을 못 쓴 영문 업종 — **다음 배치의 표 확장 대상**(FIX-01 보고할 것 1번).
 *
 * `overlongSectorNames` 와 같은 취지다: 화면에서 조용히 사라지는 것보다 목록으로 드러나는
 * 편이 낫다.
 */
export function untranslatedIndustryNames(industries: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of industries) {
    const value = (raw ?? "").trim();
    if (!value || HAS_HANGUL.test(value)) continue;
    if (industryDisplayLabel(value) === null) out.add(value);
  }
  return [...out].sort();
}
