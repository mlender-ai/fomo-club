/**
 * 종목 고유 리스크 — 순수 조립·검증 (WO-SUB-06 §5-2 · 커밋 4).
 *
 * ## 이 파일이 지키는 것
 *
 * §4 규칙 1 "소스 없는 리스크를 쓰지 않는다" 를 **구조로** 지킨다. `source_ids` 가 비어 있으면
 * 렌더 대상이 되지 않는다(완료 조건 2). 가드로 걸러내는 것이 아니라 그런 항목을 만들지 않는다 —
 * WO-SUB-01/03 의 `projectForRender()` 가 출처 없는 값을 통과시키지 않는 것과 같은 방식이다.
 *
 * ## "없음" 과 "확보하지 못함" 을 나눈다
 *
 * §11 이 가장 강하게 못 박은 것이다. 두 상태는 화면 문구가 다르고, 합치면 리스크가 없는 회사처럼
 * 보여 §10 실패 모드("없다고 표시해서 안전해 보이게 만듦")가 된다. 그래서 결과 타입이
 * `items` 와 `unavailable_reason` 을 함께 갖고, 둘 다 비거나 둘 다 차는 상태를 테스트가 막는다.
 */

import { CAUSAL_PATTERNS } from "../business-context/guards";
import type { BusinessSourceKind } from "../business-context/types";
import { bannedWordHits } from "../invariants/banned-words";
import { boilerplateHits, type BoilerplateHit } from "./boilerplate";

/** 문안 상한 — §5-2 "1문장, 최대 60자". */
export const SYMBOL_RISK_MAX_CHARS = 60;
/** 한 종목에 표시할 최대 개수 — 유형 리스크와 합쳐 §6 UI 예산 안에 들어가야 한다. */
export const SYMBOL_RISK_MAX_ITEMS = 3;

export type SymbolRiskSourceKind = "filing" | "market_data";

export interface SymbolRisk {
  id: string;
  /** 1문장, 최대 60자, 해요체. */
  text: string;
  /** 비어 있으면 이 항목은 만들어지지 않는다(완료 조건 2). */
  source_ids: string[];
  source_kind: SymbolRiskSourceKind;
  as_of: string;
}

/** LLM 이 뱉은 후보 1건. 아직 검증 전이다. */
export interface SymbolRiskCandidate {
  text: string;
  source_ids: readonly string[];
  source_kind: SymbolRiskSourceKind;
  as_of: string;
}

export type SymbolRiskRejection =
  | { reason: "no_source" }
  | { reason: "too_long"; chars: number }
  | { reason: "multi_sentence" }
  | { reason: "banned_words"; detail: string }
  | { reason: "causal_assertion"; detail: string }
  | { reason: "boilerplate"; hits: BoilerplateHit[] }
  | { reason: "duplicate" }
  | { reason: "over_cap" };

export interface SymbolRiskBlock {
  items: SymbolRisk[];
  /**
   * 항목이 0개인 **이유**. `items` 가 비었으면 반드시 채워진다 —
   * "리스크 없음" 과 "확보하지 못함" 을 구분하기 위한 필드다(§11).
   */
  unavailable_reason: string | null;
  /** 버려진 후보 + 사유. 조용한 절단 금지 — 커버리지 저하의 원인을 사후에 알 수 있어야 한다. */
  rejected: Array<{ candidate: SymbolRiskCandidate; rejection: SymbolRiskRejection }>;
}

const CAUSAL_ASSERTION = CAUSAL_PATTERNS;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 안정 식별자 — 같은 문안이면 같은 id(재합성 시 원장 추적이 끊기지 않는다). */
function riskId(text: string, index: number): string {
  const slug = normalize(text)
    .replace(/[^0-9A-Za-z가-힣]+/g, "")
    .slice(0, 12);
  return `sym-${index + 1}-${slug || "risk"}`;
}

function rejectionOf(candidate: SymbolRiskCandidate, seen: ReadonlySet<string>): SymbolRiskRejection | null {
  const text = normalize(candidate.text);
  if (candidate.source_ids.length === 0) return { reason: "no_source" };
  if (!text) return { reason: "no_source" };
  if (text.length > SYMBOL_RISK_MAX_CHARS) return { reason: "too_long", chars: text.length };
  if (text.split(/[.。]/).filter((part) => part.trim().length > 0).length > 1) return { reason: "multi_sentence" };
  const banned = bannedWordHits(text);
  if (banned.length > 0) return { reason: "banned_words", detail: banned.map((hit) => `${hit.rule}="${hit.matched}"`).join(",") };
  // 인과 단정은 검증 패스가 **구조적으로 통과시킨다**(두 사실이 각각 청크에 있으면 지지된다고
  // 판정한다). 실측으로 확인된 구멍이라 정규식 가드가 따로 막아야 한다(WO-SUB-03 교훈).
  for (const pattern of CAUSAL_ASSERTION) {
    const match = text.match(pattern);
    if (match) return { reason: "causal_assertion", detail: match[0] };
  }
  const boilerplate = boilerplateHits(text);
  if (boilerplate.length > 0) return { reason: "boilerplate", hits: boilerplate };
  if (seen.has(text)) return { reason: "duplicate" };
  return null;
}

/**
 * 인용된 청크의 종류 → 리스크 항목에 찍을 소스 종류 (WO-SUB-CLOSE PART C-1).
 *
 * ## 왜 번들이 아니라 인용 청크에서 도출하는가
 *
 * 종전에는 합성 호출 한 건에 종류를 **하나** 선언하고 그 값을 모든 항목에 찍었다. 오늘은
 * 번들이 US=SEC·KR=DART 둘 다 공시라서 라벨이 맞지만, 번들에 공시가 아닌 소스(벤더 요약 등)가
 * 섞이는 순간 그 항목까지 `filing` 이 된다 — **출처 종류를 분리하라는 규칙이 조용히 깨진다.**
 * 화면은 이 라벨로 "공시에서 확인했어요" 를 말하므로 오라벨은 사용자에게 거짓이 된다.
 *
 * ## 섞이면 만들지 않는다
 *
 * 한 문장이 공시와 벤더 요약을 함께 인용하면 어느 쪽이라고 찍어도 절반은 틀리다.
 * 종류를 섞은 항목은 라벨을 고르지 않고 **버린다**(출처 없으면 항목 없음과 같은 원칙).
 *
 * `vendor_summary` 는 대응되는 리스크 소스 종류가 없다 — 공시가 아니므로 `filing` 이 아니고,
 * 시세도 아니므로 `market_data` 도 아니다. 억지로 대응시키지 않고 사유를 남긴다.
 */
export function symbolRiskKindForChunks(
  kinds: readonly BusinessSourceKind[]
): { ok: true; kind: SymbolRiskSourceKind } | { ok: false; reason: string } {
  const unique = [...new Set(kinds)];
  if (unique.length === 0) return { ok: false, reason: "인용 청크 없음" };
  if (unique.length > 1) return { ok: false, reason: `인용이 소스 종류를 섞음(${unique.sort().join("+")})` };
  const kind = unique[0]!;
  if (kind === "disclosure") return { ok: true, kind: "filing" };
  if (kind === "market_data") return { ok: true, kind: "market_data" };
  return { ok: false, reason: `${kind} 는 리스크 소스 종류로 대응되지 않음` };
}

/**
 * 후보 목록 → 렌더 가능한 종목 리스크 블록.
 *
 * `unavailableReason` 은 소스·추출 단계의 실패 사유다(예: "Item 1A 참조 편입"). 후보가 있었으나
 * 전부 걸러진 경우와 애초에 소스를 못 얻은 경우는 다른 말이므로 호출부가 구분해 넘긴다.
 */
export function buildSymbolRiskBlock(
  candidates: readonly SymbolRiskCandidate[],
  unavailableReason: string | null
): SymbolRiskBlock {
  const items: SymbolRisk[] = [];
  const rejected: SymbolRiskBlock["rejected"] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (items.length >= SYMBOL_RISK_MAX_ITEMS) {
      rejected.push({ candidate, rejection: { reason: "over_cap" } });
      continue;
    }
    const rejection = rejectionOf(candidate, seen);
    if (rejection) {
      rejected.push({ candidate, rejection });
      continue;
    }
    const text = normalize(candidate.text);
    seen.add(text);
    items.push({
      id: riskId(text, items.length),
      text,
      source_ids: [...candidate.source_ids],
      source_kind: candidate.source_kind,
      as_of: candidate.as_of,
    });
  }

  if (items.length > 0) return { items, unavailable_reason: null, rejected };

  // 사유를 만들어 올린다 — 비어 있는 채로 렌더되면 "리스크 없는 회사" 로 읽힌다.
  const reason =
    unavailableReason ??
    (candidates.length > 0
      ? `후보 ${candidates.length}건이 전부 검증에서 탈락(${[...new Set(rejected.map((entry) => entry.rejection.reason))].join(", ")})`
      : "위험요소 소스를 확보하지 못함");
  return { items: [], unavailable_reason: reason, rejected };
}

/** 화면 문구 — "없음" 이라고 쓰지 않는다(§11 · 완료 조건 3). */
export const SYMBOL_RISK_UNAVAILABLE_TEXT = "이 종목만의 리스크는 아직 확보하지 못했어요.";
