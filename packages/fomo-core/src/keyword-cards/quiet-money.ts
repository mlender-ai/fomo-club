export type QuietMoneyActor = "insider" | "institution" | "foreign" | "whale";
export type QuietMoneyDirection = "inflow" | "outflow";
export type QuietMoneyAmountUnit = "KRW" | "USD" | "shares" | "coins";

export interface QuietMoneyEvent {
  date: string;
  actor: QuietMoneyActor;
  direction: QuietMoneyDirection;
  source: string;
  label: string;
  amount?: number;
  amountUnit?: QuietMoneyAmountUnit;
  priceAt?: number;
  streakDays?: number;
  /** 시총 대비 비율을 실데이터로 계산할 수 있을 때만 채운다. */
  marketCapRatioPct?: number;
  sourceUrl?: string;
}

export interface QuietMoneyCluster {
  type: "cluster_multi";
  windowTradingDays: number;
  actors: QuietMoneyActor[];
  actorCount: number;
  startDate: string;
  endDate: string;
  strength: 1 | 2 | 3 | 4 | 5;
  headline: string;
  evidence: string[];
}

export interface QuietMoneyTimeline {
  asOf: string;
  events: QuietMoneyEvent[];
  cluster?: QuietMoneyCluster;
}

export interface BuildQuietMoneyTimelineInput {
  asOf: string;
  events: readonly QuietMoneyEvent[];
  /** 실제 거래일 목록. 없으면 달력 14일을 10거래일의 보수적 근사로 사용한다. */
  tradingDates?: readonly string[];
  windowTradingDays?: number;
}

const ACTOR_ORDER: readonly QuietMoneyActor[] = ["insider", "institution", "foreign", "whale"];
const ACTOR_LABEL: Record<QuietMoneyActor, string> = {
  insider: "내부자",
  institution: "기관",
  foreign: "외국인",
  whale: "고래",
};

export function normalizeQuietMoneyDate(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length !== 8) return undefined;
  const normalized = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return Number.isFinite(Date.parse(`${normalized}T00:00:00Z`)) ? normalized : undefined;
}

function validDate(value: string): boolean {
  return normalizeQuietMoneyDate(value) !== undefined;
}

function clampStrength(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

function recentCutoff(asOf: string, tradingDates: readonly string[] | undefined, window: number): string {
  const dates = [...new Set((tradingDates ?? []).flatMap((date) => normalizeQuietMoneyDate(date) ?? []))].sort();
  const eligible = dates.filter((date) => date <= asOf);
  if (eligible.length > 0) return eligible[Math.max(0, eligible.length - window)]!;
  const cutoff = new Date(`${asOf}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.ceil(window * 1.4));
  return cutoff.toISOString().slice(0, 10);
}

function eventKey(event: QuietMoneyEvent): string {
  return [event.date, event.actor, event.direction, event.amount ?? "", event.label, event.source].join("|");
}

function actorLabels(actors: readonly QuietMoneyActor[]): string {
  return actors.map((actor) => ACTOR_LABEL[actor]).join("·");
}

/** 실데이터가 있는 축만 사용한다. 규모 비율이 없으면 주체 수·지속일만으로 보수적으로 등급화한다. */
export function quietMoneyStrength(events: readonly QuietMoneyEvent[], actorCount: number): 1 | 2 | 3 | 4 | 5 {
  const maxStreak = Math.max(1, ...events.map((event) => event.streakDays ?? 1));
  const maxMarketCapRatio = Math.max(0, ...events.map((event) => event.marketCapRatioPct ?? 0));
  const actorComponent = actorCount;
  const persistenceComponent = Math.min(1.25, Math.max(0, maxStreak - 1) / 4);
  const sizeComponent = Math.min(1.25, maxMarketCapRatio / 0.5);
  return clampStrength(actorComponent + persistenceComponent + sizeComponent);
}

export function buildQuietMoneyTimeline(input: BuildQuietMoneyTimelineInput): QuietMoneyTimeline {
  const window = Math.max(2, Math.floor(input.windowTradingDays ?? 10));
  const seen = new Set<string>();
  const normalizedAsOf = normalizeQuietMoneyDate(input.asOf) ?? input.asOf;
  const events = input.events
    .flatMap((event) => {
      const date = normalizeQuietMoneyDate(event.date);
      return date ? [{ ...event, date }] : [];
    })
    .filter((event) => validDate(normalizedAsOf) && event.date <= normalizedAsOf)
    .filter((event) => {
      const key = eventKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || ACTOR_ORDER.indexOf(a.actor) - ACTOR_ORDER.indexOf(b.actor));

  const cutoff = recentCutoff(normalizedAsOf, input.tradingDates, window);
  const recentInflows = events.filter((event) => event.direction === "inflow" && event.date >= cutoff);
  const actors = ACTOR_ORDER.filter((actor) => recentInflows.some((event) => event.actor === actor));
  if (actors.length < 2) return { asOf: normalizedAsOf, events };

  const strength = quietMoneyStrength(recentInflows, actors.length);
  const startDate = recentInflows.reduce((min, event) => (event.date < min ? event.date : min), recentInflows[0]!.date);
  const endDate = recentInflows.reduce((max, event) => (event.date > max ? event.date : max), recentInflows[0]!.date);
  const evidence = actors.map((actor) => {
    const actorEvents = recentInflows.filter((event) => event.actor === actor);
    const streak = Math.max(...actorEvents.map((event) => event.streakDays ?? 1));
    return `${ACTOR_LABEL[actor]} ${streak > 1 ? `${streak}일 지속` : actorEvents[0]!.label}`;
  });
  const cluster: QuietMoneyCluster = {
    type: "cluster_multi",
    windowTradingDays: window,
    actors,
    actorCount: actors.length,
    startDate,
    endDate,
    strength,
    headline: `${actorLabels(actors)} 동시 유입 · ${window}거래일 내 ${actors.length}개 주체`,
    evidence,
  };
  return { asOf: normalizedAsOf, events, cluster };
}

export function quietMoneyActorLabel(actor: QuietMoneyActor): string {
  return ACTOR_LABEL[actor];
}
