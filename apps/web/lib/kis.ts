import { parseKisInvestorFlow, type InvestorFlow } from "@fomo/core";

/**
 * 한국투자증권(KIS) Open API — 투자자 매매동향(개인·외국인·기관). SUPPLY DEMAND 정밀화(②).
 *
 * 네이버는 외국인·기관 수량만 → KIS 로 개인까지 확보. 무료(앱키 발급), OAuth 토큰 24h.
 * 키(KIS_APP_KEY/SECRET) 없으면 전부 null 반환 → 호출부가 네이버로 폴백(안전).
 *
 * ⚠️ 앱키 발급 후 할 일(딱 1가지): 실제 응답 1회 찍어 packages/fomo-core/supply-demand.ts 의
 *    parseKisInvestorFlow 필드명(stck_bsop_date / prsn·frgn·orgn_ntby_qty)만 맞추면 끝.
 */
const KIS_BASE = process.env.KIS_BASE_URL || "https://openapi.koreainvestment.com:9443";
const TR_INVESTOR = "FHKST01010900"; // 주식현재가 투자자

let cachedToken: { token: string; expiresAt: number } | null = null;

/** 키가 설정돼 있으면 KIS 경로 활성. */
export function kisEnabled(): boolean {
  return !!(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET);
}

/** 접근토큰(24h) 발급·캐시. 키 없거나 실패 시 null. */
async function getToken(): Promise<string | null> {
  if (!kisEnabled()) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  try {
    const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[kis] token non-OK", res.status);
      return null;
    }
    const d = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!d.access_token) return null;
    // 만료 10분 전까지 재사용.
    cachedToken = { token: d.access_token, expiresAt: Date.now() + ((d.expires_in ?? 86400) - 600) * 1000 };
    return cachedToken.token;
  } catch (err) {
    console.warn("[kis] token failed", (err as Error)?.message);
    return null;
  }
}

/** 한 종목의 투자자 매매동향(개인 포함). 키 없음/실패 시 null → 네이버 폴백. */
export async function fetchKisInvestorFlow(code: string): Promise<InvestorFlow | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const url =
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`;
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APP_KEY!,
        appsecret: process.env.KIS_APP_SECRET!,
        tr_id: TR_INVESTOR,
        custtype: "P",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[kis] investor non-OK", code, res.status);
      return null;
    }
    const d = (await res.json()) as { output?: Record<string, unknown>[] };
    return parseKisInvestorFlow(d.output?.[0]); // 최신 영업일 행
  } catch (err) {
    console.warn("[kis] investor failed", code, (err as Error)?.message);
    return null;
  }
}
