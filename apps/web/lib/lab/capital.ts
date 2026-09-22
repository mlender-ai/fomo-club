/**
 * 자본 시계열 재구성 (UI-02 B-2).
 *
 * ## 왜 되만드나
 *
 * **FCE 에 자본 이력이 없다.** 트랙 테이블은 `cash` 를 덮어쓴다 — 어제 얼마였는지가
 * 아무 데도 없다(`docs/ui/DATA_SOURCES.md` §3). 지시서가 그럴 때 거래 이력으로
 * 재구성하라고 했다(B-2 ③).
 *
 * ## 되만든 곡선은 실측과 다르다
 *
 * | | |
 * |---|---|
 * | **미실현이 빠진다** | 실현 손익만 누적한다. 보유 중 평가손익은 곡선에 없다 |
 * | 계단이 된다 | 거래가 닫히는 순간에만 값이 변한다 |
 * | 거래 없는 날은 평평하다 | 실제 자산은 그 사이에도 움직였다 |
 *
 * 그래서 `source = "reconstructed"` 를 박는다. **화면이 이걸 띄운다**(B-2 ④).
 * 실측인 것처럼 그리면 화면이 거짓말한다.
 *
 * ## 벤치마크는 랩이 가진 봉으로 세운다
 *
 * FCE 는 벤치마크를 **현재값 한 점**으로만 준다. 크립토·고래의 기준인 `BTC 보유`
 * 는 랩이 D1 봉을 갖고 있으므로(`Candle`) 같은 기간을 그대로 그릴 수 있다.
 * 주식 벤치마크(S&P·KOSPI)는 랩에 없다 — **없으면 null 이고 차트가 그렇게 말한다.**
 */
import { prisma } from "../prisma";

/** 하루 단위로 낸다. 49일치 Overview 차트가 필요한 해상도가 이것이다. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** `BTC 보유` 를 벤치마크로 쓰는 트랙. FCE 가 그렇게 정했다(UI-02 D). */
const BTC_BENCHMARK = new Set(["crypto", "whale"]);

function startOfDay(at: Date): Date {
  return new Date(Math.floor(at.getTime() / DAY_MS) * DAY_MS);
}

/**
 * 트랙 하나의 자본 곡선을 되만들어 저장한다.
 *
 * **바뀐 점만 쓴다.** 매번 전부 다시 쓰면 서버리스에서 왕복이 폭발한다 —
 * 거래 이력에서 이미 한 번 겪었다(`docs/lab/BRIDGE.md` §8).
 */
export async function rebuildCapitalSeries(trackKey: string): Promise<number> {
  const track = await prisma.fceTrack.findUnique({
    where: { key: trackKey },
    select: { startingCapital: true },
  });
  if (!track) return 0;

  const trades = await prisma.fceTrade.findMany({
    where: { trackKey, exitAt: { not: null } },
    orderBy: { exitAt: "asc" },
    select: { exitAt: true, netPnlUsdt: true },
  });
  if (trades.length === 0) return 0;

  const start = track.startingCapital.toNumber();
  const first = trades[0]?.exitAt;
  const last = trades[trades.length - 1]?.exitAt;
  if (!first || !last) return 0;

  // 날짜별 실현 손익 합.
  const byDay = new Map<number, number>();
  for (const t of trades) {
    if (!t.exitAt) continue;
    const day = startOfDay(t.exitAt).getTime();
    byDay.set(day, (byDay.get(day) ?? 0) + (t.netPnlUsdt ?? 0));
  }

  // 첫 청산일 **하루 전**부터 시작한다. 그래야 곡선이 시작 자본에서 출발한다 —
  // 첫 점이 이미 손익이 반영된 값이면 "얼마로 시작했나" 가 화면에서 사라진다.
  const from = startOfDay(first).getTime() - DAY_MS;
  const to = startOfDay(last).getTime();

  const benchmark = BTC_BENCHMARK.has(trackKey)
    ? await btcHoldSeries(new Date(from), new Date(to))
    : null;

  let running = start;
  const points: { at: Date; capital: number; benchmark: number | null }[] = [];
  for (let day = from; day <= to; day += DAY_MS) {
    running += byDay.get(day) ?? 0;
    points.push({
      at: new Date(day),
      capital: running,
      // 벤치마크는 **같은 시작 자본에서 출발**시킨다 — 배수에 시작 자본을 곱한다.
      // 배수(1.0 언저리)를 그대로 저장하면 자본(500 언저리)과 축이 달라 두 선이
      // 겹쳐 보이지 않는다.
      benchmark: benchmark ? (benchmark.has(day) ? (benchmark.get(day) ?? 1) * start : null) : null,
    });
  }

  const existing = await prisma.fceCapitalPoint.findMany({
    where: { trackKey, at: { gte: new Date(from), lte: new Date(to) } },
    select: { at: true, capital: true, benchmark: true },
  });
  const known = new Map(existing.map((p) => [p.at.getTime(), p]));

  const fresh = points.filter((p) => !known.has(p.at.getTime()));
  if (fresh.length > 0) {
    await prisma.fceCapitalPoint.createMany({
      data: fresh.map((p) => ({
        trackKey,
        at: p.at,
        capital: p.capital,
        benchmark: p.benchmark,
        source: "reconstructed",
      })),
      skipDuplicates: true,
    });
  }

  // 값이 바뀐 점만 갱신한다. **`===` 로 비교하지 않는다** — 부동소수 왕복에서
  // 마지막 자리가 흔들려 전부 "바뀜" 으로 잡힌다(`docs/lab/BRIDGE.md` §8).
  let updated = 0;
  for (const p of points) {
    const old = known.get(p.at.getTime());
    if (!old) continue;
    const same =
      Math.abs(old.capital - p.capital) < 1e-9 &&
      ((old.benchmark === null && p.benchmark === null) ||
        (old.benchmark !== null &&
          p.benchmark !== null &&
          Math.abs(old.benchmark - p.benchmark) < 1e-9));
    if (same) continue;
    await prisma.fceCapitalPoint.update({
      where: { trackKey_at: { trackKey, at: p.at } },
      data: { capital: p.capital, benchmark: p.benchmark },
    });
    updated += 1;
  }

  return fresh.length + updated;
}

/**
 * `BTC 보유` 곡선 — **수익률 배수**로 낸다(1.0 = 본전).
 *
 * 트랙마다 시작 자본이 다르므로 금액이 아니라 배수를 내고, 부르는 쪽이 곱한다.
 * 봉이 없는 날은 **잇지 않는다** — 구멍은 구멍으로 둔다.
 */
async function btcHoldSeries(from: Date, to: Date): Promise<Map<number, number> | null> {
  const bars = await prisma.candle.findMany({
    where: { symbol: "BTC", interval: "D1", at: { gte: from, lte: to } },
    orderBy: { at: "asc" },
    select: { at: true, close: true },
  });
  if (bars.length < 2) return null;

  const base = bars[0]?.close.toNumber();
  if (!base || base <= 0) return null;

  const out = new Map<number, number>();
  for (const bar of bars) {
    out.set(startOfDay(bar.at).getTime(), bar.close.toNumber() / base);
  }
  return out;
}

export interface CapitalSeries {
  trackKey: string;
  points: { at: Date; capital: number; benchmark: number | null }[];
  /** 전부 되만든 값인가. **화면이 이걸 띄운다.** */
  reconstructed: boolean;
}

export async function readCapitalSeries(trackKey: string): Promise<CapitalSeries> {
  const rows = await prisma.fceCapitalPoint.findMany({
    where: { trackKey },
    orderBy: { at: "asc" },
    select: { at: true, capital: true, benchmark: true, source: true },
  });
  return {
    trackKey,
    points: rows.map((r) => ({ at: r.at, capital: r.capital, benchmark: r.benchmark })),
    reconstructed: rows.length > 0 && rows.every((r) => r.source === "reconstructed"),
  };
}
