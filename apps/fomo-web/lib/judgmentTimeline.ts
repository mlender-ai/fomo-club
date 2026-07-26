import { normalizeSignalTypeCodes, signalTypeLabel, type SignalTypeCode } from "@fomo/core";
import type { LedgerTimelineEntry } from "@/lib/fomoApi";

/** 원장 항목의 신호 코드(신호 항목이 아니면 빈 배열). */
export function signalTypes(entry: LedgerTimelineEntry): SignalTypeCode[] {
  if (entry.kind !== "signal") return [];
  const raw = Array.isArray(entry.payload.signalTypes)
    ? entry.payload.signalTypes
    : Array.isArray(entry.payload.types)
      ? entry.payload.types
      : [];
  return normalizeSignalTypeCodes(raw);
}

/** 원장 항목 한 줄 요약 — 화면 문구의 단일 소스. */
export function entrySummary(entry: LedgerTimelineEntry): string {
  const payload = entry.payload;
  if (entry.kind === "signal") {
    const types = signalTypes(entry).map(signalTypeLabel);
    return [types.join(" · "), typeof payload.headline === "string" ? payload.headline : ""].filter(Boolean).join(" — ");
  }
  if (entry.kind === "verdict") return typeof payload.stanceText === "string" ? payload.stanceText : "결정론 판단 기록";
  if (entry.kind === "score") {
    const score = typeof payload.score === "number" ? `${payload.score}점` : "점수 기록";
    return `${score}${typeof payload.label === "string" ? ` · ${payload.label}` : ""}`;
  }
  if (entry.kind === "selection") return payload.pickType === "quiet" ? "조용한 픽으로 선정" : "오늘의 30장에 선정";
  if (entry.kind === "user_action") {
    const action = payload.action;
    return action === "seen" ? "처음 봄" : action === "pass" ? "넘김" : action === "star" ? "관심에 담음" : "상세 확인";
  }
  const days = typeof payload.windowDays === "number" ? `${payload.windowDays}일` : "고정창";
  const value = typeof payload.returnPct === "number" ? `${payload.returnPct > 0 ? "+" : ""}${payload.returnPct.toFixed(1)}%` : "";
  return `${days} 성과 ${value}`.trim();
}

export interface CollapsedEntry {
  entry: LedgerTimelineEntry;
  /** 연속으로 같은 내용이 반복된 횟수(1이면 접힘 없음). */
  repeats: number;
  /** 가장 오래된 반복의 날짜(repeats>1 일 때만). */
  since?: string;
}

/**
 * 연속으로 같은 종류·같은 문구인 항목을 하나로 접는다(최신 항목이 대표).
 * 사이에 다른 사건이 끼면 접지 않는다 — 시점 기록의 순서는 보존해야 한다.
 * 사실을 지우는 게 아니라 "언제부터 몇 번"으로 합쳐 스크롤만 줄인다.
 */
export function collapseRepeats(entries: readonly LedgerTimelineEntry[]): CollapsedEntry[] {
  const out: CollapsedEntry[] = [];
  for (const entry of entries) {
    const last = out[out.length - 1];
    if (last && last.entry.kind === entry.kind && entrySummary(last.entry) === entrySummary(entry)) {
      last.repeats += 1;
      last.since = entry.date; // entries 는 최신순 — 뒤로 갈수록 과거다.
      continue;
    }
    out.push({ entry, repeats: 1 });
  }
  return out;
}
