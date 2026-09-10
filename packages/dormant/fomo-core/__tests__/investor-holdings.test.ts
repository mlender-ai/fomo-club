import { describe, it, expect } from "vitest";
import {
  diffHoldings, investorHook, multiInvestorHook, investorSupport, isFreshDisclosure,
  formatShares, formatUsd, HOLDING_CHANGE_MIN, INVESTOR_FRESH_DAYS,
  topWeightHoldings, HOLDING_TOP_WEIGHT_MIN,
  type InvestorSnapshot, type InvestorProfile,
} from "../src/keyword-cards/investor-holdings";

const WOOD: InvestorProfile = { id: "cathie-wood", name: "캐시 우드", firm: "ARK", source: "ark" };
const snap = (asOf: string, rows: Array<[string, number, number?]>): InvestorSnapshot => ({
  asOf,
  holdings: rows.map(([ticker, shares, weightPct]) => ({
    ticker, name: `${ticker} INC`, shares,
    ...(weightPct === undefined ? {} : { weightPct }),
  })),
});

describe("보유 변화 — 두 시점을 비교한다", () => {
  it("직전이 없으면 아무 변화도 내지 않는다 — 첫 수집일에 전 종목이 「처음 샀어요」가 되면 안 된다", () => {
    expect(diffHoldings(snap("2026-08-27", [["TSLA", 100]]), null)).toEqual([]);
    expect(diffHoldings(snap("2026-08-27", [["TSLA", 100]]), snap("2026-08-26", []))).toEqual([]);
  });

  it("없던 종목이 생기면 신규 매수다", () => {
    const [c] = diffHoldings(snap("2026-08-27", [["TTMI", 420_000, 1.2]]), snap("2026-08-26", [["TSLA", 100]]));
    expect(c!.kind).toBe("new");
    expect(c!.priorShares).toBe(0);
    expect(c!.weightDeltaPct).toBe(1.2);
  });

  it("사라지면 전량 매도다 — **매도도 카드가 된다**", () => {
    const c = diffHoldings(snap("2026-08-27", []), snap("2026-08-26", [["ZM", 500, 2.0]]))[0]!;
    expect(c.kind).toBe("exited");
    expect(c.shares).toBe(0);
    expect(c.priorShares).toBe(500);
    expect(c.weightDeltaPct).toBe(-2.0);
  });

  it("주식 수가 거의 안 변했으면 변화로 치지 않는다 — ETF 는 자금 유출입만으로 매일 조금씩 움직인다", () => {
    const small = 1 + HOLDING_CHANGE_MIN / 2;
    expect(diffHoldings(snap("2026-08-27", [["TSLA", 100 * small]]), snap("2026-08-26", [["TSLA", 100]]))).toEqual([]);
  });

  it("비중이 아니라 **주식 수**로 판정한다 — 비중은 주가만 움직여도 바뀐다", () => {
    // 주식 수 그대로, 비중만 크게 변함 → 매매가 아니다.
    const out = diffHoldings(snap("2026-08-27", [["TSLA", 100, 9.0]]), snap("2026-08-26", [["TSLA", 100, 4.0]]));
    expect(out).toEqual([]);
  });

  it("크게 늘면 배수를 남긴다", () => {
    const c = diffHoldings(snap("2026-08-27", [["TSLA", 300]]), snap("2026-08-26", [["TSLA", 100]]))[0]!;
    expect(c.kind).toBe("added");
    expect(c.multiple).toBe(3);
  });

  it("줄면 reduced 다 — 전량 매도와 구분한다", () => {
    const c = diffHoldings(snap("2026-08-27", [["COIN", 50]]), snap("2026-08-26", [["COIN", 100]]))[0]!;
    expect(c.kind).toBe("reduced");
    expect(c.shares).toBe(50);
  });
});

describe("결론 문장 — 무슨 일이 있었나만 말한다", () => {
  const c = (kind: string, extra: Record<string, unknown> = {}) =>
    ({ kind, ticker: "TSLA", name: "TESLA", shares: 1, priorShares: 1, ...extra }) as never;

  it("네 가지 상황이 각자 다른 문장을 쓴다", () => {
    expect(investorHook(WOOD, c("new"))).toContain("처음 샀어요");
    expect(investorHook(WOOD, c("exited"))).toContain("전부 팔았어요");
    expect(investorHook(WOOD, c("added", { multiple: 2.4 }))).toContain("두 배로 늘렸어요");
    expect(investorHook(WOOD, c("added", { multiple: 1.3 }))).toContain("더 샀어요");
    expect(investorHook(WOOD, c("reduced"))).toContain("줄였어요");
  });

  it("이름을 쓴다 — 그게 이 카드의 후킹이다", () => {
    expect(investorHook(WOOD, c("new"))).toContain("캐시 우드");
  });

  it("`따라 사세요` 류를 쓰지 않는다 (WO 하지 말 것)", () => {
    const banned = /따라|추천|매수하세요|사세요|주목|유망|기회/;
    for (const kind of ["new", "exited", "added", "reduced"]) {
      expect(investorHook(WOOD, c(kind, { multiple: 2.5 })), kind).not.toMatch(banned);
    }
    expect(multiInvestorHook(3)).not.toMatch(banned);
  });
});

describe("보조 줄 — **공시일을 반드시 쓴다** (지연을 숨기지 않는다)", () => {
  const change = {
    kind: "new", ticker: "TTMI", name: "TTM", shares: 420_000, priorShares: 0,
    valueUsd: 47_000_000, weightPct: 1.2,
  } as never;

  it("날짜·주식수·금액·비중이 한 줄씩", () => {
    const lines = investorSupport(WOOD, change, "8월 24일");
    expect(lines[0]).toContain("8월 24일 공시");
    expect(lines[0]).toContain("42만주");
    expect(lines[0]).toContain("$47M");
    expect(lines[1]).toBe("ARK 전체의 1.2%");
  });

  it("없는 값은 줄에서 빠진다 — 0 으로 채우지 않는다", () => {
    const bare = { kind: "new", ticker: "X", name: "X", shares: 0, priorShares: 0 } as never;
    const lines = investorSupport(WOOD, bare, "8월 24일");
    expect(lines).toEqual(["8월 24일 공시"]);
  });

  it("전량 매도는 **직전** 주식 수를 쓴다 — 지금은 0 이다", () => {
    const exited = { kind: "exited", ticker: "ZM", name: "ZOOM", shares: 0, priorShares: 5_000 } as never;
    expect(investorSupport(WOOD, exited, "8월 22일")[0]).toContain("5,000주");
  });
});

describe("신선도 — 소스마다 다르다 (§E-3)", () => {
  it("ARK 는 3일, 13F 는 14일, 의회는 7일", () => {
    expect(INVESTOR_FRESH_DAYS).toEqual({ ark: 3, "13f": 14, congress: 7 });
  });

  it("기간이 지나면 덱에서 뺀다", () => {
    expect(isFreshDisclosure("ark", "2026-08-24", "2026-08-27")).toBe(true);
    expect(isFreshDisclosure("ark", "2026-08-23", "2026-08-27")).toBe(false);
    expect(isFreshDisclosure("13f", "2026-08-14", "2026-08-27")).toBe(true);
  });

  it("날짜를 못 읽거나 미래면 내지 않는다", () => {
    expect(isFreshDisclosure("ark", "언제", "2026-08-27")).toBe(false);
    expect(isFreshDisclosure("ark", "2026-08-28", "2026-08-27")).toBe(false);
  });
});

describe("숫자 표기", () => {
  it("주식 수는 만 단위로 읽는다 — 한국어 화면이다", () => {
    expect(formatShares(420_000)).toBe("42만주");
    expect(formatShares(5_000)).toBe("5,000주");
  });

  it("금액은 $M·$B 로 줄인다", () => {
    expect(formatUsd(47_000_000)).toBe("$47M");
    expect(formatUsd(6_200_000_000)).toBe("$6.2B");
  });
});

/**
 * INFLUENCER-01 — **변화가 없는 날에도 카드가 나와야 한다.**
 *
 * 실측(2026-09-07 프로덕션 수집 로그): ARK 90종목 중 주식 수가 2% 이상 변한 것이 **0개**,
 * 최대 1.6%, 신규·전량매도 0건 → 변화 기반 후보가 매일 0이었다. 레퍼런스가 후킹으로 쓴 것도
 * 변화가 아니라 **비중 그 자체**였다(`$SNDK 28.1%`).
 */
describe("큰 비중 — 변화가 아니라 상태 (C-2)", () => {
  const snapshot = {
    asOf: "2026-09-04",
    holdings: [
      { ticker: "TSLA", name: "TESLA INC", shares: 2_070_000, valueUsd: 780_000_000, weightPct: 7.1 },
      { ticker: "CRCL", name: "CIRCLE", shares: 500_000, valueUsd: 300_000_000, weightPct: 4.9 },
      { ticker: "COIN", name: "COINBASE", shares: 400_000, valueUsd: 250_000_000, weightPct: 4.1 },
      { ticker: "CRSP", name: "CRISPR", shares: 900_000, valueUsd: 120_000_000, weightPct: 3.8 },
      { ticker: "TINY", name: "TINY CO", shares: 100, valueUsd: 1_000, weightPct: 0.1 },
    ],
  };

  it("비중 4% 이상만 후보다 — 3.8% 는 「크게 담았다」로 읽히지 않는다", () => {
    const top = topWeightHoldings(snapshot);
    expect(top.map((t) => t.ticker)).toEqual(["TSLA", "CRCL", "COIN"]);
    expect(top.every((t) => t.kind === "holding")).toBe(true);
  });

  it("비중 순으로 준다", () => {
    expect(topWeightHoldings(snapshot).map((t) => t.weightPct)).toEqual([7.1, 4.9, 4.1]);
  });

  it("변화 카드가 이미 있는 종목은 건너뛴다 — 같은 종목으로 두 장을 만들지 않는다", () => {
    const top = topWeightHoldings(snapshot, { exclude: new Set(["TSLA"]) });
    expect(top.map((t) => t.ticker)).toEqual(["CRCL", "COIN"]);
  });

  it("**신규로 읽히지 않는다** — `priorShares` 를 0 으로 두지 않는다", () => {
    // 0 으로 두면 「처음 샀어요」와 구분이 안 된다(diff 결과와 섞여 흐르므로).
    for (const t of topWeightHoldings(snapshot)) expect(t.priorShares).toBe(t.shares);
  });

  it("스냅샷이 없으면 빈 배열 — 지어내지 않는다", () => {
    expect(topWeightHoldings(null)).toEqual([]);
    expect(topWeightHoldings({ asOf: "2026-09-04", holdings: [] })).toEqual([]);
  });

  it("훅은 **상태**로 말한다 — 「샀어요」로 쓰지 않는다", () => {
    const ark = { id: "cathie-wood", name: "캐시 우드", firm: "ARK", source: "ark" as const };
    const hook = investorHook(ark, topWeightHoldings(snapshot)[0]!);
    expect(hook).toBe("캐시 우드가\n포트폴리오의 7.1%를 이 종목에 담고 있어요");
    expect(hook).not.toContain("샀어요");
    // `따라 사세요` 류는 어디에도 없다(WO 하지 말 것).
    expect(hook).not.toMatch(/따라|사세요|추천|매수/);
  });

  it("보조 줄이 **기준일 보유**라고 밝힌다 — 그날의 매매가 아니다", () => {
    const ark = { id: "cathie-wood", name: "캐시 우드", firm: "ARK", source: "ark" as const };
    const support = investorSupport(ark, topWeightHoldings(snapshot)[0]!, "9월 4일");
    expect(support[0]).toContain("9월 4일 기준 보유");
    expect(support[0]).not.toContain("공시");
    expect(support[1]).toBe("ARK 전체의 7.1%");
  });
});
