/**
 * 자체 연구 루프 — DB 쪽 (ENG-02). 규칙과 판정은 `experiments.ts` 의 순수 함수가 한다.
 *
 * | 무엇 | 언제 · 누가 |
 * |---|---|
 * | 관측 → 가설 → 등록 | 매일 07:30 KST (`pg_cron` 아침 리포트와 같은 호출) |
 * | 재판정 거르기 결과 · 그림자 거래 · 정책 값 | 러너 `experiments` 잡(15분) → `POST /api/lab/experiments/sync` |
 * | 판정 · 연구 노트 · 알림 | sync 가 올 때마다 |
 * | 승인 · 기각 | 텔레그램 `/approve N` · `/reject N 사유` → FCE 가 기록 → 러너 → `POST /api/lab/experiments/decision` |
 * | 새 정책 버전 | 러너가 `params/crypto-vN.json` 을 쓰고 → `POST /api/lab/experiments/applied` |
 *
 * **본 트랙을 바꾸는 길은 `decision(approve)` 하나다.** 그리고 그것은 `awaiting`(통과 · 승인 대기)에서만 열린다.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { notify } from "./telegram";
import {
  DEFAULT_CRITERIA,
  PARAMS,
  REPORT_ONLY,
  SHADOW_STATES,
  criteriaFingerprint,
  cumulativeTries,
  hypothesesFrom,
  judge,
  noteFrom,
  registrationProblem,
  type Criteria,
  type ExperimentRow,
  type ExperimentStatus,
  type Judgment,
  type Observations,
  type ParamKey,
  type TradeRow,
} from "./experiments";

const INPUT_KEY = "research-input";

export interface ResearchInput {
  at: string;
  policy: Observations["policy"];
  entryCostR: number[];
}

async function input(): Promise<ResearchInput | null> {
  const row = await prisma.labHeartbeat.findUnique({ where: { key: INPUT_KEY } });
  return row ? (row.payload as unknown as ResearchInput) : null;
}

/** 관측 — 랩이 가진 것(복기 · 비용)과 러너가 올린 FCE 정책 값 · 최근 진입 비용R. */
export async function observe(): Promise<Observations | null> {
  const [inp, trades, crypto, journal] = await Promise.all([
    input(),
    prisma.fceTrade.findMany({ where: { trackKey: "crypto", exitAt: { not: null } }, select: { grossPnlUsdt: true, costsUsdt: true } }),
    prisma.fceTrack.findUnique({ where: { key: "crypto" }, select: { startingCapital: true } }),
    prisma.labSnapshot.findUnique({ where: { key: "journal" } }),
  ]);
  if (!inp) return null;
  // 비용 비중 = 비용 합 ÷ **비용 전 총손익의 크기**(|Σ gross|) — 지시서의 "비용이 총손익의 85%" 와 같은 정의.
  // 처음엔 거래별 |gross| 합으로 나눠 8.6% 가 나왔다 — 그건 "거래 하나가 흔들리는 폭" 대비라 다른 질문이다.
  const gross = Math.abs(trades.reduce((s, t) => s + (t.grossPnlUsdt ?? 0), 0));
  const costs = trades.reduce((s, t) => s + Math.abs(t.costsUsdt ?? 0), 0);
  const quality = ((journal?.payload as { payload?: { quality?: { stopRebound?: { n: number; of: number; pct: number } } } } | null)?.payload?.quality ?? null);
  return {
    costShare: gross > 0 ? { pct: (costs / gross) * 100, trades: trades.length } : null,
    stopRebound: quality?.stopRebound ? { pct: quality.stopRebound.pct, of: quality.stopRebound.of } : null,
    entryCostR: inp.entryCostR,
    policy: inp.policy,
    cryptoCapital: crypto ? Number(crypto.startingCapital) : null,
  };
}

function toRow(e: { number: number; key: string; param: string; baseline: unknown; value: unknown; status: string; startedAt: Date | null }): ExperimentRow {
  return { number: e.number, key: e.key, param: e.param, baseline: e.baseline, value: e.value, status: e.status as ExperimentStatus, startedAt: e.startedAt?.toISOString() ?? null };
}

/** 매일 — 관측 → 가설 → 규칙을 지키는 것만 등록(재판정 거르기 대기 `filtering`). */
export async function runResearchLoop(now: Date = new Date()) {
  const obs = await observe();
  if (!obs) return { observed: false, reason: "러너가 FCE 정책 값을 아직 안 올렸다", registered: [] };
  const hyps = hypothesesFrom(obs);
  const rows = (await prisma.labExperiment.findMany()).map(toRow);
  const registered: number[] = [];
  const skipped: { key: string; reason: string }[] = [];
  for (const h of hyps) {
    const problem = registrationProblem(h, rows);
    if (problem) {
      skipped.push({ key: h.key, reason: problem });
      continue;
    }
    const number = Math.max(0, ...rows.map((r) => r.number)) + 1;
    await prisma.labExperiment.create({
      data: {
        number,
        key: h.key,
        param: h.param,
        baseline: h.baseline as Prisma.InputJsonValue,
        value: h.value as Prisma.InputJsonValue,
        track: PARAMS[h.param].track,
        status: "filtering",
        reportOnly: h.reportOnly,
        question: h.question,
        observation: h.observation,
        hypothesis: h.hypothesis,
        criteria: DEFAULT_CRITERIA as unknown as Prisma.InputJsonValue,
      },
    });
    rows.push({ number, key: h.key, param: h.param, baseline: h.baseline, value: h.value, status: "filtering", startedAt: null });
    registered.push(number);
  }
  return { observed: true, observations: obs, hypotheses: hyps.map((h) => h.key), registered, skipped, at: now.toISOString() };
}

// ── sync (러너) ───────────────────────────────────────────────────────────

export interface ShadowTradeWire {
  shadow: number;
  id: string;
  status: string;
  entry_at: string;
  exit_at: string | null;
  net_pnl_usdt: number;
  costs_usdt: number;
  symbol: string;
  direction: string;
  exit_reason: string | null;
}

export interface SyncBody {
  /** 러너가 새로 뜬 뒤 첫 차례에 한 번 — 매일 07:30 을 기다리지 않고 관측 → 가설 → 등록. 규칙이 중복 · 초과를 막는다. */
  runLoop?: boolean;
  inputs?: { policy: ResearchInput["policy"]; entryCostR: number[] } | null;
  /** 재판정 거르기 — `worse` 면 버린다(명백히 나쁨) · 아니면 그림자로. */
  filters?: { number: number; verdict: "worse" | "ok"; detail: unknown }[];
  shadowTrades?: ShadowTradeWire[];
}

const closedRows = (rows: ShadowTradeWire[]): TradeRow[] =>
  rows.filter((t) => t.status === "closed" && t.exit_at).map((t) => ({ exitAt: t.exit_at as string, netPnlUsdt: t.net_pnl_usdt, costsUsdt: t.costs_usdt }));

export async function syncExperiments(body: SyncBody, now: Date = new Date()) {
  if (body.inputs) {
    const payload = { at: now.toISOString(), ...body.inputs } as unknown as Prisma.InputJsonValue;
    await prisma.labHeartbeat.upsert({ where: { key: INPUT_KEY }, create: { key: INPUT_KEY, at: now, payload }, update: { at: now, payload } });
  }

  const loop = body.runLoop ? await runResearchLoop(now) : null;

  // 1 거르기 결과 — 시작하면 그 순간 기준이 잠긴다.
  for (const f of body.filters ?? []) {
    const e = await prisma.labExperiment.findUnique({ where: { number: f.number } });
    if (!e || e.status !== "filtering") continue;
    if (f.verdict === "worse") {
      await prisma.labExperiment.update({ where: { number: e.number }, data: { status: "discarded", filter: f.detail as Prisma.InputJsonValue } });
      continue;
    }
    const startedAt = now.toISOString();
    const criteria = e.criteria as unknown as Criteria;
    await prisma.labExperiment.update({
      where: { number: e.number },
      data: {
        status: "running",
        startedAt: new Date(startedAt),
        fingerprint: criteriaFingerprint({ param: e.param, baseline: e.baseline, value: e.value, startedAt, criteria }),
        filter: f.detail as Prisma.InputJsonValue,
      },
    });
  }

  // 2 그림자 거래 — 그림자마다 통째로.
  const byShadow = new Map<number, ShadowTradeWire[]>();
  for (const t of body.shadowTrades ?? []) byShadow.set(t.shadow, [...(byShadow.get(t.shadow) ?? []), t]);
  for (const [number, rows] of byShadow) {
    await prisma.labExperiment.updateMany({ where: { number }, data: { shadowTrades: rows as unknown as Prisma.InputJsonValue } });
  }

  // 3 판정 — 잠긴 기준으로만.
  const all = await prisma.labExperiment.findMany({ orderBy: { number: "asc" } });
  const tries = cumulativeTries(all.map(toRow));
  const decided: { number: number; state: Judgment["state"] }[] = [];
  for (const e of all.filter((x) => SHADOW_STATES.has(x.status as ExperimentStatus) && x.startedAt && x.fingerprint)) {
    const j = await judgeOne(e, tries, now);
    const next: Partial<Record<Judgment["state"], ExperimentStatus>> = {
      extend: "extended",
      passed: e.reportOnly ? "reported" : "awaiting",
      failed: "failed",
      inconclusive: "inconclusive",
      invalid: "invalid",
    };
    const status = next[j.state];
    await prisma.labExperiment.update({
      where: { number: e.number },
      data: {
        judgment: j as unknown as Prisma.InputJsonValue,
        ...(status ? { status, ...(j.state === "extend" ? { extended: true } : { judgedAt: now }) } : {}),
      },
    });
    if (status && j.state !== "extend") {
      const noteNo = await writeNote(e, j, now);
      decided.push({ number: e.number, state: j.state });
      await notify(
        "experiment",
        String(e.number),
        `🧪 그림자 #${String(e.number).padStart(2, "0")} ${j.state === "passed" ? (e.reportOnly ? "통과 — 자본 결정은 광혁" : "통과 — 승인 대기") : j.state === "failed" ? "실패 — 없음" : "판단 불가"}\n${e.question}\n우연 확률 ${j.familyP === null ? "—" : `${Math.round(j.familyP * 100)}%`} (누적 시도 ${j.tries}) · 연구 ${noteNo}${j.state === "passed" && !e.reportOnly ? `\n→ /approve ${e.number} · /reject ${e.number} 사유` : ""}`
      );
    }
  }

  const fresh = await prisma.labExperiment.findMany({ orderBy: { number: "asc" } });
  return {
    loop,
    tries: cumulativeTries(fresh.map(toRow)),
    decided,
    active: fresh
      .filter((e) => SHADOW_STATES.has(e.status as ExperimentStatus))
      .map((e) => ({ number: e.number, param: e.param, value: e.value, baseline: e.baseline, startedAt: e.startedAt?.toISOString() ?? null, fingerprint: e.fingerprint })),
    filtering: fresh.filter((e) => e.status === "filtering").map((e) => ({ number: e.number, param: e.param, baseline: e.baseline, value: e.value })),
    /** 승인됐는데 아직 새 버전이 안 쓰인 것 — 러너가 쓴다. */
    toApply: fresh.filter((e) => e.status === "approved" && !e.appliedVersion).map((e) => ({ number: e.number, param: e.param, value: e.value, baseline: e.baseline, question: e.question })),
  };
}

async function judgeOne(
  e: { number: number; param: string; baseline: unknown; value: unknown; startedAt: Date | null; fingerprint: string | null; criteria: unknown; extended: boolean; shadowTrades: unknown },
  tries: number,
  now: Date
): Promise<Judgment> {
  const startedAt = (e.startedAt as Date).toISOString();
  const criteria = e.criteria as Criteria;
  // 본 트랙 — 같은 기간(그림자 시작 뒤 진입)의 크립토 거래. 그림자도 빈손에서 시작하므로.
  const [main, track] = await Promise.all([
    prisma.fceTrade.findMany({ where: { trackKey: "crypto", entryAt: { gte: e.startedAt as Date }, exitAt: { not: null } }, select: { exitAt: true, netPnlUsdt: true, costsUsdt: true } }),
    prisma.fceTrack.findUnique({ where: { key: "crypto" }, select: { startingCapital: true } }),
  ]);
  return judge({
    criteria,
    fingerprint: e.fingerprint as string,
    expectedFingerprint: criteriaFingerprint({ param: e.param, baseline: e.baseline, value: e.value, startedAt, criteria }),
    startedAt,
    now,
    extended: e.extended,
    capital: track ? Number(track.startingCapital) : 500,
    main: main.map((t) => ({ exitAt: (t.exitAt as Date).toISOString(), netPnlUsdt: t.netPnlUsdt ?? 0, costsUsdt: t.costsUsdt ?? 0 })),
    shadow: closedRows((e.shadowTrades as ShadowTradeWire[] | null) ?? []),
    tries,
  });
}

/** 판정 노트 — 연구 탭에 한 장. 번호는 연구 노트 번호의 다음(사람 노트 01~07 뒤로). */
async function writeNote(
  e: { number: number; question: string; observation: string; hypothesis: string; param: string; baseline: unknown; value: unknown; startedAt: Date | null; reportOnly: boolean; noteNo: string | null },
  j: Judgment,
  now: Date
): Promise<string> {
  const note = noteFrom(
    { number: e.number, question: e.question, observation: e.observation, hypothesis: e.hypothesis, param: e.param, baseline: e.baseline, value: e.value, startedAt: (e.startedAt as Date).toISOString(), reportOnly: e.reportOnly },
    j
  );
  let no = e.noteNo;
  if (!no) {
    const existing = await prisma.research.findMany({ select: { no: true } });
    const max = Math.max(0, ...existing.map((r) => Number.parseInt(r.no, 10)).filter(Number.isFinite));
    no = String(max + 1).padStart(2, "0");
  }
  const data = {
    title: note.title,
    status: note.status,
    verdict: note.verdict,
    summary: note.summary,
    why: note.why,
    hypothesis: note.hypothesis,
    hypotheses: [note.hypothesis] as unknown as Prisma.InputJsonValue,
    method: note.method,
    methods: [note.method] as unknown as Prisma.InputJsonValue,
    findings: note.findings as unknown as Prisma.InputJsonValue,
    evidence: note.evidence as unknown as Prisma.InputJsonValue,
    decision: note.decision,
    related: [
      { label: "실험", value: `그림자 #${String(e.number).padStart(2, "0")}` },
      { label: "트랙", value: "크립토" },
    ] as unknown as Prisma.InputJsonValue,
    trackKeys: ["crypto"] as unknown as Prisma.InputJsonValue,
    openedAt: e.startedAt as Date,
    closedAt: note.status === "closed" ? now : null,
  };
  await prisma.research.upsert({ where: { no }, create: { no, ...data }, update: data });
  await prisma.labExperiment.update({ where: { number: e.number }, data: { noteNo: no } });
  return no;
}

// ── 승인 (F) ──────────────────────────────────────────────────────────────

/**
 * 승인 · 기각. **승인은 `awaiting`(통과)에서만** — 판정 전 · 실패 · 자본(보고만)은 승인할 수 없다(F-1).
 * 승인해도 여기서 본 트랙을 바꾸지 않는다 — 러너가 새 정책 버전을 쓰고 `applied` 로 알린다.
 */
export async function decideExperiment(number: number, action: "approve" | "reject", reason: string, now: Date = new Date()) {
  const e = await prisma.labExperiment.findUnique({ where: { number } });
  if (!e) return { ok: false, reason: `그림자 #${number} 없음` };
  if (action === "approve") {
    if (e.reportOnly || REPORT_ONLY.has(e.param as ParamKey)) return { ok: false, reason: "자본 설정은 승인으로 반영하지 않는다 — 광혁 결정" };
    if (e.status !== "awaiting") return { ok: false, reason: `승인 대기가 아니다 — 지금 ${e.status}` };
    await prisma.labExperiment.update({ where: { number }, data: { status: "approved", decidedAt: now, decisionNote: reason || "승인" } });
    if (e.noteNo) {
      await prisma.research.update({
        where: { no: e.noteNo },
        data: { status: "closed", verdict: "yes", closedAt: now, summary: "승인 — 새 정책 버전", decision: `**승인했다(${now.toISOString().slice(0, 10)}).** 새 정책 버전으로 반영 — 옛 버전은 파일로 남는다.` },
      });
    }
    return { ok: true, apply: { param: e.param, value: e.value, baseline: e.baseline } };
  }
  if (!["awaiting", "reported"].includes(e.status)) return { ok: false, reason: `기각할 수 있는 상태가 아니다 — 지금 ${e.status}` };
  await prisma.labExperiment.update({ where: { number }, data: { status: "rejected", decidedAt: now, decisionNote: reason || "사유 없음" } });
  if (e.noteNo) {
    await prisma.research.update({
      where: { no: e.noteNo },
      data: { status: "closed", verdict: "no", closedAt: now, summary: "기각", decision: `**기각했다.** ${reason || "사유 없음"}` },
    });
  }
  return { ok: true };
}

export async function markApplied(number: number, version: string, at: Date) {
  const e = await prisma.labExperiment.findUnique({ where: { number } });
  if (!e || e.status !== "approved" || e.appliedVersion) return { ok: false };
  await prisma.labExperiment.update({ where: { number }, data: { appliedVersion: version, appliedAt: at } });
  return { ok: true };
}

// ── 화면 (H) ──────────────────────────────────────────────────────────────

/**
 * 연구 탭 "실험 중". **판정 전에는 결과 숫자를 싣지 않는다** — 진행(거래 · 일)만. 판정이 나면 노트 번호로 간다.
 * 곡선(본 트랙 · 그림자 누적 손익)은 싣는다 — 모양은 보되 숫자로 흔들리지 않게.
 */
export async function experimentsView() {
  const rows = await prisma.labExperiment.findMany({ orderBy: { number: "desc" } });
  const tries = cumulativeTries(rows.map(toRow));
  const main = await prisma.fceTrade.findMany({ where: { trackKey: "crypto", exitAt: { not: null } }, select: { entryAt: true, exitAt: true, netPnlUsdt: true } });
  return {
    tries,
    limit: 3,
    items: rows.map((e) => {
      const j = (e.judgment as unknown as Judgment | null) ?? null;
      const decided = !["filtering", "running", "extended"].includes(e.status);
      const shadow = closedRows((e.shadowTrades as ShadowTradeWire[] | null) ?? []);
      const start = e.startedAt?.getTime() ?? null;
      const curve = (rows2: { exitAt: string; net: number }[]) => {
        let acc = 0;
        return rows2.sort((a, b) => Date.parse(a.exitAt) - Date.parse(b.exitAt)).map((r) => ({ at: r.exitAt, value: (acc += r.net) }));
      };
      return {
        number: e.number,
        param: e.param,
        label: (PARAMS as Record<string, { label: string }>)[e.param]?.label ?? e.param,
        baseline: e.baseline,
        value: e.value,
        status: e.status,
        reportOnly: e.reportOnly,
        question: e.question,
        startedAt: e.startedAt?.toISOString() ?? null,
        days: start === null ? 0 : Math.floor((Date.now() - start) / 86_400_000),
        trades: shadow.length,
        criteria: e.criteria as unknown as Criteria,
        extended: e.extended,
        noteNo: e.noteNo,
        appliedVersion: e.appliedVersion,
        filter: e.filter,
        result: decided && j ? { state: j.state, familyP: j.familyP, tries: j.tries, main: j.main, shadow: j.shadow, reason: j.reason } : null,
        curves:
          start === null
            ? null
            : {
                main: curve(main.filter((t) => t.entryAt && t.entryAt.getTime() >= start).map((t) => ({ exitAt: (t.exitAt as Date).toISOString(), net: t.netPnlUsdt ?? 0 }))),
                shadow: curve(shadow.map((t) => ({ exitAt: t.exitAt, net: t.netPnlUsdt }))),
              },
      };
    }),
  };
}
