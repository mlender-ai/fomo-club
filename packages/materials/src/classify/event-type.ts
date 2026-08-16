import type { EventType } from "../types";

/**
 * §4 재료 유형 분류 — **규칙 기반**. 공시 제목·보고서명 패턴 매칭이 1차다.
 *
 * 순수 함수다. LLM 을 쓰지 않는다 — 공시 보고서명은 정형이라 패턴으로 충분하고,
 * 결정론이어야 판단 원장 채점이 재현된다.
 *
 * §4-1 규칙:
 *  - 분류 실패는 `OTHER`. **억지로 넣지 않는다.**
 *  - 한 공시가 복수 유형이면 **복수 태그를 허용**한다.
 */

interface Rule {
  type: EventType;
  /** 하나라도 맞으면 해당 유형. */
  patterns: RegExp[];
}

/**
 * 순서는 **구체적인 것이 먼저**다. 복수 태그를 허용하므로 첫 매치에서 끊지 않고 전부 모은다.
 * 다만 아래 `CAPITAL_RAISE` 처럼 `자기주식`(BUYBACK)과 어휘가 겹치는 것들은 패턴을 좁혔다.
 */
const RULES: readonly Rule[] = [
  {
    type: "EARNINGS_RESULT",
    patterns: [
      /매출액또는손익구조/,
      /영업[\s(]*잠정[\s)]*실적/,
      /결산실적/,
      /분기보고서|반기보고서|사업보고서/,
      /\bearnings\s+(result|release)\b/i,
      /\bform\s*10-[QK]\b/i,
    ],
  },
  {
    type: "GUIDANCE",
    patterns: [/전망\s*(공시|제시|수정)/, /실적\s*전망/, /가이던스/, /\bguidance\b/i, /\boutlook\b/i],
  },
  {
    type: "CONTRACT",
    patterns: [/단일판매|공급계약/, /수주/, /계약\s*체결/, /\bsupply\s+agreement\b/i, /\bcontract\s+award/i],
  },
  {
    type: "CAPACITY",
    patterns: [/신규\s*시설투자/, /증설/, /설비\s*투자/, /공장\s*신설/, /\bcapacity\s+expansion\b/i],
  },
  {
    type: "MNA",
    patterns: [/합병/, /영업양수|영업양도/, /주식\s*취득/, /타법인\s*주식/, /\bmerger\b|\bacquisition\b/i],
  },
  {
    type: "CAPITAL_RAISE",
    patterns: [
      /유상증자/,
      /전환사채|신주인수권부사채/,
      /\bCB\b\s*발행|\bBW\b\s*발행/,
      /\bconvertible\s+note|\bsecondary\s+offering\b/i,
    ],
  },
  {
    type: "BUYBACK_DIVIDEND",
    patterns: [/자기주식\s*취득/, /자사주\s*(취득|소각)/, /현금[·\s]*현물배당/, /배당\s*결정/, /\bbuyback\b|\bdividend\b/i],
  },
  {
    type: "INSIDER_TRADE",
    patterns: [
      /임원[·ㆍ]?\s*주요주주\s*특정증권/,
      /주식등의\s*대량보유/,
      /최대주주\s*지분\s*변동/,
      /\bform\s*[34]\b/i,
    ],
  },
  {
    type: "GOVERNANCE",
    patterns: [/최대주주\s*변경/, /지배구조/, /대표이사\s*변경/, /상호\s*변경/, /\bchange\s+in\s+control\b/i],
  },
  {
    type: "REGULATORY",
    patterns: [/인허가|승인\s*획득/, /제재|과징금|행정처분/, /소송\s*(등의\s*)?제기|피소/, /\bFDA\b|\blitigation\b/i],
  },
];

/**
 * 공시 제목에서 재료 유형을 분류한다.
 *
 * @returns 맞는 유형 전부(복수 태그 허용). 하나도 안 맞으면 `["OTHER"]`.
 *          빈 제목은 `["OTHER"]` — 추측하지 않는다.
 */
export function classifyEventTypes(title: string): EventType[] {
  const text = title?.trim() ?? "";
  if (text.length === 0) return ["OTHER"];
  const matched = RULES.filter((rule) => rule.patterns.some((p) => p.test(text))).map((r) => r.type);
  return matched.length > 0 ? matched : ["OTHER"];
}

/** 단일 유형이 필요한 자리용 — 가장 구체적인(먼저 선언된) 매치를 쓴다. */
export function classifyEventType(title: string): EventType {
  return classifyEventTypes(title)[0] ?? "OTHER";
}
