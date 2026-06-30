export const FORBIDDEN_COPY = new RegExp(
  [
    "목표" + "가",
    "급등\\s*임박",
    "텐" + "베거",
    "매" + "수",
    "매" + "도",
    "추" + "천",
    "사" + "야",
    "팔" + "아야",
    "오를\\s*것",
    "상승" + "할",
    "기대",
    "전망",
    "수혜",
    "유망",
    "때문에",
    "덕분에",
    "수혜\\s*확정",
    "찬스",
  ].join("|"),
  "i"
);

export const SOURCE_NAME_PATTERN =
  /Yahoo Finance|한경비즈니스|한국경제|네이버|Reuters|Bloomberg|뉴시스|연합뉴스|매일경제|서울경제|뉴스1|DART|SEC/i;

export const ABSTRACT_TEMPLATE_BLOCKLIST = [
  /(?:직접|수급도|거래도|동종)\s*(?:종목\s*비교도|흐름도)?\s*(?:재료(?:가|를)?)?\s*붙었/,
  /(?:계약|수주|실적|공시|뉴스|소식|재료|파트너십|제품)\s*(?:재료)?\s*(?:가|이)?\s*(?:새로\s*)?(?:확인됐|나왔|반응|붙었)/,
  /(?:새\s*움직임이|먼저\s*반응이)\s*붙었|소식에\s*반응|다시\s*확인됐|아직\s*공개된\s*계기/,
  /흐름\s*흐름|흐름\s*안에서|더\s*살펴볼|더\s*확인할|발견\s*풀/,
  /설명하긴\s*이른데/,
  /오늘\s*[+\-]?\d+(?:\.\d+)?%\s*(?:상승|하락)했습니다/,
];

export function cleanInline(text: string | undefined): string {
  return (text ?? "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?。]+$/g, "")
    .trim();
}

export function normalizeForCompare(text: string | undefined): string {
  return cleanInline(text)
    .replace(/[‘’'".,:;·…\s()[\]{}]/g, "")
    .toLowerCase();
}

export function numbersIn(text: string | undefined): string[] {
  return [...cleanInline(text).matchAll(/[+-]?\d+(?:\.\d+)?/g)]
    .map((match) => match[0]!.replace(/^\+/, ""))
    .filter(Boolean);
}

export function englishQuarterNumbers(text: string | undefined): string[] {
  const quarterMap: Record<string, string> = {
    first: "1",
    second: "2",
    third: "3",
    fourth: "4",
  };
  return [...cleanInline(text).matchAll(/\b(first|second|third|fourth)\s+quarter\b/gi)]
    .map((match) => quarterMap[match[1]!.toLowerCase()])
    .filter((value): value is string => Boolean(value));
}

export function englishMonthNumbers(text: string | undefined): string[] {
  const monthMap: Record<string, string> = {
    january: "1",
    jan: "1",
    february: "2",
    feb: "2",
    march: "3",
    mar: "3",
    april: "4",
    apr: "4",
    may: "5",
    june: "6",
    jun: "6",
    july: "7",
    jul: "7",
    august: "8",
    aug: "8",
    september: "9",
    sep: "9",
    sept: "9",
    october: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12",
  };
  return [...cleanInline(text).matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi)]
    .map((match) => monthMap[match[1]!.toLowerCase()])
    .filter((value): value is string => Boolean(value));
}

export function numberVariants(value: string): string[] {
  const n = Number(value.replace(/^\+/, ""));
  if (!Number.isFinite(n)) return [value];
  return [
    value,
    n.toFixed(0),
    n.toFixed(1),
    n.toFixed(2),
    Math.abs(n).toFixed(0),
    Math.abs(n).toFixed(1),
    Math.abs(n).toFixed(2),
  ];
}

export function isAbstractTemplate(text: string | undefined): boolean {
  const clean = cleanInline(text);
  return !!clean && ABSTRACT_TEMPLATE_BLOCKLIST.some((pattern) => pattern.test(clean));
}

export function neutralizeSupplyFactTerms(text: string | undefined): string {
  return cleanInline(text).replace(/순매수|순매도/g, "수급");
}

function koreanTokens(text: string): string[] {
  return [...text.matchAll(/[가-힣A-Za-z0-9][가-힣A-Za-z0-9&().+-]{1,}/g)]
    .map((match) => match[0]!)
    .filter((token) => token.length >= 2);
}

const CONCRETE_TOKEN_STOPLIST = new Set([
  "오늘",
  "종목",
  "뉴스",
  "소식",
  "재료",
  "공시",
  "계약",
  "수주",
  "실적",
  "제품",
  "발표",
  "확인",
  "관련주",
  "급등",
  "상승",
  "하락",
  "참여",
  "체결",
  "규모",
  "기반",
  "전략",
  "전환",
  "출시",
]);

export function isRawTitleCopy(hook: string | undefined, title: string | undefined): boolean {
  const hookNorm = normalizeForCompare(hook);
  const titleNorm = normalizeForCompare(title);
  if (!hookNorm || !titleNorm || hookNorm.length < 8 || titleNorm.length < 8) return false;
  if (hookNorm === titleNorm) return true;
  const shorter = hookNorm.length <= titleNorm.length ? hookNorm : titleNorm;
  const longer = hookNorm.length <= titleNorm.length ? titleNorm : hookNorm;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.8) return true;

  const hookTokens = new Set(koreanTokens(cleanInline(hook)));
  const titleTokens = new Set(koreanTokens(cleanInline(title)));
  if (hookTokens.size < 4 || titleTokens.size < 4) return false;
  if (hookNorm.length / titleNorm.length < 0.8) return false;
  const shared = [...hookTokens].filter((token) => titleTokens.has(token)).length;
  return shared / hookTokens.size >= 0.8;
}

function concreteCandidates(title: string): string[] {
  const clean = cleanInline(title);
  const quoted = [...clean.matchAll(/[\"'“”‘’]([^\"'“”‘’]{2,40})[\"'“”‘’]/g)].map((match) => match[1]!);
  const amounts = [...clean.matchAll(/\d+(?:\.\d+)?\s*(?:억|조|만|달러|원|억원|조원|%|배|개|일|분기|Q|K)/gi)].map(
    (match) => match[0]!
  );
  const latin = [...clean.matchAll(/[A-Z][A-Za-z0-9&.-]{1,}/g)].map((match) => match[0]!);
  const korean = koreanTokens(clean).filter((token) => {
    if (CONCRETE_TOKEN_STOPLIST.has(token)) return false;
    if (/^(?:오늘|최근|이번|관련|직접|새로|규모|기반|발표|확인)/.test(token)) return false;
    return true;
  });
  const nounBeforeEvent = [
    ...clean.matchAll(
      /([가-힣A-Za-z0-9&().+-]{2,24})\s*(?:공급계약|계약|수주|발표|체결|확보|개발|출시|승인|허가|실적|가이던스|인수전|클러스터|투자|파트너십|제휴)/g
    ),
  ].map((match) => match[1]!);
  const englishQuarter = englishQuarterNumbers(clean).map((value) => `${value}분기`);
  const englishMonth = englishMonthNumbers(clean).map((value) => `${value}월`);
  return [...quoted, ...amounts, ...latin, ...korean, ...nounBeforeEvent, ...englishQuarter, ...englishMonth]
    .map(cleanInline)
    .filter((token) => token.length >= 2);
}

export function hasConcreteSourceValue(hook: string | undefined, sourceTitle: string | undefined): boolean {
  const cleanHook = cleanInline(hook);
  const cleanTitle = cleanInline(sourceTitle);
  if (!cleanHook || !cleanTitle) return false;
  const titleNumbers = new Set(numbersIn(cleanTitle).flatMap(numberVariants).map((num) => num.replace(/^\+/, "")));
  englishQuarterNumbers(cleanTitle).forEach((num) => {
    numberVariants(num).forEach((variant) => titleNumbers.add(variant.replace(/^\+/, "")));
  });
  englishMonthNumbers(cleanTitle).forEach((num) => {
    numberVariants(num).forEach((variant) => titleNumbers.add(variant.replace(/^\+/, "")));
  });
  if (numbersIn(cleanHook).some((num) => numberVariants(num).some((variant) => titleNumbers.has(variant.replace(/^\+/, ""))))) {
    return true;
  }
  const normalizedHook = cleanHook.toLowerCase();
  const normalizedTitle = cleanTitle.toLowerCase();
  const knownTranslations: Array<[string, string]> = [
    ["엔비디아", "nvidia"],
    ["테슬라", "tesla"],
    ["스텔란티스", "stellantis"],
    ["항공우주", "aerospace"],
    ["음성 커머스 플랫폼", "voice commerce platform"],
    ["미 육군", "army"],
    ["반도체 제조 시스템", "chipmaking systems"],
    ["반도체 제조 시스템", "chipmaking system"],
    ["미국 항공우주", "aerospace"],
    ["아이온큐", "ionq"],
    ["클라비스", "clavis"],
    ["로켓랩", "rocket lab"],
    ["이리듐", "iridium"],
    ["뉴스케일", "nuscale"],
    ["파라곤", "paragon"],
    ["업스타트", "upstart"],
    ["노이버거", "neuberger"],
    ["어펌", "affirm"],
    ["백컨트리", "backcountry"],
    ["스노우플레이크", "snowflake"],
    ["언리미테일", "unlimitail"],
    ["액손", "axon"],
    ["코어위브", "coreweave"],
    ["메타", "meta"],
    ["마이크로소프트", "microsoft"],
    ["오픈AI", "openai"],
    ["로빈후드", "robinhood"],
    ["마이크로스트래티지", "microstrategy"],
    ["도어대시", "doordash"],
    ["크라우드스트라이크", "crowdstrike"],
    ["팔콘", "falcon"],
    ["마벨", "marvell"],
    ["트레이니움", "trainium"],
    ["아이비엠", "ibm"],
    ["오라클", "oracle"],
    ["웨이모", "waymo"],
    ["지상 이미지", "ground level image"],
    ["AI 공급망 앱", "ai supply chain app"],
    ["리테일 미디어 데이터", "retail media data"],
    ["위성통신", "satellite communication"],
    ["IoT 사업", "iot business"],
    ["소비자대출", "consumer loan"],
    ["비트코인 매각", "bitcoin sale"],
    ["서브 1나노", "sub-1nm"],
  ];
  if (
    knownTranslations.some(
      ([ko, en]) => normalizedHook.includes(ko.toLowerCase()) && normalizedTitle.includes(en.toLowerCase())
    )
  ) {
    return true;
  }
  return concreteCandidates(cleanTitle).some((token) => cleanHook.includes(token));
}

export function hasExcessiveLatinHeadline(text: string | undefined): boolean {
  const clean = cleanInline(text);
  if (!clean) return false;
  const latinWords = clean.match(/[A-Za-z][A-Za-z0-9&'().-]*/g) ?? [];
  if (latinWords.length === 0) return false;
  const meaningfulLatin = latinWords.filter(
    (word) => !/^(?:AI|GPU|CPU|SEC|KRX|DART|KOSPI|KOSDAQ|NYSE|NASDAQ|ETF|IPO|ESS|FDA|8-K|10-Q|10-K)$/i.test(word)
  );
  const latinChars = meaningfulLatin.join("").length;
  const koChars = (clean.match(/[가-힣]/g) ?? []).length;
  const totalLetters = latinChars + koChars;
  if (latinChars >= 12 && koChars === 0) return true;
  if (meaningfulLatin.length >= 4 && koChars < 4) return true;
  if (meaningfulLatin.length <= 2 && koChars >= 3) return false;
  return totalLetters > 0 && latinChars / totalLetters >= 0.4 && koChars < 8;
}

const LATIN_ALLOWED_TOKEN = /^(?:AI|AIDR|GPU|CPU|SEC|KRX|DART|KOSPI|KOSDAQ|NYSE|NASDAQ|ETF|IPO|ESS|FDA|8-K|10-Q|10-K|SK)$/i;
const ENGLISH_FRAGMENT_TOKEN =
  /^(?:its|the|with|and|for|from|by|of|to|in|on|as|a|an|can|why|these|stocks?|stock|posted|double|digit|after|hours?|today|eyes?|june|delivery|deliveries|moved|more|market|inc|corp|co|company|holdings?|group|plc|llc)$/i;
const LATIN_WITH_KOREAN_PARTICLE_PATTERN =
  /\b([A-Za-z][A-Za-z0-9&'().-]*)\s*(?:와|과|의|가|이|은|는|을|를|에|에서|로|으로|도|만)/g;

export function hasEnglishFragmentHeadline(text: string | undefined): boolean {
  const clean = cleanInline(text);
  if (!clean) return false;
  const latinWords = clean.match(/[A-Za-z][A-Za-z0-9&'().-]*/g) ?? [];
  if (latinWords.length === 0) return false;
  const koChars = (clean.match(/[가-힣]/g) ?? []).length;
  const meaningful = latinWords.filter((word) => !LATIN_ALLOWED_TOKEN.test(word));
  for (const match of clean.matchAll(LATIN_WITH_KOREAN_PARTICLE_PATTERN)) {
    const token = match[1];
    if (token && !LATIN_ALLOWED_TOKEN.test(token)) return true;
  }
  if (meaningful.some((word) => ENGLISH_FRAGMENT_TOKEN.test(word))) return true;
  if (koChars === 0 && meaningful.length > 0) return true;
  if (meaningful.length >= 2) return true;
  const latinChars = meaningful.join("").length;
  const totalLetters = latinChars + koChars;
  return totalLetters > 0 && latinChars / totalLetters >= 0.35 && koChars < 10;
}

export function hasForbiddenCopy(text: string | undefined): boolean {
  const clean = cleanInline(text);
  return (
    FORBIDDEN_COPY.test(neutralizeSupplyFactTerms(clean)) ||
    SOURCE_NAME_PATTERN.test(clean) ||
    isAbstractTemplate(clean) ||
    hasEnglishFragmentHeadline(clean)
  );
}
