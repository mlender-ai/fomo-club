import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WO-RESET-07 §B — **인물 카드가 실제로 덱에 나와야 한다.**
 *
 * 데이터층만 만들고 카드 생성에 안 이으면 화면에는 아무것도 안 나온다 — 실제로 그랬다
 * (2026-08-28: 두 층을 다 만들었는데 카드가 없었다). 배선이 끊기는 회귀를 여기서 막는다.
 */
const engine = readFileSync(new URL("../../lib/quiet-pick.ts", import.meta.url), "utf8");
const core = readFileSync(
  new URL("../../../../packages/fomo-core/src/keyword-cards/card-type.ts", import.meta.url), "utf8"
);

describe("인물 카드 배선 (완료 확인 3)", () => {
  it("엔진이 보유 내역을 읽는다", () => {
    expect(engine).toContain("readInvestorCollection: typeof readInvestorCollection;");
    expect(engine).toContain('guardedInput("readInvestorCollection"');
  });

  it("두 시점을 비교해 신호를 만든다 — 수집은 크론이 했고 여기선 비교만 한다", () => {
    expect(engine).toContain("function detectInvestorSignals(");
    expect(engine).toContain("diffHoldings(entry.latest, entry.prior)");
  });

  it("그 신호가 덱 후보에 합류한다 — 이게 끊기면 카드가 안 나온다", () => {
    expect(engine).toContain("const investorSignals = detectInvestorSignals(investorCollection, date);");
    expect(engine).toMatch(/dedupeSignalsByStock\(\[\s*\n\s*\.\.\.investorSignals,/);
  });

  it("카드 형이 붙는다 — 형이 없으면 그림도 문장도 없다", () => {
    expect(engine).toContain("const investorPreset = sig.investor");
    expect(engine).toContain("investorCard({");
    expect(core).toContain("export function investorCard(");
  });

  it("덱 상한이 걸리도록 investorId 를 넘긴다 (완료 확인 9)", () => {
    expect(engine).toContain("...(pick.investor?.id ? { investorId: pick.investor.id } : {}),");
  });

  it("노출 기간이 지난 공시는 안 낸다 (§E-3)", () => {
    expect(engine).toContain("isFreshDisclosure(profile.source, entry.latest.asOf, today)");
  });

  it("우리가 모르는 종목은 카드를 만들지 않는다 — 반쪽 카드보다 낫다", () => {
    expect(engine).toContain("const seed = usDiscoverySeedForSymbol(change.ticker);");
    expect(engine).toContain("if (!seed) continue;");
  });

  it("공시일을 카드에 쓴다 — 지연을 숨기지 않는다 (WO 하지 말 것)", () => {
    expect(engine).toContain("whenLabel(sig.investor.asOf)");
  });

  it("사진·로고를 쓰지 않는다 (§B-3)", () => {
    const card = readFileSync(new URL("../../../fomo-web/components/WeightGauge.tsx", import.meta.url), "utf8");
    expect(card).not.toMatch(/img|Image|avatar|photo|logo/i);
  });
});

describe("수집 워크플로 — 매일 돌아야 카드가 나온다 (완료 확인 2)", () => {
  it("인물·업종 수집이 픽 재생성보다 **먼저** 돈다", () => {
    const investor = readFileSync(new URL("../../../../.github/workflows/investor-collect.yml", import.meta.url), "utf8");
    const sector = readFileSync(new URL("../../../../.github/workflows/sector-map.yml", import.meta.url), "utf8");
    expect(investor).toContain('cron: "20 23 * * *"');
    expect(sector).toContain('cron: "0 23 * * *"');
    // 공시 수집(23:40)보다 앞이고, 셋 다 픽 재생성 전이다.
    expect(investor).toContain("/api/fomo/cron/investors");
    expect(sector).toContain("/api/fomo/cron/sector-map");
  });
});
