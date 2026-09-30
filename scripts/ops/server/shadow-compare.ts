/**
 * 병행 운용 대조 — 하루 한 번 (OPS-04 PART D).
 *
 * ```
 * 맥(운영)   → 랩 DB     → GET /api/lab/ledger?since=   (읽기만)
 * 서버(그림자) → 로컬 기록 → /var/lib/fomo/shadow/fce-*.json 중 가장 최근 것
 * ```
 *
 * 둘을 `apps/web/lib/lab/shadow-diff.ts` 로 대조해 `reports/YYYY-MM-DD.md` 에 쓴다. **서버는 아무것도 올리지 않는다.**
 *
 *   npx tsx scripts/ops/server/shadow-compare.ts
 *
 * 필요: `LAB_INGEST_TOKEN`(읽기용으로만 쓴다) · `SHADOW_SINCE`(서버가 맥 DB 를 복사한 시각, ISO).
 * 불일치면 종료 코드 1 — systemd 가 실패로 남기고 알림이 간다.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FcePayload } from "../../../apps/web/lib/lab/fce-payload";
import { compareShadow, shadowMarkdown, type ShadowSide } from "../../../apps/web/lib/lab/shadow-diff";

const LAB = process.env.LAB_BASE_URL ?? "https://fomo-web-mlender-ais-projects.vercel.app";
const TOKEN = process.env.LAB_INGEST_TOKEN ?? "";
const SINCE = process.env.SHADOW_SINCE ?? "";
const DIR = process.env.SHADOW_DIR ?? "/var/lib/fomo/shadow";

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(2);
}

/** 서버 쪽 — `shadow-capture.sh` 가 15분마다 남긴 업로드 페이로드 중 가장 최근 것. */
function serverSide(): ShadowSide {
  const files = readdirSync(DIR)
    .filter((f) => /^fce-.*\.json$/.test(f))
    .sort();
  const last = files[files.length - 1];
  if (!last) fail(`${DIR} 에 그림자 기록(fce-*.json)이 없다 — lab-shadow.timer 가 도나`);
  const p = JSON.parse(readFileSync(join(DIR, last), "utf8")) as FcePayload;
  return {
    at: p.at,
    tracks: p.tracks.map((t) => ({ key: t.key, trades: t.trades, currentCapital: t.currentCapital, status: t.status })),
    trades: p.trades.map((t) => ({
      id: t.id,
      trackKey: t.trackKey,
      symbol: t.symbol,
      direction: t.direction,
      entryAt: t.entryAt,
      entryPrice: t.entryPrice,
      exitAt: t.exitAt,
      exitPrice: t.exitPrice,
      netPnlUsdt: t.netPnlUsdt,
    })),
    positions: p.positions.map((q) => ({
      id: q.id,
      trackKey: q.trackKey,
      symbol: q.symbol,
      direction: q.direction,
      entryAt: q.entryAt,
      entryPrice: q.entryPrice,
    })),
  };
}

/** 맥 쪽 — 맥이 올려 랩 DB 에 들어간 것. */
async function macSide(): Promise<ShadowSide> {
  const res = await fetch(`${LAB}/api/lab/ledger?since=${encodeURIComponent(SINCE)}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) fail(`랩 원장 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as ShadowSide;
}

async function main(): Promise<void> {
  if (!TOKEN) fail("LAB_INGEST_TOKEN 이 없다");
  if (!SINCE || Number.isNaN(Date.parse(SINCE))) fail("SHADOW_SINCE 가 없다 — 서버가 맥 DB 를 복사한 시각(ISO)");

  const report = compareShadow(await macSide(), serverSide(), { since: SINCE });
  const md = shadowMarkdown(report);
  const out = join(DIR, "reports");
  mkdirSync(out, { recursive: true });
  const file = join(out, `${report.serverAt.slice(0, 10)}.md`);
  writeFileSync(file, md);

  console.log(md);
  console.log(`→ ${file}`);
  process.exit(report.verdict === "일치" ? 0 : 1);
}

void main();
