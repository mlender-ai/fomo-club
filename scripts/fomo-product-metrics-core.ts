export type TasteMetricSignal = "MORE" | "LESS" | "VIEW_DEPTH" | "TAP_RELATED";

export interface TasteMetricEvent {
  actorId: string;
  signal: TasteMetricSignal;
  createdAt: Date;
}

export interface RateMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface ProductMetrics {
  asOf: string;
  activeActors30d: number;
  engagedSessions30d: number;
  swipes30d: number;
  depthViews30d: number;
  swipesPerSession: number | null;
  sessionsWithDepthRate: RateMetric;
  d1EngagedRetention: RateMetric;
  d7EngagedRetention: RateMetric;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 30 * 60 * 1000;

function kstDay(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function startOfKstDay(day: string): number {
  return new Date(`${day}T00:00:00.000+09:00`).getTime();
}

function rate(numerator: number, denominator: number): RateMetric {
  return {
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null,
  };
}
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * TasteSignal 기반의 참여 지표. 방문 전체가 아니라 스와이프/상세 행동을 남긴 사용자만 측정한다.
 * 순수 방문 D1/D7은 별도 ProductEvent 저장소가 승인된 뒤 추가한다.
 */
export function calculateProductMetrics(
  events: readonly TasteMetricEvent[],
  now: Date,
  windowDays = 30,
): ProductMetrics {
  const asOf = kstDay(now);
  const asOfStart = startOfKstDay(asOf);
  const windowStart = asOfStart - (windowDays - 1) * DAY_MS;
  const windowEnd = asOfStart + DAY_MS;

  const valid = events
    .filter((event) => event.actorId.length > 0 && Number.isFinite(event.createdAt.getTime()))
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const daysByActor = new Map<string, Set<string>>();
  for (const event of valid) {
    const days = daysByActor.get(event.actorId) ?? new Set<string>();
    days.add(kstDay(event.createdAt));
    daysByActor.set(event.actorId, days);
  }

  const windowEvents = valid.filter((event) => {
    const time = event.createdAt.getTime();
    return time >= windowStart && time < windowEnd;
  });
  const activeActors = new Set(windowEvents.map((event) => event.actorId));

  const sessions: Array<{ actorId: string; hasDepth: boolean; swipes: number }> = [];
  const lastSessionByActor = new Map<string, { lastAt: number; index: number }>();
  for (const event of windowEvents) {
    const time = event.createdAt.getTime();
    const previous = lastSessionByActor.get(event.actorId);
    let index: number;
    if (!previous || time - previous.lastAt > SESSION_GAP_MS) {
      index = sessions.length;
      sessions.push({ actorId: event.actorId, hasDepth: false, swipes: 0 });
    } else {
      index = previous.index;
    }
    const session = sessions[index]!;
    if (event.signal === "VIEW_DEPTH") session.hasDepth = true;
    if (event.signal === "MORE" || event.signal === "LESS") session.swipes += 1;
    lastSessionByActor.set(event.actorId, { lastAt: time, index });
  }

  function retention(offsetDays: number): RateMetric {
    let denominator = 0;
    let numerator = 0;
    for (const [actorId, days] of daysByActor) {
      const firstDay = [...days].sort()[0];
      if (!firstDay) continue;
      const firstStart = startOfKstDay(firstDay);
      if (firstStart < windowStart || firstStart + offsetDays * DAY_MS >= windowEnd) continue;
      denominator += 1;
      const returnDay = kstDay(new Date(firstStart + offsetDays * DAY_MS));
      if (daysByActor.get(actorId)?.has(returnDay)) numerator += 1;
    }
    return rate(numerator, denominator);
  }

  const swipes = sessions.reduce((sum, session) => sum + session.swipes, 0);
  const depthViews = windowEvents.filter((event) => event.signal === "VIEW_DEPTH").length;
  const sessionsWithDepth = sessions.filter((session) => session.hasDepth).length;

  return {
    asOf,
    activeActors30d: activeActors.size,
    engagedSessions30d: sessions.length,
    swipes30d: swipes,
    depthViews30d: depthViews,
    swipesPerSession: sessions.length > 0 ? round(swipes / sessions.length) : null,
    sessionsWithDepthRate: rate(sessionsWithDepth, sessions.length),
    d1EngagedRetention: retention(1),
    d7EngagedRetention: retention(7),
  };
}
