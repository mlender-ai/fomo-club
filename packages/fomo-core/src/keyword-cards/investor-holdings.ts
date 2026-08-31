/**
 * WO-RESET-07 — **유명 투자자 포트폴리오.** 순수 함수(네트워크·시간·난수 0).
 *
 * ## 왜 이게 우리 컨셉과 맞나
 *
 * 지금 카드는 「누군가 사고 있어요」인데 그 누군가가 익명이다. 이름이 붙으면 달라진다.
 *
 * 그런데 이건 컨셉을 벗어난 게 아니다 — **13F 는 분기가 끝나고 45일 뒤에 나오는 늦은 공시**다.
 * 뉴스가 되기 전에 이미 벌어진 일이고, 그게 「조용한 돈」의 가장 유명한 버전이다.
 * ARK 는 매일 공개하므로 지연이 아예 없다.
 *
 * ## 이 파일이 하는 일
 *
 * 두 시점의 보유 내역을 **비교해서 무슨 일이 있었는지** 말한다. 수집·파싱은 밖에서 한다.
 */


import { josa } from "./josa";
/** 한 종목 보유. 소스가 무엇이든 이 모양으로 정규화해서 넣는다. */
export interface InvestorHolding {
  /** 티커. **이게 없으면 넣지 않는다** — 어느 종목인지 모르면 카드를 만들 수 없다. */
  ticker: string;
  /** 공시에 적힌 회사명 원문. */
  name: string;
  shares: number;
  /** 평가액(USD). 소스가 안 주면 없다. */
  valueUsd?: number;
  /** 포트폴리오 내 비중(%). 소스가 안 주면 평가액으로 계산한다. */
  weightPct?: number;
}

/** 한 시점의 포트폴리오. */
export interface InvestorSnapshot {
  /** 공시일 `YYYY-MM-DD` — **화면에 그대로 쓴다.** 지연을 숨기지 않는다(WO 하지 말 것). */
  asOf: string;
  holdings: InvestorHolding[];
}

/** 무슨 일이 있었나. */
export type HoldingChangeKind = "new" | "added" | "reduced" | "exited";

export interface HoldingChange {
  kind: HoldingChangeKind;
  ticker: string;
  name: string;
  /** 지금 주식 수(전량 매도면 0). */
  shares: number;
  /** 직전 주식 수. 신규면 0. */
  priorShares: number;
  /** 지금 비중(%). 전량 매도면 0. */
  weightPct?: number;
  /** 비중 변화(%p). 신규면 지금 비중과 같다. */
  weightDeltaPct?: number;
  valueUsd?: number;
  /** 주식 수가 몇 배가 됐나. 신규·전량매도면 없다(나눌 것이 없다). */
  multiple?: number;
}

/**
 * 「의미 있게 늘었다/줄었다」의 하한.
 *
 * ETF 는 자금 유출입만으로 전 종목 주식 수가 매일 조금씩 움직인다. 그걸 다 「더 샀어요」로
 * 부르면 매일 수십 장의 가짜 카드가 나온다. **비중이 아니라 주식 수 변화율**로 본다 —
 * 비중은 주가만 움직여도 바뀌므로 매매의 증거가 아니다.
 */
export const HOLDING_CHANGE_MIN = 0.2;

/** 「두 배로 늘렸다」고 말할 하한. */
export const HOLDING_DOUBLED = 2;

/**
 * 두 시점을 비교해 변화를 낸다. **최신이 `next`.**
 *
 * `prior` 가 없으면 빈 배열이다 — 비교 대상이 없으면 「처음 샀다」고 말할 수 없다.
 * 첫 수집일에 전 종목이 「신규 매수」로 쏟아지는 것을 막는다.
 */
export function diffHoldings(
  next: InvestorSnapshot,
  prior: InvestorSnapshot | null | undefined
): HoldingChange[] {
  if (!prior || prior.holdings.length === 0) return [];

  const before = new Map(prior.holdings.map((h) => [h.ticker.toUpperCase(), h]));
  const out: HoldingChange[] = [];

  for (const now of next.holdings) {
    const key = now.ticker.toUpperCase();
    const was = before.get(key);
    before.delete(key);
    const base = {
      ticker: key,
      name: now.name,
      shares: now.shares,
      priorShares: was?.shares ?? 0,
      ...(typeof now.valueUsd === "number" ? { valueUsd: now.valueUsd } : {}),
      ...(typeof now.weightPct === "number" ? { weightPct: now.weightPct } : {}),
    };

    if (!was) {
      out.push({
        ...base,
        kind: "new",
        ...(typeof now.weightPct === "number" ? { weightDeltaPct: now.weightPct } : {}),
      });
      continue;
    }
    if (!(was.shares > 0) || !(now.shares > 0)) continue;
    const change = (now.shares - was.shares) / was.shares;
    if (Math.abs(change) < HOLDING_CHANGE_MIN) continue;
    out.push({
      ...base,
      kind: change > 0 ? "added" : "reduced",
      multiple: now.shares / was.shares,
      ...(typeof now.weightPct === "number" && typeof was.weightPct === "number"
        ? { weightDeltaPct: now.weightPct - was.weightPct }
        : {}),
    });
  }

  // 남은 것 = 이번에 사라진 것 = 전량 매도. **매도도 카드가 된다**(§B-2).
  for (const gone of before.values()) {
    if (!(gone.shares > 0)) continue;
    out.push({
      kind: "exited",
      ticker: gone.ticker.toUpperCase(),
      name: gone.name,
      shares: 0,
      priorShares: gone.shares,
      ...(typeof gone.weightPct === "number" ? { weightDeltaPct: -gone.weightPct } : {}),
    });
  }
  return out;
}

/** 인물 한 명. 표시 이름과 기관명을 나눠 둔다 — 카드는 사람 이름을 쓴다. */
export interface InvestorProfile {
  /** 내부 식별자 — `cathie-wood`. */
  id: string;
  /** 카드에 쓰는 이름 — `캐시 우드`. */
  name: string;
  /** 기관명 — `ARK Invest`. 인물 페이지 부제로 쓴다. */
  firm: string;
  /** 어디서 오나. 노출 기간이 여기서 갈린다(§E-3). */
  source: "ark" | "13f" | "congress";
}

/**
 * 소스별 노출 기간(일) — 이보다 오래된 공시는 덱에서 뺀다(§E-3).
 *
 * ARK 는 매일 나오므로 짧게, 13F 는 분기라 길게 잡는다. 「늦은 공시」인 것과
 * 「낡은 공시」인 것은 다르다 — 13F 는 원래 45일 늦게 나오는 물건이고, 그게 이 카드의
 * 재미이므로 공시 후 2주는 유효하게 둔다.
 */
export const INVESTOR_FRESH_DAYS: Record<InvestorProfile["source"], number> = {
  ark: 3,
  "13f": 14,
  congress: 7,
};

/** `YYYY-MM-DD` 사이 일수. 형식이 아니면 `null`. */
function daysApart(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** 아직 덱에 낼 수 있는 공시인가(§E-3). 날짜를 못 읽으면 **내지 않는다**. */
export function isFreshDisclosure(
  source: InvestorProfile["source"],
  asOf: string,
  today: string
): boolean {
  const gap = daysApart(asOf, today);
  if (gap === null || gap < 0) return false;
  return gap <= INVESTOR_FRESH_DAYS[source];
}

/**
 * 카드 결론 — **무슨 일이 있었나 한 마디**(§B-2).
 *
 * `따라 사세요` 류를 절대 쓰지 않는다(WO 하지 말 것). 벌어진 일만 말한다.
 */
export function investorHook(investor: InvestorProfile, change: HoldingChange): string {
  /**
   * 조사는 받침 따라. **`캐시 우드가`는 맞고 `워런 버핏가`는 틀린다** — 사람 이름은
   * 받침이 섞여 있어 고정 조사가 반드시 어딘가에서 틀린다.
   */
  const who = `${investor.name}${josa(investor.name, "이가")}`;
  if (change.kind === "new") return `${who}\n이 종목을 처음 샀어요`;
  if (change.kind === "exited") return `${who}\n이 종목을 전부 팔았어요`;
  if (change.kind === "added") {
    if ((change.multiple ?? 1) >= HOLDING_DOUBLED) return `${who}\n보유량을 두 배로 늘렸어요`;
    return `${who}\n이 종목을 더 샀어요`;
  }
  return `${who}\n이 종목을 줄였어요`;
}

/** 여러 명이 같은 종목을 샀을 때 (§B-2). 두 명 이상일 때만 쓴다. */
export function multiInvestorHook(count: number): string {
  return `유명 투자자 ${count}명이\n같은 분기에 샀어요`;
}

/**
 * 카드 보조 줄 — 날짜·규모·비중. **공시일을 반드시 쓴다**(WO 하지 말 것: 지연을 숨기지 않는다).
 *
 * 없는 값은 줄에서 빠진다. 0 으로 채우지 않는다.
 */
export function investorSupport(
  investor: InvestorProfile,
  change: HoldingChange,
  asOfLabel: string
): string[] {
  const out: string[] = [];
  const shares = change.kind === "exited" ? change.priorShares : change.shares;
  const parts = [`${asOfLabel} 공시`];
  if (shares > 0) parts.push(formatShares(shares));
  if (typeof change.valueUsd === "number" && change.valueUsd > 0) parts.push(formatUsd(change.valueUsd));
  out.push(parts.join(" · "));

  if (change.kind !== "exited" && typeof change.weightPct === "number" && change.weightPct > 0) {
    out.push(`${investor.firm} 전체의 ${round1(change.weightPct)}%`);
  }
  return out;
}

function round1(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1);
}

/** `1,662,466` → `166만주`. 한국어 화면이므로 만 단위로 읽는다. */
export function formatShares(shares: number): string {
  const n = Math.round(shares);
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString("en-US")}만주`;
  return `${n.toLocaleString("en-US")}주`;
}

/** `47000000` → `$47M`. */
export function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}
