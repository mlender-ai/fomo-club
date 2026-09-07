import { INVESTORS, type InvestorCollection } from "./investor-collect";
import type { InvestorHolding, InvestorSnapshot } from "@fomo/core/keyword-cards/investor-holdings";

/**
 * LAUNCH-P1 §C-3 — **13F 수집물을 밖에서 받아 넣는다.**
 *
 * ## 왜 밖에서 오나
 *
 * SEC EDGAR 가 Vercel 런타임에서 막힌다(INFLUENCER-01 실측: 같은 코드가 로컬에서는 된다).
 * 그래서 수집을 GitHub Actions 로 옮기고, 결과만 이 창구로 받는다.
 *
 * ## 받는 쪽이 위험한 지점이다
 *
 * 읽기 크론과 다르다 — **밖에서 온 데이터를 저장한다.** 그래서 세 가지를 여기서 막는다.
 *
 * ```
 * 1  아는 인물만        `source: "13f"` 인 id 만 받는다. ARK 칸을 덮어쓸 수 없다
 * 2  모양을 검사한다     티커 없는 보유는 버린다(카드를 만들 수 없으므로 저장할 이유도 없다)
 * 3  크기를 자른다       한 인물 5,000종목 · 한 요청 20인물
 * ```
 *
 * 인증은 라우트가 한다 — **비밀값이 없으면 거부**한다(감사 라우트와 같은 규칙).
 * 크론 라우트의 `!secret ||` 패턴을 쓰지 않는다: 환경변수가 비는 순간 공개 쓰기가 된다.
 *
 * 이 파일은 순수 함수만 둔다 — 라우트 없이 테스트할 수 있어야 한다.
 */

/** 한 인물 5,000종목이면 13F 로는 이미 최대급이다(타이거 글로벌 실측 638종목). */
export const MAX_HOLDINGS_PER_INVESTOR = 5_000;
/** 한 요청에 받을 인물 수 — 13F 인물 전체(11명)보다 넉넉하되 무한은 아니다. */
export const MAX_INVESTORS_PER_REQUEST = 20;

/** 13F 로 들어올 수 있는 인물 id — 이 목록 밖은 받지 않는다. */
export function thirteenFInvestorIds(): Set<string> {
  return new Set(INVESTORS.filter((i) => i.source === "13f").map((i) => i.id));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanHolding(raw: unknown): InvestorHolding | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const ticker = typeof row["ticker"] === "string" ? row["ticker"].trim().toUpperCase() : "";
  // 티커가 없으면 어느 종목인지 모른다 — 카드를 만들 수 없으므로 저장하지 않는다.
  if (!ticker || ticker.length > 12) return null;
  const shares = Number(row["shares"]);
  if (!Number.isFinite(shares) || shares < 0) return null;
  const name = typeof row["name"] === "string" ? row["name"].trim().slice(0, 200) : "";
  const valueUsd = Number(row["valueUsd"]);
  const weightPct = Number(row["weightPct"]);
  return {
    ticker,
    name,
    shares,
    ...(Number.isFinite(valueUsd) && valueUsd >= 0 ? { valueUsd } : {}),
    ...(Number.isFinite(weightPct) && weightPct >= 0 ? { weightPct } : {}),
  };
}

function cleanSnapshot(raw: unknown): InvestorSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as Record<string, unknown>;
  const asOf = typeof snap["asOf"] === "string" ? snap["asOf"].trim() : "";
  // 공시일이 없으면 **화면이 날짜를 못 쓴다** — 지연을 숨기지 않는다는 규칙이 깨진다.
  if (!ISO_DATE.test(asOf)) return null;
  const rows = Array.isArray(snap["holdings"]) ? snap["holdings"] : [];
  const holdings = rows.slice(0, MAX_HOLDINGS_PER_INVESTOR).map(cleanHolding).filter((h): h is InvestorHolding => h !== null);
  if (holdings.length === 0) return null;
  return { asOf, holdings };
}

export interface ThirteenFIngestResult {
  /** 저장된 인물 수. */
  accepted: number;
  /** 인물별 보유 종목 수 — 보고할 것의 재료다. */
  byInvestor: Record<string, { asOf: string; holdings: number; hasPrior: boolean }>;
  /** 받지 않은 것과 그 이유. **조용히 버리지 않는다.** */
  rejected: Array<{ id: string; reason: string }>;
  /** 합칠 대상이 된 최종 컬렉션. `accepted === 0` 이면 `null` — 빈 쓰기를 하지 않는다. */
  merged: InvestorCollection | null;
}

/**
 * 받은 payload 를 검사해 기존 컬렉션에 **13F 칸만** 덮어쓴다.
 *
 * ARK 칸은 손대지 않는다 — 매일 도는 수집이 따로 있고, 이 창구가 그걸 지울 수 있으면
 * 밖에서 온 요청 하나로 인물 카드가 통째로 사라진다.
 *
 * @param today 저장 시각(`YYYY-MM-DD`). 컬렉션의 `asOf` 는 **가장 최근 쓰기 시점**이다.
 */
export function mergeThirteenF(
  body: unknown,
  previous: InvestorCollection | null,
  today: string
): ThirteenFIngestResult {
  const allowed = thirteenFInvestorIds();
  const rejected: ThirteenFIngestResult["rejected"] = [];
  const byInvestor: ThirteenFIngestResult["byInvestor"] = {};
  const next: InvestorCollection["byInvestor"] = { ...(previous?.byInvestor ?? {}) };

  const payload = (body ?? {}) as Record<string, unknown>;
  const incoming = payload["byInvestor"];
  if (!incoming || typeof incoming !== "object") {
    return { accepted: 0, byInvestor, rejected: [{ id: "(body)", reason: "byInvestor 가 없다" }], merged: null };
  }

  const entries = Object.entries(incoming as Record<string, unknown>).slice(0, MAX_INVESTORS_PER_REQUEST);
  let accepted = 0;
  for (const [id, raw] of entries) {
    if (!allowed.has(id)) { rejected.push({ id, reason: "13F 인물이 아니다" }); continue; }
    if (!raw || typeof raw !== "object") { rejected.push({ id, reason: "모양이 객체가 아니다" }); continue; }
    const entry = raw as Record<string, unknown>;
    const latest = cleanSnapshot(entry["latest"]);
    if (!latest) { rejected.push({ id, reason: "latest 가 비었거나 공시일·티커가 없다" }); continue; }
    const prior = cleanSnapshot(entry["prior"]);
    const unresolved = Number(entry["unresolved"]);
    next[id] = {
      latest,
      prior,
      ...(Number.isFinite(unresolved) && unresolved >= 0 ? { unresolved } : {}),
    };
    byInvestor[id] = { asOf: latest.asOf, holdings: latest.holdings.length, hasPrior: Boolean(prior) };
    accepted += 1;
  }

  if (accepted === 0) return { accepted, byInvestor, rejected, merged: null };

  return {
    accepted,
    byInvestor,
    rejected,
    merged: {
      asOf: today,
      byInvestor: next,
      // 이전 오류 기록은 남긴다 — 13F 쓰기가 ARK 수집의 오류 이력을 지울 이유가 없다.
      errors: previous?.errors ?? [],
    },
  };
}
