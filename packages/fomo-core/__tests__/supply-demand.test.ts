import { describe, expect, it } from "vitest";
import {
  parseNaverInvestorFlow,
  latestInvestorFlow,
  supplyDemandFact,
  parseKisInvestorFlow,
} from "../src/supply-demand";

// 네이버 frgn.naver 실제 행 구조(2행) — 날짜·종가·전일비·등락률·거래량·기관·외국인·보유주수·보유율.
// 기관/외국인만 부호(+/-) 동반. 등락률(+1.02%)은 % 라 순매매로 안 잡혀야 한다.
const HTML = `
<table>
<tr onmouseover="x">
  <td><span class="tah p10 gray03">2026.06.17</span></td>
  <td><span class="tah p11">346,500</span></td>
  <td><span class="tah p11 red02">3,500</span></td>
  <td><span class="tah p11 red01">+1.02%</span></td>
  <td><span class="tah p11">18,134,051</span></td>
  <td><span class="tah p11 red01">+1,133,803</span></td>
  <td><span class="tah p11 nv01">-2,000,080</span></td>
  <td><span class="tah p11">2,780,810,260</span></td>
  <td><span class="tah p11">47.57%</span></td>
</tr>
<tr onmouseover="x">
  <td><span class="tah p10 gray03">2026.06.16</span></td>
  <td><span class="tah p11">343,000</span></td>
  <td><span class="tah p11 nv02">1,000</span></td>
  <td><span class="tah p11 nv01">-0.29%</span></td>
  <td><span class="tah p11">15,000,000</span></td>
  <td><span class="tah p11 nv01">-500,000</span></td>
  <td><span class="tah p11 red01">+1,200,000</span></td>
  <td><span class="tah p11">2,778,000,000</span></td>
  <td><span class="tah p11">47.50%</span></td>
</tr>
</table>`;

describe("parseNaverInvestorFlow — 일별 외국인·기관 순매매(시점 명시)", () => {
  it("기관·외국인 순매매를 부호 그대로 파싱, 등락률은 제외", () => {
    const flows = parseNaverInvestorFlow(HTML);
    expect(flows).toHaveLength(2);
    expect(flows[0]).toEqual({ date: "2026-06-17", institutionNet: 1_133_803, foreignNet: -2_000_080 });
    expect(flows[1]).toEqual({ date: "2026-06-16", institutionNet: -500_000, foreignNet: 1_200_000 });
  });

  it("기준일(date)이 항상 부착된다 (point-in-time 원칙)", () => {
    for (const f of parseNaverInvestorFlow(HTML)) {
      expect(f.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("빈/깨진 HTML → 빈 배열(가짜 금지)", () => {
    expect(parseNaverInvestorFlow("")).toEqual([]);
    expect(parseNaverInvestorFlow("<table><tr><td>no data</td></tr></table>")).toEqual([]);
  });

  it("결정적 — 같은 입력 같은 출력", () => {
    expect(parseNaverInvestorFlow(HTML)).toEqual(parseNaverInvestorFlow(HTML));
  });
});

describe("latestInvestorFlow", () => {
  it("가장 최근 거래일을 고른다", () => {
    expect(latestInvestorFlow(parseNaverInvestorFlow(HTML))?.date).toBe("2026-06-17");
  });
  it("빈 입력 → null", () => {
    expect(latestInvestorFlow([])).toBeNull();
  });
});

describe("supplyDemandFact — 객관 사실 + 기준일, 조언 금지(§4)", () => {
  it("방향과 기준일을 사실로 표기", () => {
    const f = supplyDemandFact({ date: "2026-06-17", foreignNet: -2_000_080, institutionNet: 1_133_803 });
    expect(f.label).toContain("외국인 순매도");
    expect(f.label).toContain("기관 순매수");
    expect(f.label).toContain("6/17 장마감");
    expect(f.source).toContain("KRX");
  });
  it("조언·단정 어휘가 없다(규제선)", () => {
    const f = supplyDemandFact({ date: "2026-06-16", foreignNet: 500, institutionNet: -700 });
    const text = `${f.label} ${f.detail ?? ""}`;
    expect(text).not.toMatch(/사세요|파세요|매수하|매도하|추천|위험하다|사라|팔아라|오를|내릴|급등|폭락/);
  });
  it("보합(0)도 정직하게", () => {
    const f = supplyDemandFact({ date: "2026-06-15", foreignNet: 0, institutionNet: 0 });
    expect(f.label).toContain("외국인 보합");
    expect(f.label).toContain("기관 보합");
  });
});

describe("parseKisInvestorFlow — KIS 투자자 매매동향(개인 포함, best-guess 필드)", () => {
  it("개인·외국인·기관 순매매를 파싱하고 기준일 부착", () => {
    const row = {
      stck_bsop_date: "20260618",
      frgn_ntby_qty: "2424675",
      orgn_ntby_qty: "1943262",
      prsn_ntby_qty: "-4367937",
    };
    const f = parseKisInvestorFlow(row);
    expect(f).not.toBeNull();
    expect(f!.date).toBe("2026-06-18");
    expect(f!.foreignNet).toBe(2424675);
    expect(f!.institutionNet).toBe(1943262);
    expect(f!.individualNet).toBe(-4367937);
  });
  it("필드 누락/형식 이상 → null(네이버 폴백 유지)", () => {
    expect(parseKisInvestorFlow(null)).toBeNull();
    expect(parseKisInvestorFlow({})).toBeNull();
    expect(parseKisInvestorFlow({ stck_bsop_date: "20260618", frgn_ntby_qty: "x" })).toBeNull();
  });
});

describe("supplyDemandFact — 개인 데이터 있으면 함께 표기(KIS)", () => {
  it("개인 포함 시 라벨에 개인 방향 추가 + 출처 KIS", () => {
    const f = supplyDemandFact({ date: "2026-06-18", foreignNet: 100, institutionNet: -50, individualNet: -30 });
    expect(f.label).toContain("개인 순매도");
    expect(f.source).toContain("KIS");
  });
  it("개인 없으면(네이버) 외인·기관만 + 출처 네이버", () => {
    const f = supplyDemandFact({ date: "2026-06-18", foreignNet: 100, institutionNet: -50 });
    expect(f.label).not.toContain("개인");
    expect(f.source).toContain("네이버");
  });
});
