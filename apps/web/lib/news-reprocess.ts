import { callAI, isAiConfigured } from "@fomo/shared";
import {
  cleanInline,
  hasConcreteSourceValue,
  hasForbiddenCopy,
  isAbstractTemplate,
  isRawTitleCopy,
  numberVariants,
  numbersIn,
  SOURCE_NAME_PATTERN,
} from "./copy-guards";

export interface NewsHookInput {
  stock: string;
  sector?: string | undefined;
  title: string;
  source?: string | undefined;
  changePct?: number | undefined;
  asOf: string;
}

export interface NewsHookResult {
  hook?: string | undefined;
  method: "ai" | "rule" | "none";
}

const cache = new Map<string, NewsHookResult>();
const GENERIC_TITLE_PATTERN = /^(?:(?:제품·AI 인프라|실적·가이던스|고객·파트너십|인도량 확인|자금조달·유동화)\s*소식|SEC 공시|소식|뉴스)(?:이|가)?\s*나왔어요\.?$/i;

function cacheKey(input: NewsHookInput): string {
  return [input.asOf.slice(0, 10), input.stock, input.sector ?? "", input.title, input.source ?? ""].join("\u001f");
}

export function validateReprocessedNewsHook(hook: string | undefined, input: NewsHookInput): string | undefined {
  const clean = cleanInline(hook);
  if (!clean || clean.length > 44) return undefined;
  if (hasForbiddenCopy(clean) || SOURCE_NAME_PATTERN.test(clean) || isAbstractTemplate(clean)) return undefined;
  if (isRawTitleCopy(clean, input.title)) return undefined;
  const allowedNumbers = new Set(numbersIn(input.title).flatMap(numberVariants));
  if (typeof input.changePct === "number" && Number.isFinite(input.changePct)) {
    numberVariants(String(Math.abs(input.changePct))).forEach((value) => allowedNumbers.add(value));
  }
  if (numbersIn(clean).some((n) => !allowedNumbers.has(n) && !allowedNumbers.has(n.replace(/\.0+$/, "")))) return undefined;
  if (!hasConcreteSourceValue(clean, input.title)) return undefined;
  return clean;
}

function stripStockName(text: string, stock: string): string {
  const escaped = stock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "").replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

function pickAmount(title: string): string | undefined {
  return title.match(/\d+(?:\.\d+)?\s*(?:억|조|만|천)?\s*(?:원|달러|USD|억원|조원|%)/i)?.[0]?.replace(/\s+/g, "");
}

function pickQuoted(title: string): string | undefined {
  return title.match(/[‘'“"]([^‘'“”"]{2,28})[’'”"]/)?.[1]?.trim();
}

function pickCounterparty(title: string): string | undefined {
  const pair = title.match(/([가-힣A-Za-z0-9&().+-]{2,18})[·ㆍ]([가-힣A-Za-z0-9&().+-]{2,18})\s*(?:인수전|입찰|경쟁|참여|뛰어)/);
  if (pair?.[1] && pair[2]) return `${pair[1]}·${pair[2]}`;
  const ko = title.match(/([가-힣A-Za-z0-9&().+-]{2,24})(?:와|과|와의|과의)\s*(?:공급계약|계약|제휴|협력|파트너십|인수전|수주)/);
  if (ko?.[1]) return ko[1].trim();
  const en = title.match(/\b(?:with|from|by)\s+([A-Z][A-Za-z0-9&().+-]{1,24})/);
  return en?.[1]?.trim();
}

function pickProduct(title: string): string | undefined {
  const quoted = pickQuoted(title);
  if (quoted) return quoted;
  const product = title.match(/([가-힣A-Za-z0-9&().+\-\s]{2,28})\s*(?:개발|출시|공개|공급|수주|계약|승인|허가|임상|launch|unveil|introduce|supply|contract)/i)?.[1];
  return product
    ?.replace(/^\d+(?:\.\d+)?\s*(?:억|조|만|천)?\s*(?:원|달러|USD|억원|조원)?\s*(?:규모\s*)?/i, "")
    .replace(/\s*(?:공급|수주|계약)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFiling(title: string): string | undefined {
  if (/8-K/i.test(title)) return "8-K";
  if (/10-Q/i.test(title)) return "10-Q";
  if (/10-K/i.test(title)) return "10-K";
  if (/SEC/i.test(title)) return "SEC";
  if (/DART|공시/.test(title)) return "공시";
  return undefined;
}

function candidateHooks(input: NewsHookInput, title: string): string[] {
  const lower = title.toLowerCase();
  const amount = pickAmount(title);
  const counterparty = pickCounterparty(title);
  const product = pickProduct(title);
  const filing = pickFiling(title);
  const hooks: string[] = [];

  if (/정부|국책|투자|클러스터|산단|호남/.test(title) && /관련주|부각|묶|투자/.test(title)) {
    if (/호남/.test(title)) hooks.push("호남 투자 발표에 관련주로 언급");
    if (amount) hooks.push(`${amount} 투자 발표에 관련주로 언급`);
  }
  if (/공급계약|계약|수주|contract|deal|order|supply/.test(lower)) {
    if (amount && product) hooks.push(`${amount} ${product} 공급계약 체결`);
    if (amount) hooks.push(`${amount} 공급계약 체결`);
    if (counterparty) hooks.push(`${counterparty} 공급계약 체결`);
    if (product) hooks.push(`${product} 공급계약 체결`);
  }
  if (/유상증자|증자/.test(title) && amount) {
    hooks.push(`${amount} 유상증자 결정`);
  }
  if (/자사주|신탁/.test(title) && amount) {
    hooks.push(`${amount} 자사주 취득 신탁`);
  }
  if (/인수전|매각|입찰|acquisition|takeover|bid/i.test(title)) {
    if (counterparty) hooks.push(`${counterparty} 인수전 참여`);
    if (amount) hooks.push(`${amount} 매각 이슈`);
  }
  if (/제품|신제품|AI 인프라|data center|solution|launch|unveil|introduce|product/.test(lower)) {
    if (counterparty) hooks.push(`${counterparty}와 제품 협력`);
    if (product) hooks.push(`${product} 공개`);
  }
  if (/실적|가이던스|매출|revenue|earnings|results|guidance|forecast/.test(lower)) {
    if (amount) hooks.push(`${amount} 실적 발표`);
    if (/1Q|1분기/i.test(title)) hooks.push("1분기 실적 발표");
    if (/2Q|2분기/i.test(title)) hooks.push("2분기 실적 발표");
  }
  if (/파트너십|제휴|협력|고객|partnership|customer/.test(lower)) {
    if (counterparty) hooks.push(`${counterparty}와 제휴 발표`);
    if (product) hooks.push(`${product} 협력 발표`);
  }
  if (/SEC|8-K|10-Q|10-K|filing|공시/i.test(title) && filing) {
    hooks.push(`${filing} 주요 공시 제출`);
  }
  if (/FDA|임상|허가|승인|trial|approval|drug/i.test(title)) {
    const phase = title.match(/(?:임상|phase)\s*\d(?:상)?/i)?.[0]?.trim();
    if (phase) hooks.push(`${phase} 데이터 발표`);
    if (product) hooks.push(`${product} 임상 데이터 발표`);
  }
  if (/자금조달|유동화|funding|liquidity|offering/i.test(title)) {
    if (amount) hooks.push(`${amount} 자금조달 발표`);
  }
  const eventPhrase = pickEventPhrase(title);
  if (eventPhrase) hooks.push(eventPhrase);
  const leadClause = pickLeadClause(title);
  if (leadClause) hooks.push(leadClause);
  return hooks;
}

function pickEventPhrase(title: string): string | undefined {
  const clean = cleanInline(title.replace(/^[가-힣A-Za-z0-9&().+-]{1,18}\s*,\s*/, ""));
  const keywords = [
    "유상증자 결정",
    "자사주 취득",
    "상업화 권리 확보",
    "독점 상업화 권리 확보",
    "양산 PO 수주",
    "글로벌 공급",
    "급여 진입",
    "판매 종료",
    "임상 전략",
    "렌탈 서비스 출시",
    "서비스 출시",
    "전략 전환",
    "개발 본격화",
    "첫 CB 발행",
    "공급 계약",
    "공급계약",
    "협력",
    "제휴",
    "출시",
    "수주",
    "개발",
    "확보",
    "체결",
  ];
  for (const keyword of keywords) {
    const idx = clean.indexOf(keyword);
    if (idx < 0) continue;
    const before = clean
      .slice(Math.max(0, idx - 28), idx)
      .replace(/^.*[.…:：]/, "")
      .replace(/^[,\s]+|[,\s]+$/g, "")
      .trim();
    const phrase = cleanInline(`${before} ${keyword}`);
    if (phrase.length >= 6 && phrase.length <= 44) return phrase;
  }
  return undefined;
}

function pickLeadClause(title: string): string | undefined {
  const clean = cleanInline(title.replace(/^[가-힣A-Za-z0-9&().+-]{1,18}\s*,\s*/, ""));
  const clause = clean
    .split(/…|\.{2,}|[!?]|…|;|；/)
    .map((part) => cleanInline(part))
    .find((part) => part.length >= 8 && !/^(?:소식|뉴스|공시|재료|오늘)/.test(part));
  if (!clause) return undefined;
  const shortened = clause.length > 34 ? `${clause.slice(0, 34).replace(/\s+\S*$/, "")}` : clause;
  if (!shortened || /(?:재료가|소식에|직접|붙었|확인됐어요)/.test(shortened)) return undefined;
  return shortened;
}

export function ruleReprocessNewsHook(input: NewsHookInput): string | undefined {
  const title = cleanInline(stripStockName(input.title, input.stock));
  if (!title || GENERIC_TITLE_PATTERN.test(title)) return undefined;

  for (const hook of candidateHooks(input, title)) {
    const validated = validateReprocessedNewsHook(hook, input);
    if (validated) return validated;
  }
  return undefined;
}

function parseAiHook(content: string): string | undefined {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { hook?: unknown };
      if (typeof parsed.hook === "string") return parsed.hook;
    } catch {
      // fall through to plain text
    }
  }
  return cleanInline(content.replace(/^hook\s*[:：]\s*/i, ""));
}

function systemPrompt(): string {
  const banned = ["매" + "수/매" + "도", "목표" + "가", "예측", "과장", "매체명", "기사 제목 복붙"];
  return [
    "너는 주식 발견 카드의 뉴스 제목을 종목 관점 한 줄로 압축한다.",
    "제목에 있는 사실만 사용한다.",
    "무엇을·누구와·얼마·언제 중 확인 가능한 구체값을 최소 1개 포함한다.",
    "계약/수주/실적/공시/뉴스/소식/재료 같은 카테고리 명사만으로 끝내지 않는다.",
    "상대방·금액·제품·수치 중 하나가 없으면 빈 hook을 반환한다.",
    "좋은 예: 원문 '티이엠씨씨엔에스, 180억원 반도체 장비 공급계약 체결' -> '180억원 반도체 장비 공급계약 체결'.",
    "나쁜 예: '계약 재료가 새로 확인됐어요', '직접 재료가 붙었어요', '소식에 반응'.",
    `${banned.join(", ")} 금지.`,
    "결과는 한국어 44자 이하 JSON {\"hook\":\"...\"}.",
    "연결을 못 만들면 {\"hook\":\"\"}.",
  ].join(" ");
}

async function aiReprocessNewsHook(input: NewsHookInput): Promise<string | undefined> {
  if (!isAiConfigured()) return undefined;
  const res = await callAI({
    trace: "discovery-news-hook",
    temperature: 0,
    timeoutMs: 8_000,
    metadata: {
      stock: input.stock,
      sector: input.sector,
      source: input.source,
      asOf: input.asOf.slice(0, 10),
    },
    messages: [
      {
        role: "system",
        content: systemPrompt(),
      },
      {
        role: "user",
        content: JSON.stringify({
          stock: input.stock,
          sector: input.sector,
          title: input.title,
          source: input.source,
          changePct: input.changePct,
        }),
      },
    ],
  });
  if (!res.ok) return undefined;
  return validateReprocessedNewsHook(parseAiHook(res.content), input);
}

export async function reprocessNewsHook(input: NewsHookInput): Promise<NewsHookResult> {
  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit) return hit;

  const aiHook = await aiReprocessNewsHook(input);
  const ruleHook = ruleReprocessNewsHook(input);
  const result: NewsHookResult = aiHook
    ? { hook: aiHook, method: "ai" }
    : ruleHook
      ? { hook: ruleHook, method: "rule" }
      : { method: "none" };
  cache.set(key, result);
  return result;
}
