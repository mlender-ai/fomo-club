import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  mergeThirteenF,
  thirteenFInvestorIds,
  MAX_HOLDINGS_PER_INVESTOR,
  MAX_INVESTORS_PER_REQUEST,
} from "../../lib/thirteenf-ingest";
import type { InvestorCollection } from "../../lib/investor-collect";

/**
 * LAUNCH-P1 §C-3 — **밖에서 우리 저장소에 쓰는 경로**를 검사한다.
 *
 * 지시서가 못을 박았다 — *"과거에 크론 라우트가 무인증으로 열려 있던 적이 있다.
 * 같은 일을 반복하지 않는다."* 인증은 라우트가 하고, **무엇을 받아들이는지**는 여기서 막는다.
 */

const snapshot = (asOf: string, ticker: string, shares = 100) => ({
  asOf,
  holdings: [{ ticker, name: `${ticker} INC`, shares, valueUsd: 1_000, weightPct: 4.2 }],
});

const previous: InvestorCollection = {
  asOf: "2026-09-07",
  byInvestor: {
    // ARK 는 매일 도는 수집이 채운다 — 이 창구가 지울 수 없어야 한다.
    "cathie-wood": { latest: snapshot("2026-09-05", "TSLA"), prior: snapshot("2026-08-29", "TSLA"), history: [] },
  },
  errors: ["ark: 어제 오류 기록"],
};

describe("13F 받는 창구 — 무엇을 받아들이나", () => {
  it("13F 인물만 받는다 — ARK 칸을 밖에서 덮어쓸 수 없다", () => {
    const result = mergeThirteenF(
      { byInvestor: { "cathie-wood": { latest: snapshot("2026-09-08", "EVIL"), prior: null } } },
      previous,
      "2026-09-08"
    );
    expect(result.accepted).toBe(0);
    expect(result.merged).toBeNull();
    expect(result.rejected[0]).toEqual({ id: "cathie-wood", reason: "13F 인물이 아니다" });
  });

  it("모르는 id 는 받지 않는다", () => {
    const result = mergeThirteenF(
      { byInvestor: { "someone-else": { latest: snapshot("2026-09-08", "AAPL"), prior: null } } },
      previous,
      "2026-09-08"
    );
    expect(result.accepted).toBe(0);
    expect(thirteenFInvestorIds().has("warren-buffett")).toBe(true);
    expect(thirteenFInvestorIds().has("cathie-wood")).toBe(false);
  });

  it("받아들인 13F 는 저장하고, ARK 칸과 오류 이력은 그대로 둔다", () => {
    const result = mergeThirteenF(
      { byInvestor: { "warren-buffett": { latest: snapshot("2026-08-14", "AAPL"), prior: snapshot("2026-05-15", "AAPL"), unresolved: 3 } } },
      previous,
      "2026-09-08"
    );
    expect(result.accepted).toBe(1);
    expect(result.merged!.byInvestor["cathie-wood"]).toBeDefined();
    expect(result.merged!.byInvestor["warren-buffett"]!.latest.asOf).toBe("2026-08-14");
    expect(result.merged!.byInvestor["warren-buffett"]!.unresolved).toBe(3);
    expect(result.merged!.errors).toEqual(["ark: 어제 오류 기록"]);
    expect(result.merged!.asOf).toBe("2026-09-08");
    expect(result.byInvestor["warren-buffett"]).toEqual({ asOf: "2026-08-14", holdings: 1, hasPrior: true });
  });

  it("공시일이 없으면 받지 않는다 — 화면이 날짜를 못 쓰면 지연을 숨기는 셈이다", () => {
    for (const asOf of ["", "2026-8-14", "어제", "2026-08-14T00:00:00Z"]) {
      const result = mergeThirteenF(
        { byInvestor: { "warren-buffett": { latest: { asOf, holdings: [{ ticker: "AAPL", name: "A", shares: 1 }] } } } },
        previous,
        "2026-09-08"
      );
      expect(result.accepted, asOf).toBe(0);
    }
  });

  it("티커 없는 보유는 버린다 — 어느 종목인지 모르면 카드를 만들 수 없다", () => {
    const result = mergeThirteenF(
      {
        byInvestor: {
          "bill-ackman": {
            latest: {
              asOf: "2026-08-14",
              holdings: [
                { ticker: "", name: "미해석", shares: 10 },
                { ticker: "CMG", name: "CHIPOTLE", shares: 20 },
                { ticker: "TOO-LONG-TICKER-X", name: "이상", shares: 5 },
                { ticker: "QSR", name: "RBI", shares: -1 },
              ],
            },
            prior: null,
          },
        },
      },
      previous,
      "2026-09-08"
    );
    expect(result.merged!.byInvestor["bill-ackman"]!.latest.holdings.map((h) => h.ticker)).toEqual(["CMG"]);
  });

  it("보유가 전부 버려지면 그 인물을 받지 않는다 — 빈 스냅샷을 저장하지 않는다", () => {
    const result = mergeThirteenF(
      { byInvestor: { "bill-ackman": { latest: { asOf: "2026-08-14", holdings: [{ name: "티커 없음", shares: 1 }] }, prior: null } } },
      previous,
      "2026-09-08"
    );
    expect(result.accepted).toBe(0);
    expect(result.rejected[0]!.reason).toContain("티커");
  });

  it("크기를 자른다 — 무한 payload 를 저장하지 않는다", () => {
    const many = Array.from({ length: MAX_HOLDINGS_PER_INVESTOR + 50 }, (_, i) => ({
      ticker: `T${i}`, name: `N${i}`, shares: 1,
    }));
    const result = mergeThirteenF(
      { byInvestor: { "michael-burry": { latest: { asOf: "2026-08-14", holdings: many }, prior: null } } },
      previous,
      "2026-09-08"
    );
    expect(result.merged!.byInvestor["michael-burry"]!.latest.holdings.length).toBe(MAX_HOLDINGS_PER_INVESTOR);
    expect(MAX_INVESTORS_PER_REQUEST).toBe(20);
  });

  it("빈 payload 로는 아무것도 쓰지 않는다 — 덮으면 그날 인물 카드가 사라진다", () => {
    for (const body of [null, {}, { byInvestor: null }, { byInvestor: {} }]) {
      expect(mergeThirteenF(body, previous, "2026-09-08").merged).toBeNull();
    }
  });
});

describe("쓰기 창구의 인증 (LAUNCH-P1 완료 확인 11)", () => {
  const routeSrc = readFileSync(new URL("../../app/api/fomo/cron/investors/thirteenf/route.ts", import.meta.url), "utf8");
  /**
   * 금지 패턴 검사는 **주석을 지운 뒤** 한다 — 이 파일의 문서 주석이 「쓰면 안 되는 패턴」을
   * 인용해 설명하고 있고, 그 인용이 위반으로 잡히면 규칙을 적을 수 없게 된다.
   */
  const route = routeSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /**
   * **읽기 크론의 관행을 그대로 쓰면 안 된다.** 거기서는 `!secret ||` 로 환경변수가 없을 때
   * 통과시키는데, 쓰기에서는 그게 공개 쓰기가 된다.
   */
  it("비밀값이 없으면 거부한다 — `!secret ||` 패턴을 쓰지 않는다", () => {
    expect(route).toContain("if (!expected) return false;");
    expect(route).not.toMatch(/return\s+!secret\s*\|\|/);
    expect(route).toContain("timingSafeEqual");
  });

  it("GET 도 인증을 요구한다 — 창구 존재만으로 정보를 주지 않는다", () => {
    const getBody = route.slice(route.indexOf("export function GET"), route.indexOf("export async function POST"));
    expect(getBody).toContain("if (!authorized(request))");
  });

  it("POST 가 첫 줄에서 인증한다", () => {
    const postBody = route.slice(route.indexOf("export async function POST"));
    expect(postBody.indexOf("authorized(request)")).toBeLessThan(postBody.indexOf("request.json()"));
  });

  it("수집 스크립트도 인증 없이 POST 하지 않는다", () => {
    const script = readFileSync(new URL("../../../../scripts/collect-thirteenf.ts", import.meta.url), "utf8");
    expect(script).toContain("INGEST_URL 과 CRON_SECRET 이 둘 다 필요하다");
    expect(script).toContain("authorization: `Bearer ${secret!}`");
  });
});

/**
 * LAUNCH-P2 — **본문 읽기가 예산을 못 받으면 코드가 있어도 0% 로 남는다.**
 * 목록 훑기에서 몫을 미리 떼어 두는 배선을 코드 모양으로 지킨다.
 */
describe("공시 본문 읽기 예산 (LAUNCH-P2 §B)", () => {
  const collect = readFileSync(new URL("../../lib/disclosure-collect.ts", import.meta.url), "utf8");

  it("목록 훑기에 예산을 다 주지 않는다 — 본문 몫을 미리 뗀다", () => {
    expect(collect).toContain("const listDeadline = deadline - BODY_RESERVE_MS;");
    expect(collect).toContain("collectKr(dates, listDeadline");
    expect(collect).toContain("collectUs(shiftIso(today, -lookback), listDeadline");
  });

  it("숫자가 있을 서식만 읽는다 — 나머지는 왕복할 이유가 없다", () => {
    expect(collect).toContain("amountLabelsFor(item.title) !== null || EARNINGS_BODY_FORM.test");
    // 읽어본 것은 다시 읽지 않는다(본문은 확정된 문서다).
    expect(collect).toContain("if (item.bodyRead) return false;");
  });

  it("실패를 삼키지 않고 센다 — 「금액 서식인데 못 뽑음」이 다음 작업 목록이다", () => {
    expect(collect).toContain("census.amountMissed += 1;");
    expect(collect).toContain("census.failed += 1;");
  });
});
