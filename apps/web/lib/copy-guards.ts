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
  return [...quoted, ...amounts, ...latin, ...korean, ...nounBeforeEvent].map(cleanInline).filter((token) => token.length >= 2);
}

export function hasConcreteSourceValue(hook: string | undefined, sourceTitle: string | undefined): boolean {
  const cleanHook = cleanInline(hook);
  const cleanTitle = cleanInline(sourceTitle);
  if (!cleanHook || !cleanTitle) return false;
  const titleNumbers = new Set(numbersIn(cleanTitle).flatMap(numberVariants).map((num) => num.replace(/^\+/, "")));
  if (numbersIn(cleanHook).some((num) => numberVariants(num).some((variant) => titleNumbers.has(variant.replace(/^\+/, ""))))) {
    return true;
  }
  return concreteCandidates(cleanTitle).some((token) => cleanHook.includes(token));
}

export function hasForbiddenCopy(text: string | undefined): boolean {
  const clean = cleanInline(text);
  return FORBIDDEN_COPY.test(clean) || SOURCE_NAME_PATTERN.test(clean) || isAbstractTemplate(clean);
}
