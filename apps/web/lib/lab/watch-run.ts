/**
 * 감시 한 바퀴 · 아침 리포트 (OPS-03) — DB 를 읽고 쓰는 쪽. 판정은 `watch.ts` 의 순수 함수가 한다.
 *
 * 부르는 곳: Supabase `pg_cron` → `/api/lab/cron/watch`(5분) · `/api/lab/cron/morning`(07:30 KST).
 * **멱등이다** — 알림은 상태가 바뀔 때만 · 아침 리포트는 하루 한 번만 나간다. 누가 몇 번 불러도 같다.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { bitgetPrices, equityOf } from "./equity";
import { readSnapshot } from "./snapshot";
import { notify } from "./telegram";
import {
  CHECKS,
  COVERAGE_TRACKS,
  dayCoverage,
  evaluate,
  kstDay,
  kstDayRange,
  measured03,
  MEASURED_SOURCE,
  slotOf,
  slotsNow,
  transitions,
  type AlertState,
  type CoverageTrack,
  type DayCoverage,
  type HeartbeatPayload,
} from "./watch";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export async function readHeartbeat(): Promise<{ at: Date; payload: HeartbeatPayload } | null> {
  const row = await prisma.labHeartbeat.findUnique({ where: { key: "runner" } });
  return row ? { at: row.at, payload: row.payload as unknown as HeartbeatPayload } : null;
}

export async function runWatch(now: Date = new Date()) {
  const [heartbeat, upload, alertRows] = await Promise.all([
    readHeartbeat(),
    prisma.fceUpload.findFirst({ where: { ok: true }, orderBy: { at: "desc" }, select: { at: true } }),
    prisma.labAlert.findMany(),
  ]);
  const results = evaluate(now, heartbeat, upload?.at ?? null);
  const prev = new Map<string, AlertState>(
    alertRows.map((a) => [a.key, { key: a.key, status: a.status as AlertState["status"], since: a.since }])
  );
  const { notices, next } = transitions(results, prev, now);

  // 상태를 먼저 적는다 — 보내기가 실패해도 다음 바퀴에 같은 알림을 또 만들지 않게. 못 보낸 건 LabNotice 에 남는다.
  for (const s of next) {
    await prisma.labAlert.upsert({
      where: { key: s.key },
      create: { key: s.key, status: s.status, since: s.since, checkedAt: now },
      update: { status: s.status, since: s.since, checkedAt: now },
    });
  }
  const sent = [];
  for (const n of notices) sent.push({ ...n, ...(await notify(n.kind, n.key, n.text)) });

  // 유효일 칸 — 한 칸에 여러 번 불려도 한 번이라도 살아 있었으면 산 칸이다.
  const slots = slotsNow(now, heartbeat);
  if (slots.length > 0) {
    await prisma.$executeRaw`
      INSERT INTO "LabTickSlot" ("track", "slot", "live")
      VALUES ${Prisma.join(slots.map((s) => Prisma.sql`(${s.track}, ${s.slot}, ${s.live})`))}
      ON CONFLICT ("track", "slot") DO UPDATE SET "live" = "LabTickSlot"."live" OR EXCLUDED."live"
    `;
  }

  const equity = await recordEquity(slotOf(now));

  // 연구 03 — 한 시간에 한 번(정시 칸). md 를 다시 심어도(lab-research) 한 시간 안에 돌아온다.
  const research03 = slotOf(now).getUTCMinutes() === 0 ? await refreshResearch03(now) : null;

  // 보관 — 칸 120일 · 평가 점 180일 · 알림 기록 90일.
  await Promise.all([
    prisma.labTickSlot.deleteMany({ where: { slot: { lt: new Date(now.getTime() - 120 * DAY) } } }),
    prisma.labEquityPoint.deleteMany({ where: { at: { lt: new Date(now.getTime() - 180 * DAY) } } }),
    prisma.labNotice.deleteMany({ where: { at: { lt: new Date(now.getTime() - 90 * DAY) } } }),
  ]);

  return {
    at: now.toISOString(),
    heartbeatAt: heartbeat?.at.toISOString() ?? null,
    checks: results.map((r) => ({ key: r.key, ok: r.ok, lastAt: r.lastAt?.toISOString() ?? null, reason: r.reason })),
    notices: sent.map((n) => ({ key: n.key, kind: n.kind, sent: n.sent, error: n.error })),
    slots: slots.map((s) => ({ track: s.track, live: s.live })),
    equity,
    research03,
  };
}

/** 연구 03 에 맥 밖 측정 줄을 갱신한다 — 같은 출처의 줄은 바꿔 끼운다(쌓지 않는다). */
export async function refreshResearch03(now: Date = new Date()) {
  const from = await watchStart();
  const row = await prisma.research.findUnique({ where: { no: "03" }, select: { findings: true, evidence: true } });
  if (!from || !row) return null;
  const dayList: string[] = [];
  for (let t = kstDayRange(kstDay(from)).from.getTime(); t < kstDayRange(kstDay(now)).from.getTime(); t += DAY) dayList.push(kstDay(new Date(t)));
  const recent = dayList.slice(-30);
  const m = measured03(await coverageOfDays(recent), recent);
  type F = { source?: string };
  const findings = [...((row.findings as F[] | null) ?? []).filter((f) => f.source !== MEASURED_SOURCE), m.finding];
  const evidence = [...((row.evidence as { source?: string }[] | null) ?? []).filter((e) => e.source !== "LabTickSlot"), m.evidence];
  await prisma.research.update({
    where: { no: "03" },
    data: { findings: findings as unknown as Prisma.InputJsonValue, evidence: evidence as unknown as Prisma.InputJsonValue },
  });
  return { days: recent.length, streak: m.streak, text: m.finding.text };
}

/** 지금 평가 자산 — 실현(FCE) + 미실현(FCE 값 + 그 뒤 가격 움직임). */
export async function currentEquity() {
  const [tracks, positions] = await Promise.all([
    prisma.fceTrack.findMany({ select: { key: true, startingCapital: true, currentCapital: true, unrealized: true } }),
    prisma.fcePosition.findMany({
      select: { trackKey: true, symbol: true, direction: true, quantity: true, markPrice: true, unrealizedUsdt: true },
    }),
  ]);
  const prices = positions.length > 0 ? await bitgetPrices() : new Map<string, number>();
  return equityOf(
    tracks.map((t) => ({
      key: t.key,
      startingCapital: Number(t.startingCapital),
      currentCapital: t.currentCapital === null ? null : Number(t.currentCapital),
      unrealized: t.unrealized === null ? null : Number(t.unrealized),
    })),
    positions,
    prices
  );
}

async function recordEquity(at: Date) {
  const equity = await currentEquity();
  if (equity.tracks.length === 0) return null;
  const data = {
    realized: equity.realized,
    marked: equity.marked,
    tracks: equity.tracks as unknown as Prisma.InputJsonValue,
  };
  await prisma.labEquityPoint.upsert({ where: { at }, create: { at, ...data }, update: data });
  return { realized: equity.realized, marked: equity.marked };
}

// ── 유효일 ────────────────────────────────────────────────────────────────

/** 감시가 처음 칸을 적은 시각 — 그 전은 잴 수 없었다. */
export async function watchStart(): Promise<Date | null> {
  const first = await prisma.labTickSlot.findFirst({ orderBy: { slot: "asc" }, select: { slot: true } });
  return first?.slot ?? null;
}

export async function coverageOfDays(days: string[], now: Date = new Date()): Promise<DayCoverage[]> {
  const from = await watchStart();
  if (!from || days.length === 0) return [];
  const ranges = days.map(kstDayRange);
  const min = new Date(Math.min(...ranges.map((r) => r.from.getTime())));
  const max = new Date(Math.max(...ranges.map((r) => r.to.getTime())));
  const rows = await prisma.labTickSlot.findMany({ where: { slot: { gte: min, lt: max }, live: true }, select: { track: true, slot: true } });
  const out: DayCoverage[] = [];
  for (const day of days) {
    const r = kstDayRange(day);
    for (const track of COVERAGE_TRACKS) {
      const live = rows.filter((x) => x.track === track && x.slot >= r.from && x.slot < r.to).length;
      out.push(dayCoverage(track as CoverageTrack, day, live, from, now));
    }
  }
  return out;
}

// ── 아침 리포트 (PART B) ──────────────────────────────────────────────────

const TRACK_SHORT: Record<CoverageTrack, string> = { crypto: "크립토", whale: "고래", stock_kr: "KR", stock_us: "US" };

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const signedUsd = (v: number) => `${v >= 0 ? "+" : "−"}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const signedPct = (v: number, digits = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
const side = (d: string) => (d === "short" || d === "SHORT" ? "숏" : "롱");

export async function buildMorning(now: Date = new Date()): Promise<string> {
  const since = new Date(now.getTime() - DAY);
  const yesterday = kstDay(since);
  const [coverage, points, closed, opened, openPositions, tracks, alerts, research] = await Promise.all([
    coverageOfDays([yesterday]),
    prisma.labEquityPoint.findMany({ where: { at: { gte: new Date(since.getTime() - HOUR) } }, orderBy: { at: "asc" } }),
    prisma.fceTrade.findMany({ where: { exitAt: { gte: since, lte: now } } }),
    prisma.fceTrade.count({ where: { entryAt: { gte: since, lte: now } } }),
    prisma.fcePosition.count({ where: { entryAt: { gte: since, lte: now } } }),
    prisma.fceTrack.findMany({ select: { key: true, label: true, status: true, statusReason: true } }),
    prisma.labAlert.findMany({ where: { status: "firing" } }),
    prisma.research.findMany({ where: { status: { not: "closed" } }, orderBy: { updatedAt: "desc" }, take: 3 }),
  ]);
  const label = new Map(tracks.map((t) => [t.key, t.label]));
  const kstDate = new Date(now.getTime() + 9 * HOUR);
  const lines: string[] = [`☀️ ${kstDate.getUTCMonth() + 1}월 ${kstDate.getUTCDate()}일 아침`, ""];

  // 어제 유효일
  const cov = COVERAGE_TRACKS.map((t) => {
    const c = coverage.find((x) => x.track === t);
    if (!c || c.pct === null) return `${TRACK_SHORT[t]} —`;
    return `${c.valid ? "✅" : "⚠️"} ${TRACK_SHORT[t]} ${Math.floor(c.pct)}%`;
  });
  lines.push(`어제 유효일  ${cov.join(" · ")}`, "");

  // 자산 — 실현 기준(Hero 와 같다) 24시간 전 → 지금 · 평가 한 줄.
  // 평가 점이 24시간을 못 덮으면(감시 첫날) 24시간 전 값은 Overview 실현 곡선에서 — 같은 환산이다.
  const last = points[points.length - 1] ?? null;
  let from = points[0] && points[0].at.getTime() <= since.getTime() + HOUR ? points[0].realized : null;
  if (from === null) {
    const overview = await readSnapshot<{ series: { points: { at: string; value: number }[] } }>("overview");
    const series = overview && overview !== "outdated" ? overview.payload.series.points : [];
    from = [...series].reverse().find((p) => Date.parse(p.at) <= since.getTime())?.value ?? null;
  }
  lines.push("자산 (트랙당 $10,000 환산)");
  if (from !== null && last) {
    const d = last.realized - from;
    lines.push(`  ${usd(from)} → ${usd(last.realized)}   ${signedUsd(d)} (${signedPct((d / from) * 100)})`);
    lines.push(`  지금 평가 ${usd(last.marked)} (미실현 ${signedUsd(last.marked - last.realized)})`);
  } else {
    lines.push("  평가 점이 아직 없다 — 감시가 막 시작됐다");
  }
  lines.push("");

  // 밤사이
  const wins = closed.filter((t) => (t.netPnlUsdt ?? 0) > 0).length;
  lines.push("밤사이", `  진입 ${opened + openPositions} · 청산 ${closed.length} · 승 ${wins}`);
  const best = [...closed].sort((a, b) => Math.abs(b.netReturnPct ?? 0) - Math.abs(a.netReturnPct ?? 0))[0];
  if (best && best.netReturnPct !== null) {
    lines.push(`  ${label.get(best.trackKey) ?? best.trackKey} ${best.symbol} ${side(best.direction)} 청산 ${signedPct(best.netReturnPct, 1)}`);
  }
  lines.push("");

  // 멈춘 것 — 지금 울리는 알림 + 정지 트랙(폴리마켓 제외는 늘 그렇다 — 빼고)
  const stopped = [
    ...alerts.map((a) => CHECKS[a.key as keyof typeof CHECKS]?.label ?? a.key),
    ...tracks.filter((t) => t.status === "stopped").map((t) => `${t.label} 정지${t.statusReason ? ` · ${t.statusReason}` : ""}`),
  ];
  lines.push(`멈춘 것  ${stopped.length ? stopped.join(" · ") : "없음"}`, "");

  if (research.length > 0) {
    lines.push("연구");
    for (const r of research) lines.push(`  ${r.no} ${r.title.length > 22 ? `${r.title.slice(0, 21)}…` : r.title} — ${r.summary}`);
  }
  return lines.join("\n").trim();
}

export async function runMorning(now: Date = new Date(), force = false) {
  const day = kstDay(now);
  const done = await prisma.labNotice.findFirst({ where: { kind: "morning", key: day, sent: true } });
  if (done && !force) return { day, skipped: "이미 보냈다" };
  const text = await buildMorning(now);
  const result = await notify("morning", day, text);
  return { day, ...result, text };
}
