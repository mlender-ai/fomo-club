import type { Prisma } from "@prisma/client";
import { judgeBusinessInvalidation, seriesForMetric, type InvalidationVerdict } from "@fomo/core";
import { prisma } from "../prisma";
import { kstDate } from "../fomo";
import { readLedgerSelections, appendJudgmentLedger, type LedgerAppendInput } from "../judgment-ledger";
import { readFactSheet } from "../fundamentals/repository";

/**
 * 사업 무효 조건 자동 판정 (WO-SUB-07 §6-4).
 *
 * 발행 시점 스탬프에 박아둔 조건을, 이후 팩트시트로 판정한다.
 *
 * ```
 * 원장에서 조건이 박힌 발행분 조회
 *   → 이미 판정된 것 제외(append-only · 멱등)
 *   → 현재 팩트시트에서 metric 시계열 추출
 *   → judgeBusinessInvalidation
 *   → 결과를 원장에 append (충족 / 미충족 / 판정 불가)
 * ```
 *
 * ## 판정 불가를 미충족으로 처리하지 않는다
 *
 * §6-4 가 명시한 규칙이다. 데이터가 없어서 판정 못 한 것을 "조건 미충족(=관점 유효)" 으로
 * 세면 성적이 조용히 좋아진다. `insufficient_data` 를 별도 상태로 기록하고 집계에서도 분리한다.
 *
 * ## 발행 시점 조건을 쓴다 (사후 변경 금지)
 *
 * 조건 카탈로그가 바뀌어도 **그때 박아둔 조건**으로 판정한다(§4 규칙 1·5). 지금 카탈로그를
 * 다시 읽으면 과거 판단을 새 기준으로 채점하게 되고, 그건 이 제품이 하지 말아야 할 일이다.
 */

/** 판정 레코드 — 기존 수익률 outcome 과 같은 `kind: "outcome"` 을 쓰되 형태로 구분된다. */
export interface BusinessInvalidationOutcome {
  /** 형태 구분자. `asOutcome()` 은 이 payload 를 null 로 흘려보낸다(수익률 집계 오염 없음). */
  outcomeKind: "business_invalidation";
  selectionId: string;
  selectionDate: string;
  canonical: string;
  market: string;
  /** 발행 시점 조건 — 사후 카탈로그가 아니라 스탬프에서 읽은 것. */
  metric: string;
  direction: string;
  threshold: number | null;
  consecutive: number | null;
  verdict: InvalidationVerdict;
  /** `insufficient_data` 의 이유. 판정된 경우 null. */
  reason: string | null;
  /** 판정에 쓴 관측 수 — 표본이 몇 개였는지 사후에 보인다. */
  observations: number;
  /** 판정 시점 팩트시트 해시 — 어느 데이터로 판정했는지 복원 가능하게. */
  factsheet_hash: string | null;
  evaluatedAt: string;
  /** 발행 시점 룰셋 — 버전이 다른 판정을 섞어 집계하지 않기 위해(§7). */
  ruleset_version: string | null;
}

export function asBusinessInvalidationOutcome(payload: Prisma.JsonValue): BusinessInvalidationOutcome | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (value.outcomeKind !== "business_invalidation") return null;
  if (typeof value.selectionId !== "string" || typeof value.verdict !== "string") return null;
  return value as unknown as BusinessInvalidationOutcome;
}

export interface JudgeResult {
  date: string;
  candidates: number;
  judged: number;
  skipped: number;
  byVerdict: Record<string, number>;
}

/**
 * 미판정 발행분을 판정한다.
 *
 * 한 발행(selection)당 **한 번만** 판정한다. 조건이 한 번 충족되면 그 관점은 무효가 된 것이고,
 * 이후 되돌아와도 "무효였다" 는 사실은 남는다 — 재판정으로 지우지 않는다(§4 규칙 1).
 */
export async function judgeBusinessInvalidations(
  options: { today?: string; lookbackDays?: number; limit?: number } = {}
): Promise<JudgeResult> {
  const today = options.today ?? kstDate();
  const lookback = options.lookbackDays ?? 400;
  const limit = Math.max(1, Math.min(options.limit ?? 200, 1_000));
  const fromDate = new Date(Date.parse(`${today}T00:00:00Z`) - lookback * 86_400_000).toISOString().slice(0, 10);

  const selections = await readLedgerSelections({ fromDate, take: 5_000 });
  const existingRows = await prisma.judgmentLedger.findMany({
    where: { kind: "outcome", date: { gte: fromDate } },
    select: { payload: true },
    take: 20_000,
  });
  const judgedIds = new Set(
    existingRows.flatMap((row) => {
      const outcome = asBusinessInvalidationOutcome(row.payload);
      return outcome ? [outcome.selectionId] : [];
    })
  );

  const candidates = selections
    .filter((selection) => selection.payload.publication?.invalidation_business_rule)
    .filter((selection) => !judgedIds.has(selection.id))
    .slice(0, limit);

  const byVerdict: Record<string, number> = {};
  const entries: LedgerAppendInput[] = [];
  let judged = 0;

  for (const selection of candidates) {
    const stamp = selection.payload.publication!;
    const rule = stamp.invalidation_business_rule!;
    const market = selection.payload.market ?? selection.payload.country ?? "KR";
    const record = await readFactSheet(market, selection.subject.canonical).catch(() => null);

    let verdict: InvalidationVerdict = "insufficient_data";
    let reason: string | null = "판정 시점 팩트시트 없음";
    let observations = 0;

    if (record?.factsheet) {
      const series = seriesForMetric(rule.metric, record.factsheet);
      if (series.ok) {
        observations = series.series.length;
        verdict = judgeBusinessInvalidation(rule, { series: series.series });
        // `insufficient_data` 는 관측 부족이다 — 그 사실을 사유로 남긴다.
        reason = verdict === "insufficient_data" ? `관측 ${observations}건 — 판정에 필요한 수 미달` : null;
      } else {
        reason = series.reason;
      }
    }

    const payload: BusinessInvalidationOutcome = {
      outcomeKind: "business_invalidation",
      selectionId: selection.id,
      selectionDate: selection.date,
      canonical: selection.subject.canonical,
      market,
      metric: rule.metric,
      direction: rule.direction,
      threshold: rule.threshold,
      consecutive: rule.consecutive,
      verdict,
      reason,
      observations,
      factsheet_hash: record?.factsheet_hash ?? null,
      evaluatedAt: new Date().toISOString(),
      ruleset_version: stamp.ruleset_version ?? null,
    };

    entries.push({
      date: today,
      subject: selection.subject,
      kind: "outcome",
      payload: payload as unknown as Record<string, unknown>,
      priceAt: selection.priceAt,
      actor: "engine",
      // 발행 1건당 1회 — 재실행해도 같은 키라 중복이 쌓이지 않는다(완료 조건 4).
      idempotencyKey: `business-invalidation:${selection.id}`,
    });

    byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1;
    judged += 1;
  }

  // 한 번에 append — 원장 API 가 배열을 받고, 건별 호출은 트랜잭션을 N 번 연다.
  if (entries.length > 0) await appendJudgmentLedger(entries);

  return {
    date: today,
    candidates: candidates.length,
    judged,
    skipped: selections.length - candidates.length,
    byVerdict,
  };
}
