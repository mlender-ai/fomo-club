import { describe, it, expect } from "vitest";
import { parseThirteenF } from "../../lib/investor-collect";

/**
 * 제출자마다 13F XML 모양이 다르다. **접두를 안 받으면 그 제출자는 통째로 사라진다** —
 * 실측(2026-08-27): 서드포인트·바우포스트가 「13F 없음」이었는데 목록에는 멀쩡히 있었다.
 */
const PLAIN = `<informationTable>
  <infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><cusip>037833100</cusip>
    <value>1000</value><shrsOrPrnAmt><sshPrnamt>10</sshPrnamt></shrsOrPrnAmt></infoTable>
</informationTable>`;

const PREFIXED = `<ns1:informationTable xmlns:ns1="x">
  <ns1:infoTable><ns1:nameOfIssuer>ALPHABET INC</ns1:nameOfIssuer><ns1:cusip>02079K305</ns1:cusip>
    <ns1:value>2000</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>20</ns1:sshPrnamt></ns1:shrsOrPrnAmt></ns1:infoTable>
</ns1:informationTable>`;

const resolve = (cusip: string) => ({ "037833100": "AAPL", "02079K305": "GOOG" })[cusip];

describe("13F 파싱 — 네임스페이스 접두를 받는다", () => {
  it("접두 없는 제출자(버크셔 모양)", () => {
    expect(parseThirteenF(PLAIN, resolve).holdings.map((h) => h.ticker)).toEqual(["AAPL"]);
  });

  it("접두 있는 제출자(서드포인트 모양) — 이게 안 돼서 통째로 사라졌었다", () => {
    const out = parseThirteenF(PREFIXED, resolve);
    expect(out.holdings.map((h) => h.ticker)).toEqual(["GOOG"]);
    expect(out.holdings[0]!.shares).toBe(20);
  });

  it("티커를 못 찾은 보유는 **버리고 센다** — 추측하지 않는다", () => {
    const out = parseThirteenF(PLAIN, () => undefined);
    expect(out.holdings).toEqual([]);
    expect(out.unresolved).toBe(1);
  });

  it("같은 티커가 여러 행이면 합친다 — 매니저별로 나뉘어 온다", () => {
    const doubled = PLAIN.replace("</informationTable>", PLAIN.slice(PLAIN.indexOf("<infoTable>"), PLAIN.indexOf("</informationTable>")) + "</informationTable>");
    const out = parseThirteenF(doubled, resolve);
    expect(out.holdings).toHaveLength(1);
    expect(out.holdings[0]!.shares).toBe(20);
  });

  it("비중은 합계로 다시 낸다 — 합이 100%가 된다", () => {
    const both = PLAIN.replace("</informationTable>", PREFIXED.slice(PREFIXED.indexOf("<ns1:infoTable>"), PREFIXED.indexOf("</ns1:informationTable>")) + "</informationTable>");
    const out = parseThirteenF(both, resolve);
    const sum = out.holdings.reduce((s, h) => s + (h.weightPct ?? 0), 0);
    expect(Math.round(sum)).toBe(100);
  });
});
