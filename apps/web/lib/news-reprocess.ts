import { callAI, isAiConfigured } from "@fomo/shared";

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
const FORBIDDEN_COPY = new RegExp(
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
  ].join("|"),
  "i"
);
const SOURCE_NAME_PATTERN = /Yahoo Finance|한경비즈니스|한국경제|네이버|Reuters|Bloomberg|뉴시스|연합뉴스|매일경제|서울경제/i;
const GENERIC_TITLE_PATTERN = /^(?:(?:제품·AI 인프라|실적·가이던스|고객·파트너십|인도량 확인|자금조달·유동화)\s*소식|SEC 공시|소식|뉴스)(?:이|가)?\s*나왔어요\.?$/i;

function cleanInline(text: string | undefined): string {
  return (text ?? "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?。]+$/g, "")
    .trim();
}

function normalizeForCompare(text: string): string {
  return cleanInline(text).replace(/[‘’'".,:·…\s]/g, "").toLowerCase();
}

function cacheKey(input: NewsHookInput): string {
  return [input.asOf.slice(0, 10), input.stock, input.sector ?? "", input.title, input.source ?? ""].join("\u001f");
}

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]!).filter(Boolean);
}

export function validateReprocessedNewsHook(hook: string | undefined, input: NewsHookInput): string | undefined {
  const clean = cleanInline(hook);
  if (!clean || clean.length > 36) return undefined;
  if (FORBIDDEN_COPY.test(clean) || SOURCE_NAME_PATTERN.test(clean)) return undefined;
  if (clean.includes("—") || clean.includes("·")) return undefined;
  const titleNorm = normalizeForCompare(input.title);
  const hookNorm = normalizeForCompare(clean);
  if (!hookNorm || titleNorm.includes(hookNorm) || hookNorm.includes(titleNorm)) return undefined;
  const titleNumbers = new Set(numbersIn(input.title));
  if (numbersIn(clean).some((n) => !titleNumbers.has(n))) return undefined;
  return clean;
}

function stripStockName(text: string, stock: string): string {
  const escaped = stock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), "").replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

export function ruleReprocessNewsHook(input: NewsHookInput): string | undefined {
  const title = cleanInline(stripStockName(input.title, input.stock));
  const lower = title.toLowerCase();
  if (!title || GENERIC_TITLE_PATTERN.test(title)) return undefined;

  let hook: string | undefined;
  if (/정부|국책|투자|클러스터|산단|호남/.test(title) && /관련주|부각|묶/.test(title)) {
    hook = /호남/.test(title) ? "정부 호남 투자 예고에 관련주로 묶임" : "정부 투자 예고에 관련주로 묶임";
  } else if (/제품·AI 인프라|신제품|제품|AI 인프라|data center|solution|launch|unveil|introduce|product/.test(lower)) {
    hook = `${input.sector === "AI" || /음성|SoundHound|사운드하운드/i.test(input.stock) ? "음성 AI " : ""}신제품 소식에 반응`;
  } else if (/실적|가이던스|매출|revenue|earnings|results|guidance|forecast/.test(lower)) {
    hook = "실적·가이던스가 다시 확인됐어요";
  } else if (/공급계약|계약|수주|contract|deal|order|supply/.test(lower)) {
    hook = /수주/.test(title) ? "수주 재료가 새로 확인됐어요" : "계약 재료가 새로 확인됐어요";
  } else if (/파트너십|제휴|협력|고객|partnership|customer/.test(lower)) {
    hook = "고객·파트너십 소식에 반응";
  } else if (/SEC|8-K|10-Q|filing|공시/i.test(title)) {
    hook = "공시 원문이 새로 확인됐어요";
  } else if (/FDA|임상|허가|승인|trial|approval|drug/i.test(title)) {
    hook = "신약·허가 재료가 확인됐어요";
  } else if (/자금조달|유동화|funding|liquidity/i.test(title)) {
    hook = "자금조달 이슈가 확인됐어요";
  }

  return validateReprocessedNewsHook(hook, input);
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
    `${banned.join(", ")} 금지.`,
    "결과는 한국어 36자 이하 JSON {\"hook\":\"...\"}.",
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
