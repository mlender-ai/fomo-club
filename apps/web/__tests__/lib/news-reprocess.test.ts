import { describe, expect, it } from "vitest";
import {
  ruleReprocessNewsHook,
  validateReprocessedNewsHook,
  type NewsHookInput,
} from "../../lib/news-reprocess";

const base: NewsHookInput = {
  stock: "사운드하운드AI",
  sector: "AI",
  title: "SoundHound AI launches voice commerce platform with Stellantis",
  source: "Yahoo Finance",
  changePct: 11.2,
  asOf: "2026-06-28",
};

describe("news hook reprocessing", () => {
  it("reprocesses a US product/news title into a stock-perspective hook", () => {
    const hook = ruleReprocessNewsHook(base);

    expect(hook).toBe("스텔란티스와 제품 협력에 +11%");
    expect(hook).not.toContain("SoundHound");
    expect(hook).not.toContain("Stellantis");
    expect(hook).not.toContain("Yahoo Finance");
    expect(hook!.length).toBeLessThanOrEqual(44);
  });

  it("reprocesses a Kumho regional-investment headline without pasting the article title", () => {
    const title = "정부 대형투자 발표 예고에 금호타이어·파루 등 호남 관련주 급등";
    const hook = ruleReprocessNewsHook({
      ...base,
      stock: "금호타이어",
      sector: "자동차",
      title,
      source: "한경비즈니스",
    });

    expect(hook).toBe("대규모 투자에 +11%");
    expect(hook).not.toBe(title);
    expect(hook).not.toContain("한경비즈니스");
  });

  it("does not promote generic title shells", () => {
    expect(ruleReprocessNewsHook({ ...base, title: "제품·AI 인프라 소식이 나왔어요." })).toBeUndefined();
    expect(ruleReprocessNewsHook({ ...base, title: "소식이 나왔어요." })).toBeUndefined();
  });

  it("turns concrete US material titles into Korean rule hooks", () => {
    expect(
      ruleReprocessNewsHook({
        ...base,
        stock: "디웨이브퀀텀",
        title: "D-Wave Quantum Announces New Partnership With Aerospace Customer",
      })
    ).toBe("항공우주 고객과 제휴 발표에 +11%");
    expect(
      ruleReprocessNewsHook({
        ...base,
        title: "SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance",
      })
    ).toBe("1분기 실적 발표에 +11%");
  });

  it("localizes English counterparties instead of leaking fragments into Korean", () => {
    const hook = ruleReprocessNewsHook({
      ...base,
      stock: "NN Inc.",
      sector: "산업재",
      title: "NN, Inc. Awarded Contract From its NVIDIA Product Partner",
      changePct: 97.58,
    });

    expect(hook).toBeDefined();
    expect(hook).toContain("엔비디아");
    expect(hook).toContain("+98%");
    expect(hook).not.toMatch(/\bits\b|NVIDIA|Can와/i);
  });

  it("rejects English stopword fragments as counterparties", () => {
    expect(
      ruleReprocessNewsHook({
        ...base,
        stock: "스노우플레이크",
        title: "Snowflake (SNOW) Down 5.1% Since Last Earnings Report: Can It Rebound",
      })
    ).toBeUndefined();
  });

  it("extracts concrete Korean hooks from common US material headlines", () => {
    const cases: Array<[Partial<NewsHookInput>, string]> = [
      [
        {
          stock: "아이온큐",
          title: "IonQ (IONQ) Launches Clavis XG Multiplex For Quantum Security On Metro Fiber",
          changePct: 5.4,
        },
        "클라비스 XG 출시에 +5.4%",
      ],
      [
        {
          stock: "로켓랩",
          title: "Rocket Lab enters satellite communications market with $8-billion deal",
          summary: "Rocket Lab will acquire Iridium's commercial IoT business for $8 billion.",
          changePct: 9.2,
        },
        "이리듐 IoT 사업 8십억달러 인수 발표에 +9.2%",
      ],
      [
        {
          stock: "뉴스케일파워",
          title: "NuScale Power (SMR) Secures Paragon Contract As SMR Rollout Gets More Real",
          changePct: 12.8,
        },
        "파라곤 공급계약 체결에 +13%",
      ],
      [
        {
          stock: "크라우드스트라이크",
          title: "CrowdStrike Extends Falcon AIDR to Secure AI Agents and Data",
          changePct: 4.1,
        },
        "팔콘 AIDR 제품 확장에 +4.1%",
      ],
      [
        {
          stock: "마벨테크놀로지",
          title: "Amazon External Trainium Chip Sales Put Marvell in Focus",
          changePct: 3.7,
        },
        "트레이니움 칩 판매 이슈에 +3.7%",
      ],
      [
        {
          stock: "업스타트",
          title: "Renewed Funding And Securitization Might Change The Case For Investing In Upstart Holdings (UPST)",
          summary:
            "Upstart Holdings renewed its forward-flow agreement with Neuberger Specialty Finance, paving the way for funds it manages to buy up to US$600,000,000 of consumer loans.",
          changePct: 2.4,
        },
        "600백만달러 소비자대출 유동화에 +2.4%",
      ],
      [
        {
          stock: "마이크론",
          title: "Micron Wobbles. Are Memory-Chip Makers Illegally Price-Gouging Customers",
          summary:
            "Micron stock wavered Monday on news of a federal civil antitrust lawsuit accusing it and two other memory-chip makers of price-fixing.",
          changePct: -1.3,
        },
        "가격담합 소송 제기에 -1.3%",
      ],
      [
        {
          stock: "블룸에너지",
          title: "Brookfield Expands Bloom Energy AI Power Partnership to $25 Billion",
          changePct: 10.069,
        },
        "브룩필드 AI 전력 파트너십 25십억달러 확대에 +10%",
      ],
      [
        {
          stock: "조비에비에이션",
          title: "Joby Aviation and Toyota form joint venture for air taxi production",
          changePct: 3.36,
        },
        "토요타와 에어택시 합작사 설립에 +3.4%",
      ],
      [
        {
          stock: "HPE",
          title: "ScanSource Announces Expansion of HPE Networking Partnership to Include HPE Juniper Networking",
          changePct: 1.57,
        },
        "스캔소스 주니퍼 네트워킹 파트너십 확대에 +1.6%",
      ],
      [
        {
          stock: "IBM",
          title: "International Business Machines (IBM) Unveils World’s First 0.7-Nanometer Semiconductor Tech",
          changePct: 1.15,
        },
        "0.7나노 반도체 기술 공개에 +1.1%",
      ],
    ];

    for (const [input, expected] of cases) {
      expect(ruleReprocessNewsHook({ ...base, ...input })).toBe(expected);
    }
  });

  it("does not promote broad market-question headlines just to increase US card count", () => {
    expect(
      ruleReprocessNewsHook({
        ...base,
        stock: "KLA",
        title: "Can KLA Corporation (KLAC) Capture Its Share of a $250 Billion Global Chip Equipment Market?",
        changePct: 8.377,
      })
    ).toBeUndefined();
  });

  it("keeps bundle articles out of single-stock headlines", () => {
    expect(
      ruleReprocessNewsHook({
        ...base,
        stock: "INVO Fertility Inc.",
        title: "SHPH, ILLR, IVF: Why These Stocks Posted Double-Digit Gains After-Hours Today",
        changePct: 97.58,
      })
    ).toBeUndefined();
  });

  it("rejects abstract template fillers instead of letting them reach the card", () => {
    expect(validateReprocessedNewsHook("계약 재료가 새로 확인됐어요", base)).toBeUndefined();
    expect(validateReprocessedNewsHook("직접 재료가 붙었어요", base)).toBeUndefined();
    expect(validateReprocessedNewsHook("소식에 반응", base)).toBeUndefined();
    expect(validateReprocessedNewsHook("NIO Stock Eyes June Delivery", base)).toBeUndefined();
  });

  it("rejects source names, raw-title paste, forbidden advice, and added numbers", () => {
    expect(validateReprocessedNewsHook("Yahoo Finance 제품 소식", base)).toBeUndefined();
    expect(validateReprocessedNewsHook(base.title, base)).toBeUndefined();
    expect(validateReprocessedNewsHook("지금 매수 기회", base)).toBeUndefined();
    expect(validateReprocessedNewsHook("매출 99% 성장 확인", base)).toBeUndefined();
  });
});
