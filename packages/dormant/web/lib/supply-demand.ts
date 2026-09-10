import { parseNaverInvestorFlow, type InvestorFlow } from "@fomo/core";

/**
 * 수급 수집(fetch) — 네이버 금융 일별 외국인·기관 순매매. SUPPLY DEMAND SCORE HANDOFF §1.
 *
 * KRX 직접(data.krx.go.kr)은 OTP/세션 필요(LOGOUT) → KRX 확정치를 재공개하는 네이버 금융 사용.
 * frgn.naver 는 EUC-KR 인코딩 → arrayBuffer + TextDecoder('euc-kr'). 파싱은 fomo-core 순수 파서.
 * 실패/차단 시 빈 배열(정직한 폴백 — 가짜 금지). 시점(기준일)은 파서가 각 레코드에 부착.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** 한 종목(코드)의 일별 외국인·기관 순매매(최신순). 실패 시 빈 배열. */
export async function fetchSupplyDemand(code: string, timeoutMs = 15_000): Promise<InvestorFlow[]> {
  try {
    const res = await fetch(`https://finance.naver.com/item/frgn.naver?code=${encodeURIComponent(code)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn("[supply-demand] fetch non-OK", code, res.status);
      return [];
    }
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("euc-kr").decode(buf);
    return parseNaverInvestorFlow(html);
  } catch (err) {
    console.warn("[supply-demand] fetch failed", code, (err as Error)?.message);
    return [];
  }
}
