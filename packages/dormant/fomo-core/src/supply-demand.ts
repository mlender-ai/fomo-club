/**
 * 수급(투자자별 순매매) — 네이버 금융 일별 외국인·기관 순매매 파서(순수). SUPPLY DEMAND SCORE HANDOFF.
 *
 * ⚠️ 시점(point-in-time) 원칙(§0): 이 데이터는 **장 마감 확정 일별** 수급이다(실시간 장중 아님).
 *   각 레코드에 기준일(date)을 반드시 부착한다 — "오늘 수급"인 척 금지(정직 원칙).
 *
 * 소스: finance.naver.com/item/frgn.naver (KRX 확정치 재공개). 컬럼 순서:
 *   날짜 · 종가 · 전일비 · 등락률 · 거래량 · [기관 순매매] · [외국인 순매매] · 외국인보유주수 · 외국인보유율
 *   순매매 두 칸만 부호(+/-)가 붙어 구분된다(나머지 숫자는 무부호, 등락률은 % 동반).
 *
 * 네트워크·DB 0 (순수). fetch/저장은 apps/web 레이어가 담당. 데이터 없으면 빈 배열(가짜 금지).
 */

export interface InvestorFlow {
  /** 기준일 "YYYY-MM-DD" (장 마감 확정 거래일). */
  date: string;
  /** 외국인 순매매량(주식 수, +매수 / -매도). */
  foreignNet: number;
  /** 기관 순매매량(주식 수, +매수 / -매도). */
  institutionNet: number;
  /** 개인 순매매량(주식 수, +매수 / -매도). 네이버는 미제공(undefined), KIS Open API 는 제공. */
  individualNet?: number;
}

/** 부호 붙은 정수만(콤마 제거). 등락률(+1.02%)은 % 동반이라 매칭되지 않는다. */
const SIGNED_INT = />\s*([+-][\d,]+)\s*<\/span>/g;

/**
 * 네이버 frgn.naver HTML → 일별 투자자 순매매(최신순). 파싱 실패/형식 변경 시 빈 배열.
 * 날짜 마커(gray03)로 행을 자르고, 각 행의 부호 정수 2개를 [기관, 외국인] 순서로 읽는다.
 */
export function parseNaverInvestorFlow(html: string): InvestorFlow[] {
  if (!html) return [];
  const out: InvestorFlow[] = [];
  // 날짜 셀(class="tah p10 gray03")을 기준으로 행 분할 — 각 조각이 하루치.
  const chunks = html.split(/class="tah p10 gray03"/).slice(1);
  for (const chunk of chunks) {
    const d = chunk.match(/>\s*(\d{4})\.(\d{2})\.(\d{2})/);
    if (!d) continue;
    const date = `${d[1]}-${d[2]}-${d[3]}`;
    const signed = [...chunk.matchAll(SIGNED_INT)].map((m) => Number(m[1]!.replace(/,/g, "")));
    if (signed.length < 2 || signed.some((n) => !Number.isFinite(n))) continue;
    // 컬럼 순서상 첫 부호값=기관, 둘째=외국인.
    out.push({ date, institutionNet: signed[0]!, foreignNet: signed[1]! });
  }
  return out;
}

/** YYYYMMDD → YYYY-MM-DD. */
function dashDate(yyyymmdd: string): string {
  return /^\d{8}$/.test(yyyymmdd)
    ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
    : yyyymmdd;
}

/**
 * KIS '주식현재가 투자자'(tr_id FHKST01010900) output 한 행 → InvestorFlow. 순수.
 * KIS 는 개인까지 제공(네이버 한계 보완). 매일 cron 호출로 일별 누적.
 *
 * ⚠️ 필드명(stck_bsop_date / prsn·frgn·orgn _ntby_qty)은 KIS 명세 기준 **best-guess**.
 *    앱키 발급 후 실제 응답 1회로 최종 확정 필요(아래 키만 맞추면 됨). 못 맞으면 null → 네이버 폴백 유지.
 */
export function parseKisInvestorFlow(
  row: Record<string, unknown> | null | undefined
): InvestorFlow | null {
  if (!row) return null;
  const num = (v: unknown) => Number(String(v ?? "").replace(/,/g, ""));
  const date = dashDate(String(row["stck_bsop_date"] ?? "")); // TODO(키): 영업일자 필드 확인
  const foreignNet = num(row["frgn_ntby_qty"]); // TODO(키): 외국인 순매수량
  const institutionNet = num(row["orgn_ntby_qty"]); // TODO(키): 기관 순매수량
  const individualNet = num(row["prsn_ntby_qty"]); // TODO(키): 개인 순매수량
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (![foreignNet, institutionNet, individualNet].every(Number.isFinite)) return null;
  return { date, foreignNet, institutionNet, individualNet };
}

/** 가장 최근(장 마감 확정) 1거래일 수급. 없으면 null(정직한 빈 값). */
export function latestInvestorFlow(flows: readonly InvestorFlow[]): InvestorFlow | null {
  if (flows.length === 0) return null;
  // date 내림차순 정렬 후 최신.
  return [...flows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0]!;
}

/** 연속 순매수/순매도 일수(최신일부터, 같은 부호가 이어지는 길이). 순매수=+, 순매도=−, 보합/없음=0. */
export interface InvestorStreak {
  /** 외국인 연속 일수(+순매수/−순매도). */
  foreign: number;
  /** 기관 연속 일수(+순매수/−순매도). */
  institution: number;
}

function streakOf(sortedDescNets: number[]): number {
  const first = sortedDescNets.find((n) => n !== 0);
  if (first === undefined) return 0;
  const dir = first > 0 ? 1 : -1;
  let n = 0;
  for (const net of sortedDescNets) {
    if (net === 0) break; // 보합이면 연속 끊김
    if (Math.sign(net) !== dir) break;
    n++;
  }
  return dir * n;
}

/**
 * 일별 수급 → 외국인·기관 연속 순매수/순매도 일수(사회적 증거 레버용). 최신일부터 같은 방향이 이어지는 길이.
 * 데이터가 적으면(누적 전) 그만큼만 — 정직(환각 금지). 결정적.
 */
export function investorNetStreak(flows: readonly InvestorFlow[]): InvestorStreak {
  const desc = [...flows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    foreign: streakOf(desc.map((f) => f.foreignNet)),
    institution: streakOf(desc.map((f) => f.institutionNet)),
  };
}

import type { OfficialFact } from "./theme-understanding/types";

function netDirection(net: number): string {
  return net > 0 ? "순매수" : net < 0 ? "순매도" : "보합";
}
function fmtShares(net: number): string {
  const abs = Math.abs(net);
  if (abs >= 10_000) return `${Math.round(abs / 10_000).toLocaleString("en-US")}만주`;
  return `${abs.toLocaleString("en-US")}주`;
}

/**
 * 수급 → 공식 지표 카드(객관 사실 + 기준일). SUPPLY DEMAND SCORE HANDOFF §4.
 * ✅ 사실만: "외국인 순매도 · 기관 순매수 (6/17 장마감)". 방향과 시점을 정직하게.
 * ❌ 해석·조언 금지(사라/팔아라/위험 등) — 판단은 유저. 강세/약세 단정 안 함.
 */
export function supplyDemandFact(flow: InvestorFlow): OfficialFact {
  const [, m, d] = flow.date.split("-");
  const md = `${Number(m)}/${Number(d)}`;
  // 개인은 데이터가 있을 때만(KIS). 네이버 경로는 외국인·기관만.
  const indivLabel = flow.individualNet !== undefined ? ` · 개인 ${netDirection(flow.individualNet)}` : "";
  const indivDetail =
    flow.individualNet !== undefined
      ? `, 개인 ${fmtShares(flow.individualNet)} ${netDirection(flow.individualNet)}`
      : "";
  return {
    label: `수급 — 외국인 ${netDirection(flow.foreignNet)} · 기관 ${netDirection(flow.institutionNet)}${indivLabel} (${md} 장마감)`,
    detail: `외국인 ${fmtShares(flow.foreignNet)} ${netDirection(flow.foreignNet)}, 기관 ${fmtShares(flow.institutionNet)} ${netDirection(flow.institutionNet)}${indivDetail} · ${flow.date} 장 마감 확정`,
    source: flow.individualNet !== undefined ? "한국투자증권 KIS(KRX 확정)" : "네이버 금융(KRX 확정)",
    tier: "official-high",
  };
}
