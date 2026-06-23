import { describe, expect, it } from "vitest";

import { parseNaverCompanyResearchHtml } from "../../lib/fomo-news-sources";

const html = `
<table>
  <tr>
    <td>
      <a href="/item/main.naver?code=005930" title="삼성전자" class="stock_item">삼성전자</a>
    </td>
    <td>
      <a href="company_read.naver?nid=93658&page=1">중기 주가 상승세 유지 예상</a>
    </td>
    <td>하나증권</td>
    <td class="file"><a href="https://stock.pstatic.net/stock-research/company/93658.pdf">PDF</a></td>
    <td class="date">26.06.23</td>
  </tr>
  <tr>
    <td>
      <a href="/item/main.naver?code=000660" title="SK하이닉스" class="stock_item">SK하이닉스</a>
    </td>
    <td>
      <a href="company_read.naver?nid=93659&page=1">HBM 수요 점검</a>
    </td>
    <td>신한투자증권</td>
    <td class="file"></td>
    <td class="date">26.06.22</td>
  </tr>
</table>
`;

describe("parseNaverCompanyResearchHtml", () => {
  it("종목코드로 좁힌 증권사 리서치 리포트를 원문 근거 기사로 정규화한다", () => {
    const out = parseNaverCompanyResearchHtml(html, {
      code: "005930",
      stock: "삼성전자",
      nowIso: "2026-06-23T00:00:00.000Z",
      limit: 6,
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "중기 주가 상승세 유지 예상",
      url: "https://stock.pstatic.net/stock-research/company/93658.pdf",
      source: "하나증권 리서치",
      category: "리서치",
      summary: "삼성전자 종목 리포트 · 하나증권 · 26.06.23",
      tier: "news-mid",
      lang: "ko",
    });
    expect(out[0]!.publishedAt).toBe("2026-06-23T00:00:00.000Z");
  });

  it("일치하지 않는 종목 리포트는 섞지 않는다", () => {
    const out = parseNaverCompanyResearchHtml(html, {
      code: "005930",
      stock: "삼성전기",
      nowIso: "2026-06-23T00:00:00.000Z",
    });

    expect(out).toEqual([]);
  });
});
