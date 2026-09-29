/**
 * 자체 연구 루프 — 맥 쪽 (ENG-02). 러너 `experiments` 잡(15분)이 부른다.
 *
 * 1. FCE 정책 값 · 최근 진입 비용R → LAB (가설의 재료 — 값은 이 데이터로 정해진다)
 * 2. 텔레그램 `/approve` · `/reject` 기록(FCE `logs/shadows/decisions.jsonl`) → LAB `decision`
 * 3. 거를 가설 → FCE 재판정(`fce-replay-filter.py`)을 **따로 띄운다**(수 분) — 결과 파일은 다음 차례에 줍는다
 * 4. FCE 그림자 거래(`/api/paper/shadows`) → LAB `sync` → 판정 · 노트
 * 5. LAB 이 준 "돌 그림자" → FCE `logs/shadows/active.json`
 * 6. 승인된 것 → 새 정책 버전 `params/crypto-vN.json`(옛 버전은 그대로) → LAB `applied`
 *
 * 이 파일은 **실행만** 한다. 무엇을 등록하고 판정하고 승인할지는 LAB(`experiments-run.ts`)이 규칙대로 정한다.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FCE_BACKEND, FCE_HOME, FCE_PYTHON } from "./fce-home";

const FCE = process.env.FCE_BASE_URL ?? "http://127.0.0.1:8875";
const SHADOW_DIR = join(FCE_HOME, "logs", "shadows");
const PARAMS_DIR = join(FCE_BACKEND, "app", "paper", "params");
const REPO = process.cwd();

type Post = (path: string, body: unknown) => Promise<string>;

/** 러너가 뜬 뒤 첫 차례에만 관측 → 가설 → 등록을 부른다(그다음은 매일 07:30). */
let looped = false;

async function fceJson(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${FCE}${path}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`FCE ${path} ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** 지금 정책 — 가장 큰 번호의 `crypto-vN.json` (FCE 로더와 같은 규칙). */
function currentPolicyFile(): { version: number; path: string; body: Record<string, unknown> } | null {
  const files = readdirSync(PARAMS_DIR)
    .map((f) => ({ f, m: /^crypto-v(\d+)\.json$/.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({ version: Number(x.m[1]), path: join(PARAMS_DIR, x.f) }))
    .sort((a, b) => b.version - a.version);
  const top = files[0];
  if (!top) return null;
  return { ...top, body: JSON.parse(readFileSync(top.path, "utf8")) as Record<string, unknown> };
}

async function inputs() {
  const file = currentPolicyFile();
  const body = file?.body ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  // 최근 60일 진입의 비용R — FCE 가 진입 때 적은 값(`target_plan.cost_r`).
  const trades = await fceJson("/api/paper/trades?limit=1000");
  const since = Date.now() - 60 * 86_400_000;
  const entryCostR = ((trades.trades as Record<string, unknown>[]) ?? [])
    .filter((t) => typeof t.entry_at === "string" && Date.parse(t.entry_at) >= since)
    .map((t) => (t.target_plan as Record<string, unknown> | undefined)?.cost_r)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return {
    policy: {
      version: String(body.version ?? "unknown"),
      max_entry_cost_r: num(body.max_entry_cost_r),
      // v3 는 risk_mode 를 적지 않는다 — PaperPolicy 기본값(atr_capped)이 쓰인다.
      risk_mode: typeof body.risk_mode === "string" ? body.risk_mode : "atr_capped",
      risk_budget_usdt: num(body.risk_budget_usdt),
    },
    entryCostR,
  };
}

/** 2 — `/approve` · `/reject` 를 LAB 으로. 옮긴 줄 수를 따로 적어 두 번 보내지 않는다. */
async function relayDecisions(post: Post): Promise<string[]> {
  const file = join(SHADOW_DIR, "decisions.jsonl");
  const doneFile = join(SHADOW_DIR, "decisions.relayed");
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  const done = existsSync(doneFile) ? Number(readFileSync(doneFile, "utf8")) || 0 : 0;
  const out: string[] = [];
  for (let i = done; i < lines.length; i += 1) {
    const d = JSON.parse(lines[i] as string) as { action: string; number: number; reason: string };
    const res = JSON.parse(await post("/api/lab/experiments/decision", { number: d.number, action: d.action, reason: d.reason })) as { ok: boolean; reason?: string };
    out.push(`${d.action} #${d.number} → ${res.ok ? "ok" : res.reason}`);
    writeFileSync(doneFile, String(i + 1));
  }
  return out;
}

/** 3 — 재판정을 따로 띄운다. 끝나면 `filter-N.json`. 이미 도는 중이면(`.running`) 기다린다. */
function filterResult(e: { number: number; param: string; value: unknown }): { verdict: "worse" | "ok"; detail: unknown } | null {
  const out = join(SHADOW_DIR, `filter-${e.number}.json`);
  const running = join(SHADOW_DIR, `filter-${e.number}.running`);
  if (existsSync(out)) {
    try {
      const detail = JSON.parse(readFileSync(out, "utf8")) as { verdict?: string };
      return { verdict: detail.verdict === "worse" ? "worse" : "ok", detail };
    } catch {
      return null;
    }
  }
  if (!existsSync(running)) {
    writeFileSync(running, new Date().toISOString());
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        `echo '${JSON.stringify({ param: e.param, value: e.value, symbols: 3, limit: 900 })}' | FCE_LIQUIDATION_OFFLINE=1 "${FCE_PYTHON}" "${join(REPO, "scripts/lab/fce-replay-filter.py")}" > "${out}.tmp" 2> "${out}.err" && mv "${out}.tmp" "${out}"; rm -f "${running}"`,
      ],
      { cwd: FCE_BACKEND, detached: true, stdio: "ignore" }
    );
    child.unref();
  }
  return null;
}

/** 6 — 승인 → 새 정책 버전. **옛 파일은 그대로 둔다**(되돌리기 = 새 파일 지우기). */
function writeVersion(a: { number: number; param: string; value: unknown; baseline: unknown; question: string }): string {
  const cur = currentPolicyFile();
  if (!cur) throw new Error("정책 파일이 없다");
  const next = cur.version + 1;
  const version = `crypto-v${next}`;
  const why = (cur.body._why as Record<string, string> | undefined) ?? {};
  const body = {
    ...cur.body,
    version,
    [a.param]: a.value,
    _inherits: `crypto-v${cur.version}.json 의 전 키를 그대로 승계하고 ${a.param} 하나만 바꿨다 — 이 파일을 지우면 즉시 v${cur.version} 로 되돌아간다.`,
    _rollback: `rm backend/app/paper/params/${version}.json`,
    _why: {
      ...why,
      [a.param]: `FOMO LAB ENG-02 그림자 #${String(a.number).padStart(2, "0")} 승인(${new Date().toISOString().slice(0, 10)}) — ${a.question}. ${String(a.baseline)} → ${String(a.value)}. 사전 등록 기준(거래 30 · 14일 · 수익÷낙폭 · 우연 확률 < 20% 누적 보정 · 비용 후 손익)을 넘었다.`,
    },
  };
  const target = join(PARAMS_DIR, `${version}.json`);
  if (existsSync(target)) throw new Error(`${version}.json 이 이미 있다`);
  writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
  return version;
}

function writeActive(active: { number: number; param: string; value: unknown }[]) {
  mkdirSync(SHADOW_DIR, { recursive: true });
  const file = join(SHADOW_DIR, "active.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(active.map((a) => ({ number: a.number, param: a.param, value: a.value })), null, 2));
  renameSync(`${file}.tmp`, file);
}

export async function experimentsJob(post: Post): Promise<{ rows: number; detail: Record<string, unknown> }> {
  mkdirSync(SHADOW_DIR, { recursive: true });
  const relayed = await relayDecisions(post);
  const shadows = await fceJson("/api/paper/shadows").catch(() => ({ trades: [] }) as Record<string, unknown>);
  const shadowTrades = ((shadows.trades as Record<string, unknown>[]) ?? []).map((t) => ({
    shadow: Number(t.shadow),
    id: String(t.id),
    status: String(t.status),
    entry_at: String(t.entry_at),
    exit_at: typeof t.exit_at === "string" ? t.exit_at : null,
    net_pnl_usdt: Number(t.net_pnl_usdt ?? 0),
    costs_usdt: Number(t.costs_usdt ?? 0),
    symbol: String(t.symbol),
    direction: String(t.direction),
    exit_reason: typeof t.exit_reason === "string" ? t.exit_reason : null,
  }));
  const first = JSON.parse(await post("/api/lab/experiments/sync", { inputs: await inputs(), shadowTrades, runLoop: !looped })) as {
    filtering: { number: number; param: string; value: unknown }[];
  };
  looped = true;
  const filters = first.filtering.map((e) => ({ number: e.number, result: filterResult(e) })).filter((x) => x.result !== null);
  const res = JSON.parse(
    await post("/api/lab/experiments/sync", { filters: filters.map((f) => ({ number: f.number, verdict: f.result?.verdict, detail: f.result?.detail })) })
  ) as {
    tries: number;
    active: { number: number; param: string; value: unknown }[];
    toApply: { number: number; param: string; value: unknown; baseline: unknown; question: string }[];
    decided: unknown[];
  };
  writeActive(res.active);
  const applied: string[] = [];
  for (const a of res.toApply) {
    const version = writeVersion(a);
    await post("/api/lab/experiments/applied", { number: a.number, version, at: new Date().toISOString() });
    applied.push(`#${a.number} → ${version}`);
  }
  return {
    rows: res.active.length,
    detail: { tries: res.tries, active: res.active.map((a) => a.number), filtering: first.filtering.map((f) => f.number), relayed, applied, decided: res.decided },
  };
}
