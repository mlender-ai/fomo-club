/**
 * LAB-09 PART C — 수급(외국인·기관 일별) 수집.
 *
 * ## 격리분 수집기는 **깨져 있었다**
 *
 * `packages/dormant/web/lib/supply-demand.ts` 는 `finance.naver.com/item/frgn.naver` 를
 * EUC-KR HTML 표로 파싱한다. 지금 그 주소는 **SPA 를 돌려준다** — 표가 없다.
 * 실측: 응답 118KB 를 받아 `외국인`·`기관` 문자열이 **0건**. 파서는 빈 배열을 돌려주고,
 * 호출부는 그걸 "수급이 없는 종목" 으로 읽는다. 조용히 0건이 되는 종류의 고장이다.
 *
 * 그래서 새 경로를 쓴다: **모바일 JSON API**.
 *
 * ```
 * GET m.stock.naver.com/api/stock/{code}/trend[?bizdate=YYYYMMDD]
 * → 10행. bizdate 를 주면 그 날짜 **이전** 10행.
 * ```
 *
 * 한 번에 10행뿐이라 거슬러 올라가며 페이지를 넘긴다(실측: 12콜 120행, 6개월).
 * 3년이면 종목당 약 75콜이다.
 *
 * ## 숫자는 **주 수**다
 *
 * `foreignerPureBuyQuant` 는 순매수 **수량**이지 금액이 아니다. 연속일 판정에는
 * 부호만 쓰므로 상관없지만, 금액 임계를 걸려면 종가를 곱해야 한다 — 안 하고 있다.
 *
 *   npm run lab:supply-demand                 # 증분(가진 것 이후만)
 *   npm run lab:supply-demand -- --backfill   # 3년
 *   npm run lab:supply-demand -- --ticker 005930
 */
import { PrismaClient } from "@prisma/client";

import { finish, runJob, type JobResult } from "./collect/job";
import { krUniverse } from "./collect/stock-universe";

const prisma = new PrismaClient();

const API = "https://m.stock.naver.com/api/stock";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

/** 백필 기간. 워크포워드가 폴드를 여럿 내려면 3년은 있어야 한다(252+63 기준 약 8폴드). */
const BACKFILL_YEARS = 3;

/** 한 종목이 넘길 수 있는 최대 페이지. 무한 루프 방지 — 3년이면 약 75쪽이다. */
const MAX_PAGES = 90;

/** 네이버 레이트 보호. */
const GAP_MS = 220;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BACKFILL = process.argv.includes("--backfill");
const DRY = process.argv.includes("--dry");

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

interface TrendRow {
  bizdate?: unknown;
  foreignerPureBuyQuant?: unknown;
  organPureBuyQuant?: unknown;
  individualPureBuyQuant?: unknown;
}

/**
 * `"-3,466,765"` → `-3466765`. 쉼표와 선행 `+` 를 걷어낸다.
 *
 * 숫자로 안 읽히면 **0 이 아니라 null** 이다. 0 은 "안 샀다" 라서 연속일을 끊는
 * 값이고, 못 읽은 것을 그렇게 적으면 없는 사실이 생긴다.
 */
function parseQuant(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").replace(/^\+/, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `"20260914"` → `"2026-09-14"`. `SupplyDemandDaily.date` 규약이 그렇다. */
function toIsoDate(bizdate: string): string | null {
  if (!/^\d{8}$/.test(bizdate)) return null;
  return `${bizdate.slice(0, 4)}-${bizdate.slice(4, 6)}-${bizdate.slice(6, 8)}`;
}

async function fetchPage(code: string, bizdate: string | null): Promise<TrendRow[]> {
  const url = `${API}/${code}/trend${bizdate ? `?bizdate=${bizdate}` : ""}`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://m.stock.naver.com/" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${url} → ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    // **모양이 바뀌면 던진다.** 빈 배열로 넘기면 "수급 없는 종목" 과 구분이 안 된다.
    throw new Error(`${url}: 배열이 아니다 — 응답 모양이 바뀌었다`);
  }
  return body as TrendRow[];
}

interface Collected {
  rows: { ticker: string; date: string; foreignNet: number; institutionNet: number; individualNet: number | null }[];
  pages: number;
  oldest: string | null;
}

async function collectTicker(code: string, stopBefore: string, haveDates: Set<string>): Promise<Collected> {
  const rows: Collected["rows"] = [];
  let cursor: string | null = null;
  let pages = 0;
  let oldest: string | null = null;

  for (; pages < MAX_PAGES; pages += 1) {
    const page: TrendRow[] = await fetchPage(code, cursor);
    if (page.length === 0) break;

    let reachedKnown = false;
    for (const row of page) {
      const bizdate = typeof row.bizdate === "string" ? row.bizdate : null;
      const date = bizdate ? toIsoDate(bizdate) : null;
      if (!date) continue;
      oldest = date;
      if (date < stopBefore) {
        reachedKnown = true;
        continue;
      }
      // 증분 실행에서 이미 가진 날짜를 만나면 거기서 멈춘다.
      if (haveDates.has(date)) {
        reachedKnown = true;
        continue;
      }
      const foreignNet = parseQuant(row.foreignerPureBuyQuant);
      const institutionNet = parseQuant(row.organPureBuyQuant);
      // 둘 중 하나라도 못 읽으면 그 날은 **넣지 않는다.**
      if (foreignNet === null || institutionNet === null) continue;
      rows.push({
        ticker: code,
        date,
        foreignNet,
        institutionNet,
        individualNet: parseQuant(row.individualPureBuyQuant),
      });
    }

    const last = page[page.length - 1];
    const lastDate = typeof last?.bizdate === "string" ? last.bizdate : null;
    if (!lastDate || lastDate === cursor) break;
    cursor = lastDate;
    if (reachedKnown && !BACKFILL) break;
    if (oldest !== null && oldest < stopBefore) break;
    await sleep(GAP_MS);
  }

  return { rows, pages, oldest };
}

async function main(): Promise<void> {
  const only = arg("ticker");
  const targets = krUniverse().filter((d) => !only || d.naverCode === only);
  if (only && targets.length === 0) throw new Error(`유니버스에 없는 코드: ${only}`);

  const stopBefore = new Date(Date.now() - BACKFILL_YEARS * 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const outcome = await runJob(prisma, "supply-demand", async (): Promise<JobResult> => {
    let written = 0;
    let pages = 0;
    const failed: string[] = [];
    let oldestSeen: string | null = null;

    for (const def of targets) {
      const code = def.naverCode as string;
      try {
        const existing = await prisma.supplyDemandDaily.findMany({
          where: { ticker: code },
          select: { date: true },
        });
        const have = new Set(existing.map((r) => r.date));

        const collected = await collectTicker(code, stopBefore, have);
        pages += collected.pages;
        if (collected.oldest && (!oldestSeen || collected.oldest < oldestSeen)) {
          oldestSeen = collected.oldest;
        }

        if (!DRY && collected.rows.length > 0) {
          for (let i = 0; i < collected.rows.length; i += 500) {
            const result = await prisma.supplyDemandDaily.createMany({
              data: collected.rows.slice(i, i + 500),
              skipDuplicates: true,
            });
            written += result.count;
          }
        }
      } catch (error) {
        failed.push(`${code}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(GAP_MS);
    }

    return {
      rows: written,
      detail: {
        tickers: targets.length,
        pages,
        oldest: oldestSeen,
        failed: failed.slice(0, 5),
        failedCount: failed.length,
        mode: BACKFILL ? "backfill" : "incremental",
        dry: DRY,
      },
    };
  });

  await finish(prisma, outcome);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
