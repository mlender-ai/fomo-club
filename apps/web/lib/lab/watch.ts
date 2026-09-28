/**
 * 가동 감시 (OPS-03 PART A · C · E) — 순수 함수.
 *
 * ## 누가 보나 — 맥 밖에서
 *
 * 맥이 죽으면 맥 안의 감시도 같이 죽는다. 그래서 판정은 **Supabase `pg_cron` → 랩 `/api/lab/cron/watch`** 가 5분마다 한다.
 * (Vercel 은 Hobby 라 크론이 하루 1회뿐이고, GitHub Actions 의 5분 스케줄은 실측 몇 시간씩 건너뛴다.)
 *
 * 맥 쪽 러너는 1분마다 **심장박동**을 올린다 — FCE 워커 잡의 마지막 실행 시각 · 주식 트랙 관측 시각.
 * 심장박동이 끊기면 그 자체가 알림이다(맥 · 러너). 그때는 나머지 판정을 하지 않는다 — 원인 하나에 알림 일곱 개가
 * 오면 아무도 안 읽는다.
 *
 * ## 기준 (A-1)
 *
 * | 대상 | 틱 | 기준 |
 * |---|---|---|
 * | 맥 · 러너 | 심장박동(1분) | 10분 |
 * | 러너 업로드 | 성공한 FCE 업로드(15분) | 30분 |
 * | FCE 데몬 | FCE `heartbeat` 잡(60초) | 10분 |
 * | 크립토 | FCE `paper_engine`(90초) | 30분 |
 * | 고래 추종 | FCE `whale_follow_engine`(15분) | 30분 |
 * | 주식 KR · US | 트랙 관측 시각 — **장중에만** | 30분 · 정지면 바로 |
 * | 시세 수집 | FCE `refresh_market_data`(5분) | 10분 · 🟠 |
 */
import { inSession, localDay, sessionOf, type StockMarket } from "./market-hours";

const MINUTE = 60_000;
export const SLOT_MS = 5 * MINUTE;

// ── 심장박동 (러너 → 랩) ───────────────────────────────────────────────────

/** 러너가 올리는 것. FCE 가 준 시각을 그대로 옮긴다 — 랩이 틱을 지어내지 않는다. */
export interface HeartbeatPayload {
  /** 러너가 보낸 시각. */
  at: string;
  fce: {
    reachable: boolean;
    error: string | null;
    /** FCE `/api/system/worker` 의 잡 → 마지막 실제 실행(`last_effective_run_at` 없으면 `last_success_at`). */
    jobs: Record<string, string | null>;
  };
  /** FCE `stock_paper_tracks` (읽기 전용). 못 읽으면 빈 배열. */
  stock: { market: StockMarket; status: string; stopReason: string | null; observedAt: string | null }[];
}

/** 러너가 FCE 에서 고르는 잡. */
export const WATCHED_JOBS = ["heartbeat", "paper_engine", "whale_follow_engine", "refresh_market_data"] as const;

// ── 판정 ─────────────────────────────────────────────────────────────────

export type CheckKey = "host" | "upload" | "fce" | "crypto" | "whale" | "stock_kr" | "stock_us" | "market";

export interface CheckResult {
  key: CheckKey;
  label: string;
  /** true 정상 · false 멈춤 · null 판정 안 함(장외 · 윗단이 멈춤). null 은 상태를 바꾸지 않는다. */
  ok: boolean | null;
  level: "red" | "orange";
  lastAt: Date | null;
  /** 알림 둘째 줄의 뒷부분(예: `러너는 살아 있음`). */
  context: string | null;
  /** 알림 셋째 줄 — 뭘 해 보면 되나. */
  hint: string;
  /** 사유(정지 사유 · 연결 실패 등). */
  reason: string | null;
}

interface CheckDef {
  key: CheckKey;
  label: string;
  limitMin: number;
  level: "red" | "orange";
  hint: string;
}

export const CHECKS: Record<CheckKey, CheckDef> = {
  host: { key: "host", label: "맥 · 러너", limitMin: 10, level: "red", hint: "맥이 켜져 있나 · scripts/ops/check-24h.sh" },
  upload: { key: "upload", label: "러너 업로드", limitMin: 30, level: "red", hint: "tail -50 /tmp/lab-runner.log" },
  fce: { key: "fce", label: "FCE 데몬", limitMin: 10, level: "red", hint: "launchctl list | grep fce · tail -50 ~/fce/logs/backend.log" },
  crypto: { key: "crypto", label: "크립토 트랙", limitMin: 30, level: "red", hint: "FCE 워커 확인: curl -s localhost:8875/api/system/worker" },
  whale: { key: "whale", label: "고래 추종 트랙", limitMin: 30, level: "red", hint: "FCE 워커 확인: curl -s localhost:8875/api/system/worker" },
  stock_kr: { key: "stock_kr", label: "주식 KR 트랙", limitMin: 30, level: "red", hint: "토스 인증: curl -s localhost:8875/api/system/toss/auth-diagnosis" },
  stock_us: { key: "stock_us", label: "주식 US 트랙", limitMin: 30, level: "red", hint: "토스 인증: curl -s localhost:8875/api/system/toss/auth-diagnosis" },
  market: { key: "market", label: "시세 수집", limitMin: 10, level: "orange", hint: "FCE 워커 refresh_market_data 확인" },
};

const JOB_OF: Partial<Record<CheckKey, string>> = {
  fce: "heartbeat",
  crypto: "paper_engine",
  whale: "whale_follow_engine",
  market: "refresh_market_data",
};

const date = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
};
const ageMin = (now: Date, at: Date | null) => (at ? (now.getTime() - at.getTime()) / MINUTE : Infinity);

export function evaluate(
  now: Date,
  heartbeat: { at: Date; payload: HeartbeatPayload } | null,
  lastUploadAt: Date | null
): CheckResult[] {
  const make = (key: CheckKey, ok: boolean | null, lastAt: Date | null, context: string | null = null, reason: string | null = null): CheckResult => ({
    key,
    label: CHECKS[key].label,
    level: CHECKS[key].level,
    hint: CHECKS[key].hint,
    ok,
    lastAt,
    context,
    reason,
  });
  const within = (key: CheckKey, at: Date | null) => ageMin(now, at) <= CHECKS[key].limitMin;

  const hbAt = heartbeat?.at ?? null;
  const hostOk = within("host", hbAt);
  const out: CheckResult[] = [make("host", hostOk, hbAt, null, hbAt ? null : "심장박동을 받은 적이 없다")];
  if (!hostOk || !heartbeat) {
    // 윗단이 멈췄다 — 아래는 모른다. 알림 하나만.
    for (const key of ["upload", "fce", "crypto", "whale", "stock_kr", "stock_us", "market"] as CheckKey[]) out.push(make(key, null, null));
    return out;
  }
  const p = heartbeat.payload;
  out.push(make("upload", within("upload", lastUploadAt), lastUploadAt, "러너는 살아 있음"));

  const fceAt = date(p.fce.jobs.heartbeat);
  const fceOk = p.fce.reachable && within("fce", fceAt);
  out.push(make("fce", fceOk, fceAt, "러너는 살아 있음", p.fce.reachable ? null : p.fce.error ?? "FCE 에 닿지 못했다"));

  for (const key of ["crypto", "whale", "market"] as CheckKey[]) {
    const at = date(p.fce.jobs[JOB_OF[key] as string]);
    out.push(fceOk ? make(key, within(key, at), at, "FCE 는 살아 있음") : make(key, null, at));
  }

  for (const [key, market] of [["stock_kr", "KR"], ["stock_us", "US"]] as [CheckKey, StockMarket][]) {
    const t = p.stock.find((s) => s.market === market) ?? null;
    const at = date(t?.observedAt);
    if (!fceOk || !t) {
      out.push(make(key, null, at));
      continue;
    }
    // **장외에는 판정하지 않는다** — 밤마다 "KR 멈춤" 이 오면 아무도 안 본다.
    if (!inSession(market, now)) {
      out.push(make(key, null, at));
      continue;
    }
    if (t.status === "stopped") {
      out.push(make(key, false, at, "FCE 는 살아 있음", `정지 · ${t.stopReason ?? "사유 없음"}`));
      continue;
    }
    out.push(make(key, within(key, at), at, "FCE 는 살아 있음"));
  }
  return out;
}

// ── 알림 전이 ─────────────────────────────────────────────────────────────

export interface AlertState {
  key: string;
  status: "ok" | "firing";
  since: Date;
}

export interface Notice {
  key: CheckKey;
  kind: "alert" | "recovery";
  text: string;
}

const kst = (at: Date) => new Date(at.getTime() + 9 * 60 * MINUTE).toISOString().slice(11, 16);
const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / MINUTE));
  return m < 120 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
};

/** 🔴 무엇이 · 얼마나 / 마지막 틱 · 무엇은 살아 있나 / → 뭘 해 보나 — 세 줄 (A-3). */
export function alertText(r: CheckResult, now: Date): string {
  const icon = r.level === "red" ? "🔴" : "🟠";
  const age = r.lastAt ? minutes(now.getTime() - r.lastAt.getTime()) : null;
  const head = r.reason?.startsWith("정지") ? `${icon} ${r.label} ${r.reason}` : `${icon} ${r.label} ${age ? `${age}째 멈춤` : "틱 없음"}`;
  const second = [r.lastAt ? `마지막 틱 ${kst(r.lastAt)}` : null, r.reason && !r.reason.startsWith("정지") ? r.reason : null, r.context]
    .filter(Boolean)
    .join(" · ");
  return [head, second || "마지막 틱 없음", `→ ${r.hint}`].join("\n");
}

export function recoveryText(r: CheckResult, since: Date, now: Date): string {
  return `🟢 ${r.label} 복구 · 멈춤 ${minutes(now.getTime() - since.getTime())}`;
}

/**
 * 결과 → 보낼 것 · 새 상태. `ok: null` 은 상태를 건드리지 않는다(장외 · 윗단 멈춤 — 복구로도 멈춤으로도 세지 않는다).
 * 처음 보는 키가 정상이면 조용히 `ok` 로 적는다.
 */
export function transitions(
  results: CheckResult[],
  prev: Map<string, AlertState>,
  now: Date
): { notices: Notice[]; next: AlertState[] } {
  const notices: Notice[] = [];
  const next: AlertState[] = [];
  for (const r of results) {
    if (r.ok === null) continue;
    const before = prev.get(r.key);
    if (r.ok === false && before?.status !== "firing") {
      // 멈춘 시각은 마지막 틱 — 판정한 시각이 아니다. "42분째" 가 맞으려면.
      const since = r.lastAt ?? now;
      notices.push({ key: r.key, kind: "alert", text: alertText(r, now) });
      next.push({ key: r.key, status: "firing", since });
    } else if (r.ok === true && before?.status === "firing") {
      notices.push({ key: r.key, kind: "recovery", text: recoveryText(r, before.since, now) });
      next.push({ key: r.key, status: "ok", since: now });
    } else if (!before) {
      next.push({ key: r.key, status: r.ok ? "ok" : "firing", since: now });
    }
  }
  return { notices, next };
}

// ── 유효일 (PART C) ───────────────────────────────────────────────────────

export type CoverageTrack = "crypto" | "whale" | "stock_kr" | "stock_us";
export const COVERAGE_TRACKS: CoverageTrack[] = ["crypto", "whale", "stock_kr", "stock_us"];
export const VALID_DAY_PCT = 90;

/** 5분 칸 하나를 "틱이 있었다" 로 치는 나이. 트랙 주기의 두 배쯤 — 한 번 늦은 건 봐준다. */
const SLOT_TOLERANCE_MIN: Record<CoverageTrack, number> = { crypto: 10, whale: 30, stock_kr: 10, stock_us: 10 };

export const slotOf = (at: Date) => new Date(Math.floor(at.getTime() / SLOT_MS) * SLOT_MS);

/** 이 칸이 있어야 하는 칸인가 — 크립토 · 고래 24시간, 주식은 정규장만. */
export function expectedAt(track: CoverageTrack, slot: Date): boolean {
  if (track === "crypto" || track === "whale") return true;
  return inSession(track === "stock_kr" ? "KR" : "US", slot);
}

/** 지금 칸의 판정. 있어야 하는 칸만 낸다. */
export function slotsNow(now: Date, heartbeat: { at: Date; payload: HeartbeatPayload } | null): { track: CoverageTrack; slot: Date; live: boolean }[] {
  const slot = slotOf(now);
  const hostOk = heartbeat !== null && ageMin(now, heartbeat.at) <= CHECKS.host.limitMin;
  const p = heartbeat?.payload ?? null;
  const fresh = (track: CoverageTrack, iso: string | null | undefined) => ageMin(now, date(iso)) <= SLOT_TOLERANCE_MIN[track];
  return COVERAGE_TRACKS.filter((t) => expectedAt(t, slot)).map((track) => {
    let live = false;
    if (hostOk && p && p.fce.reachable) {
      if (track === "crypto") live = fresh(track, p.fce.jobs.paper_engine);
      else if (track === "whale") live = fresh(track, p.fce.jobs.whale_follow_engine);
      else {
        const s = p.stock.find((x) => x.market === (track === "stock_kr" ? "KR" : "US"));
        live = !!s && s.status !== "stopped" && fresh(track, s.observedAt);
      }
    }
    return { track, slot, live };
  });
}

/** KST 하루 `YYYY-MM-DD` 의 [시작, 끝) UTC. */
export function kstDayRange(day: string): { from: Date; to: Date } {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const from = new Date(Date.UTC(y, m - 1, d) - 9 * 60 * MINUTE);
  return { from, to: new Date(from.getTime() + 24 * 60 * MINUTE) };
}

export const kstDay = (at: Date) => new Date(at.getTime() + 9 * 60 * MINUTE).toISOString().slice(0, 10);

/** 그날 있어야 했던 칸 수 — 감시가 시작된 뒤(`watchFrom`)만 센다. 그 전은 잴 수 없었다. */
export function expectedSlots(track: CoverageTrack, day: string, watchFrom: Date): number {
  const { from, to } = kstDayRange(day);
  let n = 0;
  const start = Math.max(from.getTime(), slotOf(watchFrom).getTime());
  for (let t = start; t < to.getTime(); t += SLOT_MS) if (expectedAt(track, new Date(t))) n += 1;
  return n;
}

export interface DayCoverage {
  track: CoverageTrack;
  day: string;
  expected: number;
  live: number;
  /** 있어야 할 칸이 없으면(장이 없는 날 · 감시 전) null. */
  pct: number | null;
  valid: boolean | null;
}

export function dayCoverage(track: CoverageTrack, day: string, liveSlots: number, watchFrom: Date): DayCoverage {
  const expected = expectedSlots(track, day, watchFrom);
  const pct = expected > 0 ? Math.min(100, (liveSlots / expected) * 100) : null;
  return { track, day, expected, live: liveSlots, pct, valid: pct === null ? null : pct >= VALID_DAY_PCT };
}

// ── 헤더 점 (PART E) ──────────────────────────────────────────────────────

export type DotLevel = "live" | "off" | "lagging" | "stopped";

export interface TrackDot {
  key: CoverageTrack;
  label: string;
  level: DotLevel;
  lastAt: string | null;
  note: string;
}

const DOT_LABEL: Record<CoverageTrack, string> = { crypto: "크립토", whale: "고래", stock_kr: "주식 KR", stock_us: "주식 US" };

/**
 * 초록 운용중 · 회색 장외 · 주황 지연 · 빨강 멈춤. 알림 기준(30분)을 넘으면 빨강, 칸 기준(주기 × 2)을 넘으면 주황.
 */
export function trackDots(now: Date, heartbeat: { at: Date; payload: HeartbeatPayload } | null): TrackDot[] {
  const hostOk = heartbeat !== null && ageMin(now, heartbeat.at) <= CHECKS.host.limitMin;
  const p = heartbeat?.payload ?? null;
  return COVERAGE_TRACKS.map((key) => {
    const stock = key === "stock_kr" || key === "stock_us" ? p?.stock.find((s) => s.market === (key === "stock_kr" ? "KR" : "US")) ?? null : null;
    const iso = key === "crypto" ? p?.fce.jobs.paper_engine : key === "whale" ? p?.fce.jobs.whale_follow_engine : stock?.observedAt;
    const at = date(iso ?? null);
    const base = { key, label: DOT_LABEL[key], lastAt: at?.toISOString() ?? null };
    if (!hostOk || !p) return { ...base, level: "stopped" as const, note: "맥 · 러너 심장박동 없음" };
    if (!p.fce.reachable) return { ...base, level: "stopped" as const, note: "FCE 에 닿지 못함" };
    if (stock?.status === "stopped") return { ...base, level: "stopped" as const, note: `정지 · ${stock.stopReason ?? "사유 없음"}` };
    const market = key === "stock_kr" ? "KR" : key === "stock_us" ? "US" : null;
    if (market && !inSession(market, now)) {
      const today = sessionOf(market, localDay(market, now));
      return { ...base, level: "off" as const, note: today ? "장외" : "휴장 · 주말" };
    }
    const age = ageMin(now, at);
    const limit = key === "crypto" || key === "whale" ? CHECKS[key].limitMin : CHECKS.stock_kr.limitMin;
    if (age > limit) return { ...base, level: "stopped" as const, note: at ? `${Math.round(age)}분째 틱 없음` : "틱 없음" };
    if (age > SLOT_TOLERANCE_MIN[key]) return { ...base, level: "lagging" as const, note: `${Math.round(age)}분 전 틱` };
    return { ...base, level: "live" as const, note: "운용중" };
  });
}

// ── 연구 03 자동 갱신 (PART C) ─────────────────────────────────────────────

export const CLOSE_STREAK_DAYS = 30;
export const MEASURED_SOURCE = "랩 감시 · 맥 밖 5분 칸 (자동)";

/** 크립토 · 고래(24시간 트랙)가 둘 다 유효한 날이 어제부터 거꾸로 며칠 이어졌나. */
export function validStreak(days: DayCoverage[], dayList: string[]): number {
  let n = 0;
  for (const day of [...dayList].reverse()) {
    const both = (["crypto", "whale"] as CoverageTrack[]).map((t) => days.find((d) => d.day === day && d.track === t));
    if (both.every((d) => d?.valid === true)) n += 1;
    else break;
  }
  return n;
}

/** 연구 03 의 "지금까지 알아낸 것" 한 줄 · 근거 한 줄. `dayList` 는 감시 시작 뒤 ~ 어제(KST). */
export function measured03(days: DayCoverage[], dayList: string[]) {
  const count = (t: CoverageTrack) => {
    const hit = days.filter((d) => d.track === t && d.pct !== null);
    return { valid: hit.filter((d) => d.valid).length, of: hit.length };
  };
  const c = count("crypto");
  const w = count("whale");
  const kr = count("stock_kr");
  const us = count("stock_us");
  const streak = validStreak(days, dayList);
  const text =
    `맥 밖 감시 ${dayList.length}일 — 크립토 유효 ${c.valid}/${c.of} · 고래 ${w.valid}/${w.of} · ` +
    `KR ${kr.valid}/${kr.of} · US ${us.valid}/${us.of} · 연속 ${streak}일`;
  const done = streak >= CLOSE_STREAK_DAYS;
  return {
    streak,
    finding: {
      mark: done ? ("confirmed" as const) : ("pending" as const),
      text,
      note: done ? `${CLOSE_STREAK_DAYS}일 연속 유효 — 닫을 수 있다` : `${CLOSE_STREAK_DAYS}일 연속 유효면 닫는다 — ${CLOSE_STREAK_DAYS - streak}일 남음`,
      source: MEASURED_SOURCE,
    },
    evidence: { label: "맥 밖 감시", value: `연속 유효 ${streak}일 · 크립토 ${c.valid}/${c.of}`, source: "LabTickSlot" },
  };
}
