import { describe, expect, it } from "vitest";
import { parseOpenInsiderClusterBuys } from "../../lib/insider-source";

function row(cells: string[], tickerHref: string): string {
  const tds = cells.map((c) => `<td>${c}</td>`).join("");
  // 티커 셀은 openinsider 처럼 툴팁 잔여물 + href 형태로 구성.
  const withTicker = tds.replace(
    "<td>__TICKER__</td>",
    `<td><a href="/${tickerHref}" onmouseover="Tip('...', DELAY, 1)" onmouseout="UnTip()">${tickerHref}</a></td>`
  );
  return `<tr>${withTicker}</tr>`;
}

// 열: X, Filing, Trade, Ticker, Company, Industry, Ins, TradeType, Price, Qty, Owned, ΔOwn, Value, 1d, 1w, 1m, 6m
function clusterRow(o: {
  ticker: string; company: string; ins: string; type: string; price: string; delta: string; value: string; filing?: string; trade?: string;
}): string {
  return row(
    ["M", o.filing ?? "2026-06-30 17:06:54", o.trade ?? "2026-06-26", "__TICKER__", o.company, "Industry X", o.ins, o.type, o.price, "+1,000", "10,000", o.delta, o.value, "", "", "", ""],
    o.ticker
  );
}

function table(rows: string[]): string {
  const header =
    "<tr><th>X</th><th>Filing</th><th>Trade</th><th>Ticker</th><th>Company</th><th>Industry</th><th>Ins</th><th>Trade Type</th><th>Price</th><th>Qty</th><th>Owned</th><th>ΔOwn</th><th>Value</th><th>1d</th><th>1w</th><th>1m</th><th>6m</th></tr>";
  return `<html><body><table class="tinytable">${header}${rows.join("")}</table></body></html>`;
}

describe("parseOpenInsiderClusterBuys", () => {
  it("parses cluster purchase rows with ticker, insider count, ownership delta, value", () => {
    const html = table([
      clusterRow({ ticker: "LILA", company: "Liberty Latin America", ins: "5", type: "P - Purchase", price: "$8.90", delta: "+78%", value: "+$140,345,259" }),
    ]);
    const rows = parseOpenInsiderClusterBuys(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      symbol: "LILA",
      companyName: "Liberty Latin America",
      insiderCount: 5,
      buyPrice: 8.9,
      ownershipDeltaPct: 78,
      valueUsd: 140345259,
      filingDate: "2026-06-30",
      tradeDate: "2026-06-26",
    });
  });

  it("drops non-purchases, single-insider rows, and sub-$100k noise", () => {
    const html = table([
      clusterRow({ ticker: "SELL", company: "Sale Co", ins: "3", type: "S - Sale", price: "$5.00", delta: "-10%", value: "-$5,000,000" }),
      clusterRow({ ticker: "SOLO", company: "Solo Co", ins: "1", type: "P - Purchase", price: "$5.00", delta: "+2%", value: "+$1,000,000" }),
      clusterRow({ ticker: "TINY", company: "Tiny Co", ins: "3", type: "P - Purchase", price: "$5.00", delta: "+2%", value: "+$50,000" }),
      clusterRow({ ticker: "GOOD", company: "Good Co", ins: "4", type: "P - Purchase", price: "$5.00", delta: "+9%", value: "+$500,000" }),
    ]);
    const rows = parseOpenInsiderClusterBuys(html);
    expect(rows.map((r) => r.symbol)).toEqual(["GOOD"]);
  });

  it("returns empty when no tinytable present", () => {
    expect(parseOpenInsiderClusterBuys("<html><body>no table</body></html>")).toEqual([]);
  });
});
