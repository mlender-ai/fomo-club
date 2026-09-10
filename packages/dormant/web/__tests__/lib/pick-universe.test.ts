import { describe, it, expect } from "vitest";
import type { StockDef } from "@fomo/core";
import { buildKrPickUniverse, PICK_UNIVERSE_PER_MARKET } from "../../lib/pick-universe";
import type { DiscoveryMarketRow } from "../../lib/market-source-types";

function row(code: string, market: "KOSPI" | "KOSDAQ", name = `종목${code}`): DiscoveryMarketRow {
  return { canonical: name, symbol: code, naverCode: code, market, country: "KR" };
}
function def(code: string, canonical: string, extra: Partial<StockDef> = {}): StockDef {
  return { canonical, aliases: [canonical], market: "KOSPI", country: "KR", naverCode: code, ...extra };
}

describe("buildKrPickUniverse — 사전이 아니라 시세 행에서 유니버스를 만든다", () => {
  it("사전 밖 종목이 유니버스에 들어온다 (§17-A 가 진단한 66 의 원인)", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(String(1000 + i), "KOSPI"));
    const vocab = [def("1000", "종목1000")];
    const u = buildKrPickUniverse(rows, vocab, 30);
    expect(u.source).toBe("market");
    expect(u.defs).toHaveLength(30);
    expect(u.fromRows).toBe(29);
    expect(u.fromVocab).toBe(1);
  });

  it("시장별로 상한을 따로 둔다 — 코스피가 코스닥 자리를 먹지 않는다", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => row(`A${i}`, "KOSPI")),
      ...Array.from({ length: 20 }, (_, i) => row(`Q${i}`, "KOSDAQ")),
    ];
    const u = buildKrPickUniverse(rows, [], 5);
    expect(u.defs.filter((d) => d.market === "KOSPI")).toHaveLength(5);
    expect(u.defs.filter((d) => d.market === "KOSDAQ")).toHaveLength(5);
  });

  it("사전에 있는 종목은 사전 정의를 그대로 물려받는다 — 별칭이 살아 있다", () => {
    const u = buildKrPickUniverse([row("000660", "KOSPI")], [def("000660", "SK하이닉스", { aliases: ["SK하이닉스", "하이닉스"] })], 5);
    expect(u.defs[0]!.aliases).toEqual(["SK하이닉스", "하이닉스"]);
  });

  it("사전 밖 종목은 별칭을 정식명 하나로만 준다 — 인식 어휘를 넓히지 않는다", () => {
    const u = buildKrPickUniverse([row("123456", "KOSDAQ", "무명전자")], [], 5);
    expect(u.defs[0]!.aliases).toEqual(["무명전자"]);
  });

  it("marquee 종목은 종전대로 빠지고 그 자리를 다음 종목이 채운다", () => {
    const rows = [row("005930", "KOSPI"), row("A1", "KOSPI"), row("A2", "KOSPI")];
    const u = buildKrPickUniverse(rows, [def("005930", "삼성전자", { marquee: true })], 2);
    expect(u.defs.map((d) => d.naverCode)).toEqual(["A1", "A2"]);
  });

  it("시세가 비면 사전으로 후퇴하고 그 사실을 남긴다 — 덱을 비우지 않는다(§12)", () => {
    const vocab = [def("1000", "가"), def("1001", "나"), def("005930", "삼성전자", { marquee: true })];
    const u = buildKrPickUniverse([], vocab);
    expect(u.source).toBe("vocab");
    expect(u.defs.map((d) => d.naverCode)).toEqual(["1000", "1001"]);
  });

  it("시총 컷 밖으로 밀린 사전 종목도 버리지 않는다 — 확대로 카드가 줄면 개선이 아니다", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`A${i}`, "KOSPI"));
    const u = buildKrPickUniverse(rows, [def("Z9", "변두리전자")], 3);
    expect(u.defs.map((d) => d.naverCode)).toEqual(["A0", "A1", "A2", "Z9"]);
  });

  it("같은 코드가 두 번 오면 한 번만 센다", () => {
    const u = buildKrPickUniverse([row("A1", "KOSPI"), row("A1", "KOSPI")], [], 5);
    expect(u.defs).toHaveLength(1);
  });

  it("기본 상한은 시장별 400 — 두 시장 합쳐 ≈800 (WO PART D-1 2차)", () => {
    expect(PICK_UNIVERSE_PER_MARKET).toBe(400);
  });

  it("판정선(시총 100위) 아래가 유니버스의 대부분이어야 한다 — 조용한 종목을 찾는 앱이므로", () => {
    // 시장별 400 이면 시장별 300종목이 100위 밖이다. 이 비율이 뒤집히면 확대가 헛돈다.
    const beyondKnownBand = PICK_UNIVERSE_PER_MARKET - 100;
    expect(beyondKnownBand).toBeGreaterThan(100);
  });
});

describe("유니버스 게이트는 한 곳이 아니었다 — 흩어진 곳을 같은 함수로 모은다", () => {
  it("픽 엔진·수급 수집·공시 수집·DART 내부자가 모두 유니버스를 밖에서 받는다", async () => {
    const [pick, supply, disclosure, dart] = await Promise.all([
      import("node:fs/promises").then((fs) => fs.readFile("apps/web/lib/quiet-pick.ts", "utf8")),
      import("node:fs/promises").then((fs) => fs.readFile("scripts/supply-demand-collect.ts", "utf8")),
      import("node:fs/promises").then((fs) => fs.readFile("apps/web/lib/disclosure-collect.ts", "utf8")),
      import("node:fs/promises").then((fs) => fs.readFile("apps/web/lib/dart-disclosures.ts", "utf8")),
    ]);
    // 픽 엔진과 수급 수집은 같은 함수를 부른다 — 어긋나면 새 종목의 신호가 영원히 안 뜬다.
    expect(pick).toContain("buildKrPickUniverse(");
    expect(supply).toContain("buildKrPickUniverse(");
    // 공시·DART 는 유니버스를 인자로 받는다(사전 하드코딩이 남아 있으면 안 된다).
    expect(disclosure).not.toMatch(/const byCode = new Map\(\s*STOCK_VOCAB/);
    expect(dart).not.toMatch(/const byCode = new Map\(STOCK_VOCAB/);
  });
});
