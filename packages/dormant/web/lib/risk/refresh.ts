import { kstDate } from "../fomo";
import { readFeedContent, writeFeedContent } from "../feed-content-store";
import { loadCikMap } from "../fundamentals/sec-xbrl";
import { loadFundamentalsUniverse, type UniverseEntry } from "../fundamentals/universe";
import { buildSymbolRisk, type BuildSymbolRiskOutcome } from "./build";
import { readSymbolRisk } from "./repository";
import { RISK_SYNTHESIZE_PROMPT_ID } from "./synthesize";
import { riskPromptOf } from "@fomo/core";

/**
 * 종목 고유 리스크 배치 (WO-SUB-06.5).
 *
 * 청크 커서로 나눠 돈다 — 종목당 LLM 최대 4콜(합성 1 + 검증 최대 3)에 페이싱이 걸려 한 번에
 * 전 유니버스를 돌 수 없다. `business-context` 크론과 같은 패턴이다.
 *
 * ## 재합성을 언제 하나
 *
 * 프롬프트 본문 해시가 바뀌었거나 레코드가 없을 때만 LLM 을 부른다. 위험요소는 **연 1회**
 * (사업보고서·10-K 제출 시점) 바뀌는 문서라 매일 다시 합성할 이유가 없다 — 그건 비용만 쓴다.
 * `force=1` 은 의도적 전량 재합성이다.
 *
 * 문서 자체가 바뀌었는지(새 사업보고서)는 여기서 보지 않는다 — 소스 취득이 항상 **최근** 보고서를
 * 집으므로 재합성 시 자동으로 새 문서를 읽는다. 문서 해시 기반 트리거는 부채로 남긴다.
 */

const CURSOR_ID = "symbol-risk-cursor";
/** 1회 청크 종목 수. 종목당 최대 4콜 × 페이싱 ≈ 10초. */
const DEFAULT_CHUNK = 6;

interface CursorRow {
  date: string;
  done: string[];
  updatedAt: string;
}

export interface RiskRefreshResult {
  date: string;
  universe: number;
  processed: number;
  remaining: number;
  done: boolean;
  prompt_hash: string;
  /** 합성을 건너뛴 수(재합성 불필요) — 비용이 어디로 갔는지 보인다. */
  skipped: number;
  outcomes: BuildSymbolRiskOutcome[];
}

function promptHash(): string {
  return riskPromptOf(RISK_SYNTHESIZE_PROMPT_ID).hash;
}

/**
 * 재합성이 필요한가.
 *
 * 레코드가 없으면 필요하다. 있으면 프롬프트 해시가 같은지 본다 — **버전 문자열이 아니라 본문
 * 해시**다(문안만 고치고 버전을 안 올리는 사고를 잡는다, WO-SUB-03.5 PART C-2 선례).
 *
 * ⚠️ 쿼터 소진·호출 실패로 만들어진 레코드는 **재시도해야 한다.** 사유가 담긴 레코드를 "합성
 * 완료" 로 취급하면 그 종목이 영구히 빈 채로 남는다 — DART `013` 을 30일 부재로 굳혔던 것과
 * 같은 종류의 사고다.
 */
const RETRYABLE_REASON = /쿼터|호출 실패|LLM 미설정|판정 불가|매핑 없음|API_KEY|검증에서 전부 탈락/;

export async function needsRiskResynthesis(market: string, canonical: string, hash: string): Promise<boolean> {
  const record = await readSymbolRisk(market, canonical);
  if (!record) return true;
  if (record.prompt_id !== RISK_SYNTHESIZE_PROMPT_ID) return true;
  if (record.items.length === 0 && record.unavailable_reason && RETRYABLE_REASON.test(record.unavailable_reason)) return true;
  // **본문 해시 비교** — 문안만 고치고 버전을 안 올린 경우를 잡는다. 레코드에 해시가 없는
  // 구버전 레코드도 재합성 대상이다(해시를 기록하기 전에 만들어진 것).
  return record.prompt_hash !== hash;
}

function targetOf(entry: UniverseEntry, cikMap: Map<string, string>): Parameters<typeof buildSymbolRisk>[0] {
  const symbol = entry.symbol?.trim().toUpperCase();
  return {
    canonical: entry.canonical,
    market: entry.country,
    ...(symbol && cikMap.get(symbol) ? { cik: cikMap.get(symbol)! } : {}),
    ...(entry.naverCode ? { stockCode: entry.naverCode } : {}),
  };
}

export async function refreshSymbolRiskChunk(
  options: { limit?: number; reset?: boolean; only?: readonly string[]; force?: boolean; date?: string } = {}
): Promise<RiskRefreshResult> {
  const date = options.date ?? kstDate();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_CHUNK, 40));
  const hash = promptHash();
  const universe = await loadFundamentalsUniverse();
  const filtered =
    options.only && options.only.length > 0
      ? universe.filter(
          (entry) => options.only!.includes(entry.canonical) || (entry.symbol ? options.only!.includes(entry.symbol) : false)
        )
      : universe;

  const cursor = options.reset ? null : await readFeedContent<CursorRow>(CURSOR_ID).catch(() => null);
  const done = new Set(cursor?.date === date ? cursor.done : []);
  const batch = filtered.filter((entry) => !done.has(entry.canonical)).slice(0, limit);

  const { map: cikMap } = await loadCikMap().catch(() => ({ map: new Map<string, string>(), failed: true }));
  const outcomes: BuildSymbolRiskOutcome[] = [];
  let skipped = 0;

  for (const entry of batch) {
    try {
      if (!options.force && !(await needsRiskResynthesis(entry.country, entry.canonical, hash))) {
        skipped += 1;
        done.add(entry.canonical);
        continue;
      }
      outcomes.push(await buildSymbolRisk(targetOf(entry, cikMap)));
    } catch (error) {
      // 한 종목의 실패가 배치를 죽이지 않는다.
      outcomes.push({
        canonical: entry.canonical,
        market: entry.country,
        stored: false,
        items: 0,
        unavailable_reason: `build 실패: ${error instanceof Error ? error.message : String(error)}`,
        errors: [],
      });
    }
    done.add(entry.canonical);
  }

  await writeFeedContent(CURSOR_ID, { date, done: [...done], updatedAt: new Date().toISOString() } satisfies CursorRow);
  const remaining = Math.max(0, filtered.length - done.size);
  return { date, universe: filtered.length, processed: batch.length, remaining, done: remaining === 0, prompt_hash: hash, skipped, outcomes };
}
