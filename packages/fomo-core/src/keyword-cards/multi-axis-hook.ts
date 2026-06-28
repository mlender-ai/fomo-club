import { isFrontHookSafe, type CardFrontSignals } from "./card-front-hook";

export type HookAxis = "price" | "flow" | "time" | "herd" | "affinity";

export type EvidenceSourceKind = "official" | "news" | "market" | "user";

export interface AxisEvidence {
  text: string;
  sourceKind: EvidenceSourceKind;
  source: string;
  asOf: string;
}

export interface AxisSignal {
  axis: HookAxis;
  fired: boolean;
  strength: number;
  rarity: number;
  hookText: string;
  evidence: AxisEvidence[];
}

export interface MultiAxisHookSelection {
  axis: HookAxis | "fallback";
  hookText: string;
  strength: number;
  rarity: number;
  evidence: AxisEvidence[];
  axisSignals: AxisSignal[];
}

export interface AffinityAxisInput {
  fired: boolean;
  strength: number;
  hookText: string;
  evidenceText?: string;
  asOf?: string;
}

export interface MultiAxisFeedRankOptions<T> {
  getSignals: (item: T) => readonly AxisSignal[] | undefined;
  getKey: (item: T) => string;
  interleaveEvery?: number;
  maxAxisRun?: number;
}

export interface MultiAxisRanked<T> {
  item: T;
  hook: MultiAxisHookSelection;
}

export const AXIS_STRENGTH_OVERRIDE = 0.9;
export const AXIS_RARITY_WEIGHT = 0.65;
export const AXIS_STRENGTH_WEIGHT = 0.35;
export const INTERLEAVE_EVERY = 6;
export const MAX_AXIS_RUN = 2;

const AXIS_ORDER: Record<HookAxis | "fallback", number> = {
  time: 0,
  flow: 1,
  herd: 2,
  price: 3,
  affinity: 4,
  fallback: 5,
};

const FORBIDDEN_HOOK_TEXT = /매수|매도|목표가|급등\s?임박|폭등|추천|사라|팔아라|오를\s?것|수익|텐베거/;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pctText(p: number): string {
  const sign = p > 0 ? "+" : p < 0 ? "-" : "";
  return `${sign}${Math.abs(p).toFixed(1)}%`;
}

function ratioText(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function asOfLabel(asOf?: string): string {
  return asOf?.trim() ? `${asOf.trim()} 기준` : "오늘 기준";
}

function safeHookText(text: string): boolean {
  return isFrontHookSafe(text) && !FORBIDDEN_HOOK_TEXT.test(text);
}

function signal(
  axis: HookAxis,
  fired: boolean,
  strength: number,
  hookText: string,
  evidence: AxisEvidence[]
): AxisSignal {
  const clean = hookText.trim();
  const safe = clean.length > 0 && safeHookText(clean) && evidence.every((e) => e.sourceKind !== "news" || e.source.trim());
  return {
    axis,
    fired: fired && safe,
    strength: fired && safe ? clamp01(strength) : 0,
    rarity: 0,
    hookText: fired && safe ? clean : "",
    evidence: fired && safe ? evidence : [],
  };
}

function priceAxis(signals: CardFrontSignals, asOf: string): AxisSignal {
  const evidence = (text: string, source: string): AxisEvidence[] => [{ text, sourceKind: "market", source, asOf }];
  if (signals.near52WeekHigh) {
    return signal("price", true, 0.74, "최근 1년 중 가장 높은 가격대까지 왔어요.", evidence("52주 고가권", "가격"));
  }
  if (signals.near52WeekLow) {
    return signal("price", true, 0.64, "최근 1년 낮은 가격대에 가까워요.", evidence("52주 저가권", "가격"));
  }
  if (typeof signals.volumeRatio === "number" && signals.volumeRatio >= 1.8) {
    return signal(
      "price",
      true,
      Math.min(1, 0.42 + signals.volumeRatio / 5),
      `거래가 평소 ${ratioText(signals.volumeRatio)}배로 늘었어요.`,
      evidence(`평소 대비 거래량 ${ratioText(signals.volumeRatio)}배`, "거래량")
    );
  }
  if (typeof signals.changePct === "number" && Math.abs(signals.changePct) >= 5) {
    return signal(
      "price",
      true,
      Math.min(0.86, 0.46 + Math.abs(signals.changePct) / 18),
      `오늘 가격이 ${pctText(signals.changePct)} 움직였어요.`,
      evidence(`등락률 ${pctText(signals.changePct)}`, "가격")
    );
  }
  return signal("price", false, 0, "", []);
}

function flowAxis(signals: CardFrontSignals, asOf: string): AxisSignal {
  const fs = signals.foreignNetStreak ?? 0;
  const is = signals.institutionNetStreak ?? 0;
  const foreignStrong = Math.abs(fs) >= 3;
  const instStrong = Math.abs(is) >= 3;
  if (!foreignStrong && !instStrong) return signal("flow", false, 0, "", []);

  const useForeign = Math.abs(fs) >= Math.abs(is);
  const n = useForeign ? Math.abs(fs) : Math.abs(is);
  const actor = useForeign ? "외국인이" : "기관이";
  const verb = (useForeign ? fs : is) > 0 ? "사는 중이에요." : "파는 중이에요.";
  return signal("flow", true, Math.min(1, 0.48 + n / 10), `${actor} ${n}일째 ${verb}`, [
    { text: `${actor} ${n}일 연속 ${verb.replace(" 중이에요.", "")}`, sourceKind: "official", source: "KRX 수급", asOf },
  ]);
}

function timeAxis(signals: CardFrontSignals, asOf: string): AxisSignal {
  const schedule = (signals.catalysts ?? []).find((c) => c.kind === "schedule" && c.label.trim());
  if (schedule) {
    const text = schedule.when ? `${schedule.when} ${schedule.label}가 있어요.` : `${schedule.label} 일정이 있어요.`;
    return signal("time", true, 0.86, text, [
      { text: schedule.when ? `${schedule.when} ${schedule.label}` : schedule.label, sourceKind: "official", source: "일정", asOf },
    ]);
  }
  const label = signals.newsEventLabel?.trim();
  if (!label || label === "재료") return signal("time", false, 0, "", []);
  const compact = label.length > 38 ? `${label.slice(0, 37)}…` : label;
  return signal("time", true, 0.84, `${compact} 소식이 나왔어요.`, [
    { text: compact, sourceKind: "news", source: signals.newsEventSource ?? "뉴스", asOf },
  ]);
}

function herdAxis(signals: CardFrontSignals, asOf: string): AxisSignal {
  const peerCount = signals.themePeerCount ?? 0;
  const rank = signals.themeRelativeRank;
  const pct = signals.changePct;
  const avg = signals.themeAverageChangePct;
  const delta = signals.themeRelativeChangePct;
  const theme = signals.themeLabel?.trim() || "같은 테마";
  if (peerCount < 3 || typeof rank !== "number" || typeof pct !== "number") {
    return signal("herd", false, 0, "", []);
  }
  if (rank === 1 && pct > 0) {
    return signal("herd", true, 0.76, `같은 ${theme} 종목들 중 오늘 변동성이 가장 컸어요.`, [
      { text: `${theme} 동종 종목 비교, 등락률 ${pctText(pct)}`, sourceKind: "market", source: "동종 비교", asOf },
    ]);
  }
  if (typeof avg === "number" && typeof delta === "number" && avg <= -2 && delta >= 3) {
    return signal("herd", true, Math.min(0.82, 0.52 + delta / 18), `${theme}가 빠지는 날, 상대적으로 덜 빠졌어요.`, [
      { text: `${theme} 평균 ${pctText(avg)}, 차이 ${pctText(delta)}`, sourceKind: "market", source: "동종 흐름", asOf },
    ]);
  }
  return signal("herd", false, 0, "", []);
}

export function affinityAxisSignal(input: AffinityAxisInput): AxisSignal {
  return signal("affinity", input.fired, input.strength, input.hookText, [
    {
      text: input.evidenceText ?? "사용자의 관심 종목 섹터와의 유사성",
      sourceKind: "user",
      source: "내 발굴함",
      asOf: asOfLabel(input.asOf),
    },
  ]);
}

export function buildAxisSignals({
  signals = {},
  asOf,
  affinity,
}: {
  signals?: CardFrontSignals;
  asOf?: string;
  affinity?: AffinityAxisInput;
}): AxisSignal[] {
  const date = asOfLabel(asOf ?? signals.asOf);
  return [
    priceAxis(signals, date),
    flowAxis(signals, date),
    timeAxis(signals, date),
    herdAxis(signals, date),
    affinity ? affinityAxisSignal({ ...affinity, asOf: date }) : signal("affinity", false, 0, "", []),
  ];
}

export function applyAxisRarity(signalSets: readonly (readonly AxisSignal[])[]): AxisSignal[][] {
  const universe = Math.max(1, signalSets.length);
  const counts = new Map<HookAxis, number>();
  for (const set of signalSets) {
    const firedAxes = new Set(set.filter((s) => s.fired).map((s) => s.axis));
    for (const axis of firedAxes) counts.set(axis, (counts.get(axis) ?? 0) + 1);
  }
  return signalSets.map((set) =>
    set.map((s) => ({
      ...s,
      rarity: s.fired ? clamp01(1 - (counts.get(s.axis) ?? 0) / universe) : 0,
    }))
  );
}

function selectionScore(s: AxisSignal): number {
  return s.rarity * AXIS_RARITY_WEIGHT + s.strength * AXIS_STRENGTH_WEIGHT;
}

export function selectMultiAxisHook(axisSignals: readonly AxisSignal[] = []): MultiAxisHookSelection {
  const fired = axisSignals.filter((s) => s.fired && s.hookText);
  const sorted =
    fired.some((s) => s.strength >= AXIS_STRENGTH_OVERRIDE)
      ? [...fired].sort(
          (a, b) => b.strength - a.strength || b.rarity - a.rarity || AXIS_ORDER[a.axis] - AXIS_ORDER[b.axis]
        )
      : [...fired].sort(
          (a, b) =>
            selectionScore(b) - selectionScore(a) ||
            b.strength - a.strength ||
            AXIS_ORDER[a.axis] - AXIS_ORDER[b.axis]
        );
  const top = sorted[0];
  if (!top) {
    return {
      axis: "fallback",
      hookText: "오늘은 뚜렷한 신호 없음",
      strength: 0,
      rarity: 0,
      evidence: [],
      axisSignals: [...axisSignals],
    };
  }
  return {
    axis: top.axis,
    hookText: top.hookText,
    strength: top.strength,
    rarity: top.rarity,
    evidence: top.evidence,
    axisSignals: [...axisSignals],
  };
}

function compareRanked<T>(a: MultiAxisRanked<T> & { index: number; key: string }, b: MultiAxisRanked<T> & { index: number; key: string }): number {
  return (
    b.hook.rarity - a.hook.rarity ||
    b.hook.strength - a.hook.strength ||
    AXIS_ORDER[a.hook.axis] - AXIS_ORDER[b.hook.axis] ||
    a.index - b.index ||
    a.key.localeCompare(b.key)
  );
}

function breakAxisRuns<T>(rows: MultiAxisRanked<T>[], maxAxisRun: number): MultiAxisRanked<T>[] {
  if (maxAxisRun <= 0) return [...rows];
  const remaining = [...rows];
  const out: MultiAxisRanked<T>[] = [];
  const wouldExceedRun = (axis: HookAxis | "fallback") => {
    if (axis === "fallback" || out.length < maxAxisRun) return false;
    return out.slice(-maxAxisRun).every((row) => row.hook.axis === axis);
  };
  const leavesFeasible = (candidateIndex: number) => {
    const after = remaining.filter((_, index) => index !== candidateIndex);
    const total = after.length;
    if (total === 0) return true;
    const counts = new Map<HookAxis | "fallback", number>();
    for (const row of after) counts.set(row.hook.axis, (counts.get(row.hook.axis) ?? 0) + 1);
    let maxCount = 0;
    for (const count of counts.values()) maxCount = Math.max(maxCount, count);
    const otherCount = total - maxCount;
    return maxCount <= (otherCount + 1) * maxAxisRun;
  };
  while (remaining.length > 0) {
    let nextIndex = remaining.findIndex((row, index) => !wouldExceedRun(row.hook.axis) && leavesFeasible(index));
    if (nextIndex < 0) nextIndex = remaining.findIndex((row) => !wouldExceedRun(row.hook.axis));
    if (nextIndex < 0) nextIndex = 0;
    out.push(remaining.splice(nextIndex, 1)[0]!);
  }
  return out;
}

export function rankMultiAxisFeed<T>(
  items: readonly T[],
  options: MultiAxisFeedRankOptions<T>
): MultiAxisRanked<T>[] {
  const interleaveEvery = options.interleaveEvery ?? INTERLEAVE_EVERY;
  const maxAxisRun = options.maxAxisRun ?? MAX_AXIS_RUN;
  const withRarity = applyAxisRarity(items.map((item) => options.getSignals(item) ?? []));
  const enriched = items.map((item, index) => ({
    item,
    index,
    key: options.getKey(item),
    hook: selectMultiAxisHook(withRarity[index] ?? []),
  }));
  const raritySorted = [...enriched].sort(compareRanked);
  const strengthSorted = [...enriched].sort(
    (a, b) => b.hook.strength - a.hook.strength || b.hook.rarity - a.hook.rarity || a.index - b.index || a.key.localeCompare(b.key)
  );
  const used = new Set<string>();
  const out: typeof enriched = [];
  const push = (row: (typeof enriched)[number]) => {
    if (used.has(row.key)) return;
    used.add(row.key);
    out.push(row);
  };
  let rarityIndex = 0;
  while (out.length < enriched.length && rarityIndex < raritySorted.length) {
    if (out.length > 0 && out.length % interleaveEvery === 0) {
      const strong = strengthSorted.find((row) => !used.has(row.key));
      if (strong) push(strong);
    }
    push(raritySorted[rarityIndex++]!);
  }
  for (const row of strengthSorted) push(row);
  return breakAxisRuns(out, maxAxisRun).map(({ item, hook }) => ({ item, hook }));
}
