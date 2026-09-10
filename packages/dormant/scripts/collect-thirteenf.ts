/**
 * LAUNCH-P1 §C-3 — **13F 를 GitHub Actions 에서 모아 프로덕션에 넣는다.**
 *
 * ## 왜 여기서 도나
 *
 * SEC EDGAR 가 Vercel 런타임에서 막힌다. INFLUENCER-01 에서 실측으로 갈랐다 —
 * **같은 코드가 로컬에서는 11인물 전부 받아온다.** 코드 문제가 아니라 실행 위치 문제다.
 * 그래서 수집만 여기로 옮기고, 결과를 인증된 창구로 POST 한다.
 *
 * ## 실행
 *
 * ```
 * SEC_EDGAR_USER_AGENT="FomoClub/1.0 you@example.com" \
 * INGEST_URL="https://fomo-club-backend.vercel.app/api/fomo/cron/investors/thirteenf" \
 * CRON_SECRET="…" npx tsx scripts/collect-thirteenf.ts
 * ```
 *
 * `CRON_SECRET` 이 없으면 **POST 하지 않고 멈춘다** — 인증 없이 쓰기를 시도하지 않는다.
 * `DRY_RUN=1` 이면 수집만 하고 결과를 출력한다(창구를 건드리지 않는다).
 */
import {
  INVESTORS,
  fetchThirteenF,
  fetchSecNameIndex,
  fetchArkSnapshot,
  curatedCusipMap,
  normalizeCompanyName,
} from "../apps/web/lib/investor-collect";

interface OutSnapshot { asOf: string; holdings: unknown[] }
interface OutEntry { latest: OutSnapshot; prior: OutSnapshot | null; unresolved?: number }

async function main(): Promise<void> {
  const dryRun = /^(?:1|true|yes)$/i.test(process.env.DRY_RUN ?? "");
  const url = process.env.INGEST_URL?.trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (!dryRun && (!url || !secret)) {
    // 인증 없이 쓰기를 시도하지 않는다. 둘 중 하나라도 없으면 여기서 끝낸다.
    console.error("INGEST_URL 과 CRON_SECRET 이 둘 다 필요하다 (DRY_RUN=1 로 수집만 볼 수 있다)");
    process.exit(2);
  }

  /**
   * CUSIP 사전 — 손으로 확인한 씨앗 + ARK 가 매일 주는 진짜 쌍.
   * 라우트가 하던 것과 **같은 순서**다(ARK 먼저 → 13F 해석률이 올라간다).
   */
  const cusipMap = curatedCusipMap();
  for (const investor of INVESTORS) {
    if (investor.source !== "ark" || !investor.arkFunds) continue;
    const snap = await fetchArkSnapshot(investor.arkFunds);
    if (!snap) continue;
    for (const [cusip, ticker] of snap.cusipToTicker) if (!cusipMap.has(cusip)) cusipMap.set(cusip, ticker);
  }
  const nameIndex = await fetchSecNameIndex();
  if (nameIndex.size === 0) console.error("경고: SEC company_tickers 조회 실패 — 이름 매칭 없이 진행");
  const resolve = (cusip: string, name: string): string | undefined =>
    cusipMap.get(cusip.toUpperCase()) ?? nameIndex.get(normalizeCompanyName(name));

  const byInvestor: Record<string, OutEntry> = {};
  const failures: string[] = [];
  for (const investor of INVESTORS) {
    if (investor.source !== "13f" || !investor.cik) continue;
    const filings = await fetchThirteenF(investor.cik, resolve, 2);
    if (filings.length === 0) { failures.push(investor.id); continue; }
    const [latest, prior] = filings;
    byInvestor[investor.id] = {
      latest: { asOf: latest!.asOf, holdings: latest!.holdings },
      prior: prior ? { asOf: prior.asOf, holdings: prior.holdings } : null,
      ...(typeof latest!.unresolved === "number" ? { unresolved: latest!.unresolved } : {}),
    };
    console.log(`${investor.id}: ${latest!.asOf} · ${latest!.holdings.length}종목 · 직전 ${prior ? prior.asOf : "없음"}`);
  }

  const collected = Object.keys(byInvestor).length;
  console.log(`\n13F 수집 ${collected}인물 · 실패 ${failures.length}${failures.length ? ` (${failures.join(", ")})` : ""}`);
  if (collected === 0) {
    // 0명을 보내면 창구가 422 로 막는다. 여기서 먼저 멈춰 원인을 분명히 남긴다.
    console.error("수집 0인물 — POST 하지 않는다");
    process.exit(1);
  }
  if (dryRun) return;

  const response = await fetch(url!, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret!}` },
    body: JSON.stringify({ byInvestor }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  console.log(`POST ${response.status} ${text.slice(0, 600)}`);
  if (!response.ok) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
