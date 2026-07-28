import type { BusinessContext } from "@fomo/core";
import { promptOf } from "@fomo/core";
import { kstDate } from "../fomo";
import { readFeedContent, writeFeedContent } from "../feed-content-store";
import { loadFundamentalsUniverse, type UniverseEntry } from "../fundamentals/universe";
import { buildBusinessContext } from "./build";
import {
  needsResynthesis,
  readBusinessContext,
  writeBusinessContext,
  writeBusinessContextIndex,
  type BusinessContextIndexEntry,
} from "./repository";
import { SYNTHESIZE_PROMPT_ID, VERIFY_PROMPT_ID } from "./synthesize";
import { fetchVariableObservations } from "./variable-values";

/**
 * 사업 실체 합성 배치 (WO-SUB-03 §5).
 *
 * | 대상 | 주기 |
 * |---|---|
 * | 슬롯 1·2 | 소스 문서 갱신 시 또는 프롬프트 버전 변경 시 |
 * | 슬롯 3 | 일 1회(변수 값만 갱신, 문장 구조 고정) |
 *
 * 청크 커서로 나눠 돈다 — LLM 페이싱(종목당 3콜 × 2.6초) 때문에 한 번에 전 유니버스를 돌 수 없다.
 * **재합성 판정을 먼저 한다**(`needsResynthesis`) — 프롬프트 버전이 안 바뀌고 문서도 그대로면
 * LLM 을 부르지 않는다. 전량 재합성 비용이 언제 발생하는지 명확히 하는 지점이다.
 */

const CURSOR_ID = "bizctx-cursor";
/** 1회 청크 종목 수. 종목당 LLM 3콜 × 2.6초 페이싱 ≈ 8초. */
const DEFAULT_CHUNK = 8;

interface CursorRow {
  date: string;
  done: string[];
  updatedAt: string;
}

export interface RefreshOutcome {
  canonical: string;
  market: string;
  badge: string;
  slot1: boolean;
  slot2: boolean;
  slot3: boolean;
  resynthesized: boolean;
  reason: string | null;
  errors: string[];
}

export interface RefreshResult {
  date: string;
  universe: number;
  processed: number;
  remaining: number;
  done: boolean;
  promptVersion: string;
  outcomes: RefreshOutcome[];
}

function currentPromptVersion(): string {
  return `${promptOf(SYNTHESIZE_PROMPT_ID).hash}+${promptOf(VERIFY_PROMPT_ID).hash}`;
}

function outcomeOf(context: BusinessContext, resynthesized: boolean, reason: string | null): RefreshOutcome {
  return {
    canonical: context.canonical,
    market: context.market,
    badge: context.badge,
    slot1: context.slot1_revenue_source !== null,
    slot2: context.slot2_dependency !== null,
    slot3: context.slot3_dependency_state !== null,
    resynthesized,
    reason,
    errors: context.errors,
  };
}

export async function refreshBusinessContextChunk(
  options: { limit?: number; reset?: boolean; only?: readonly string[]; force?: boolean; date?: string } = {}
): Promise<RefreshResult> {
  const date = options.date ?? kstDate();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_CHUNK, 60));
  const promptVersion = currentPromptVersion();
  const universe = await loadFundamentalsUniverse();
  const filtered =
    options.only && options.only.length > 0
      ? universe.filter((entry) => options.only!.includes(entry.canonical) || (entry.symbol ? options.only!.includes(entry.symbol) : false))
      : universe;

  const cursor = options.reset ? null : await readFeedContent<CursorRow>(CURSOR_ID).catch(() => null);
  const done = new Set(cursor?.date === date ? cursor.done : []);
  const batch = filtered.filter((entry) => !done.has(entry.canonical)).slice(0, limit);

  const values = await fetchVariableObservations();
  const outcomes: RefreshOutcome[] = [];
  for (const entry of batch) {
    try {
      outcomes.push(await refreshOne(entry, promptVersion, values.observations, options.force === true));
    } catch (error) {
      outcomes.push({
        canonical: entry.canonical,
        market: entry.country,
        badge: "없음",
        slot1: false,
        slot2: false,
        slot3: false,
        resynthesized: false,
        reason: null,
        errors: [`build 실패: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
    done.add(entry.canonical);
  }

  await writeFeedContent(CURSOR_ID, { date, done: [...done], updatedAt: new Date().toISOString() } satisfies CursorRow);
  const remaining = Math.max(0, filtered.length - done.size);
  if (remaining === 0) await writeDayIndex(date, filtered);
  return { date, universe: filtered.length, processed: batch.length, remaining, done: remaining === 0, promptVersion, outcomes };
}

/**
 * 종목 1개. 재합성이 필요 없으면 **LLM 을 부르지 않고** 슬롯 3 만 갱신한다 —
 * 값 변수는 일 1회 바뀌지만 문장 구조는 고정이므로 합성을 다시 할 이유가 없다(§5).
 */
async function refreshOne(
  entry: UniverseEntry,
  promptVersion: string,
  observations: Awaited<ReturnType<typeof fetchVariableObservations>>["observations"],
  force: boolean
): Promise<RefreshOutcome> {
  const existing = await readBusinessContext(entry.country, entry.canonical);
  const verdict = force
    ? { needed: true, reason: "강제 재합성" }
    : needsResynthesis(existing, promptVersion, existing?.documents.map((document) => document.snapshot_hash) ?? []);

  if (!verdict.needed && existing) {
    // 슬롯 3 만 갱신 — 변수 값이 매일 바뀐다. 슬롯 1·2 는 그대로 둔다(LLM 0콜).
    const { buildSlot3, computeBadge } = await import("@fomo/core");
    const slot3 = existing.slot2_dependency ? buildSlot3(existing.slot2_dependency.text, observations) : null;
    const updated: BusinessContext = { ...existing, slot3_dependency_state: slot3 };
    updated.badge = computeBadge(updated);
    await writeBusinessContext(updated);
    return outcomeOf(updated, false, "슬롯3만 갱신");
  }

  const context = await buildBusinessContext(entry, { observations });
  await writeBusinessContext(context);
  const { archiveSourceText } = await import("./repository");
  // 원문 아카이브는 문서 해시로 키를 잡으므로 같은 문서를 두 번 저장하지 않는다.
  for (const document of context.documents) {
    const cited = context.cited_chunks.filter((chunk) => chunk.doc_id === document.doc_id).map((chunk) => chunk.text);
    if (cited.length > 0) await archiveSourceText(document.doc_id, document.snapshot_hash, cited.join("\n\n"));
  }
  return outcomeOf(context, true, verdict.reason);
}

async function writeDayIndex(date: string, universe: readonly UniverseEntry[]): Promise<void> {
  const entries: BusinessContextIndexEntry[] = [];
  for (const entry of universe) {
    const context = await readBusinessContext(entry.country, entry.canonical);
    if (!context) continue;
    entries.push({
      canonical: entry.canonical,
      market: context.market,
      badge: context.badge,
      prompt_version: context.prompt_version,
      slot1: context.slot1_revenue_source !== null,
      slot2: context.slot2_dependency !== null,
      slot3: context.slot3_dependency_state !== null,
    });
  }
  await writeBusinessContextIndex(date, entries);
}
