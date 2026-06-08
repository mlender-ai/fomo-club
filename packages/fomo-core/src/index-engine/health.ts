/**
 * FOMO Index 운영 관측 — 스냅샷 건강 요약 (정직한 숫자 원칙의 운영 측정).
 *
 * computeFomoIndex 결과의 각 Heat `meta.confidence`를 읽어 "오늘 지수가 실제 데이터로
 * 산출됐는지 / 폴백(중립 기본값)인지"를 결정론적으로 요약한다.
 * docs/FOMO_INDEX.md "데이터 소스 미비 시 폴백, 빈 값/에러 노출 0".
 *
 * 순수 함수 — vitest 로 검증. 파이프라인(scripts/fomo-index-pipeline.ts)이 이걸로
 * Slack 건강 리포트를 만들고, 실패/저하를 가시화한다.
 */

import type { FomoIndex, HeatComponent } from "../types";
import type { HeatConfidence } from "./types";

export interface HeatHealth {
  key: string;
  score: number;
  max: number;
  confidence: HeatConfidence;
  sourcesAvailable: number;
  sourcesTotal: number;
  /** 폴백(중립 기본값) 사용 여부. */
  fallback: boolean;
}

export interface IndexHealth {
  date: string;
  score: number;
  state: string;
  heats: HeatHealth[];
  /** confidence === "fallback" 인 Heat 수. */
  fallbackCount: number;
  /** 실데이터(폴백 아님) Heat 수. */
  realCount: number;
  /** 폴백이 하나라도 있으면 true (저하 상태). */
  degraded: boolean;
  /** 감정 투표 수(있으면). 정직한 숫자 — 실제 집계. */
  voteCount: number;
}

const CONF_RANK: Record<HeatConfidence, number> = { fallback: 0, low: 1, medium: 2, high: 3 };

/** FOMO Index 스냅샷의 건강 상태 요약(순수). voteCount 는 감정 집계 총합(없으면 0). */
export function summarizeHealth(index: FomoIndex, voteCount = 0): IndexHealth {
  const heats: HeatHealth[] = (index.components ?? []).map((c: HeatComponent) => {
    const conf = c.meta?.confidence ?? "fallback";
    return {
      key: c.key,
      score: c.score,
      max: c.max,
      confidence: conf,
      sourcesAvailable: c.meta?.sourcesAvailable ?? 0,
      sourcesTotal: c.meta?.sourcesTotal ?? 0,
      fallback: conf === "fallback",
    };
  });
  const fallbackCount = heats.filter((h) => h.fallback).length;
  return {
    date: index.date,
    score: index.score,
    state: index.state,
    heats,
    fallbackCount,
    realCount: heats.length - fallbackCount,
    degraded: fallbackCount > 0,
    voteCount,
  };
}

const CONF_EMOJI: Record<HeatConfidence, string> = {
  high: "🟢",
  medium: "🟡",
  low: "🟠",
  fallback: "⚪",
};

/** Slack/로그용 한 줄 + 분해 렌더. 정직하게: 폴백이면 폴백이라고 표기. */
export function renderHealthReport(h: IndexHealth): string {
  const lines: string[] = [];
  lines.push(
    `📊 *FOMO Index ${h.date}* — ${h.score} (${h.state}) · 실데이터 ${h.realCount}/4 Heat · 감정투표 ${h.voteCount}표`,
  );
  if (h.degraded) {
    lines.push(`⚠️ 폴백 ${h.fallbackCount}개 Heat (중립 기본값 — 라이브 소스 미연동/실패)`);
  }
  lines.push(
    h.heats
      .map((x) => `${CONF_EMOJI[x.confidence]} ${x.key} ${x.score}/${x.max}(${x.confidence} ${x.sourcesAvailable}/${x.sourcesTotal})`)
      .join("  "),
  );
  return lines.join("\n");
}

/** confidence 순위 비교 헬퍼(테스트/정렬용). */
export function confidenceRank(c: HeatConfidence): number {
  return CONF_RANK[c];
}
