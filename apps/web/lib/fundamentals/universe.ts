import { readLedgerSelections } from "../judgment-ledger";
import { readFeedContent } from "../feed-content-store";
import { kstDate } from "../fomo";
import type { QuietPickResponse } from "../quiet-pick";

/**
 * 팩트시트 유니버스 (WO-SUB-01 완료 조건 1 "전 커버 종목").
 *
 * 커버 종목 = **우리가 실제로 발행한 카드의 종목**이다. 정적 심볼 리스트를 쓰지 않는다 —
 * 큐레이션된 유명주 위주라 롱테일을 대표하지 못한다(WO-SUB-00 실사에서 같은 이유로
 * 정적 리스트를 버리고 발행 카드에서 표본을 뽑았다).
 *
 * 소스는 판단 원장(`kind=selection`)이다. HTTP 로 우리 API 를 다시 부르지 않는다(크론 내부 경로).
 */

/** 원장 조회 창(일). 이보다 오래된 카드는 갱신 대상에서 빠진다(비용 상한). */
const LOOKBACK_DAYS = 365;

export interface UniverseEntry {
  canonical: string;
  displayName: string;
  symbol?: string;
  naverCode?: string;
  country: "KR" | "US";
  market?: string;
  /** 가장 최근에 카드로 발행된 날 — 갱신 우선순위. */
  lastPublishedAt: string;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 원장 + 오늘 활성 픽에서 커버 종목을 모은다. 최신 발행일 내림차순. */
export async function loadFundamentalsUniverse(options: { lookbackDays?: number } = {}): Promise<UniverseEntry[]> {
  const fromDate = addDays(kstDate(), -(options.lookbackDays ?? LOOKBACK_DAYS));
  const [selections, active] = await Promise.all([
    readLedgerSelections({ fromDate, take: 10_000 }),
    readFeedContent<QuietPickResponse>("quiet-pick:active").catch(() => null),
  ]);

  const byKey = new Map<string, UniverseEntry>();
  const put = (entry: UniverseEntry): void => {
    const key = entry.canonical.trim();
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      return;
    }
    // 식별자는 채워진 쪽을 살린다 — 어느 발행에서는 심볼이, 다른 발행에서는 코드가 비어 있다.
    const symbol = existing.symbol ?? entry.symbol;
    const naverCode = existing.naverCode ?? entry.naverCode;
    const market = existing.market ?? entry.market;
    byKey.set(key, {
      canonical: existing.canonical,
      country: existing.country,
      displayName: existing.displayName || entry.displayName,
      ...(symbol ? { symbol } : {}),
      ...(naverCode ? { naverCode } : {}),
      ...(market ? { market } : {}),
      lastPublishedAt: existing.lastPublishedAt >= entry.lastPublishedAt ? existing.lastPublishedAt : entry.lastPublishedAt,
    });
  };

  for (const selection of selections) {
    const country = selection.payload.country === "US" ? "US" : "KR";
    put({
      canonical: selection.subject.canonical,
      // 원장 payload 에 표기용 회사명 필드가 따로 없다 — canonical 이 곧 표기 키다(WO-P6 정규화 대상).
      displayName: selection.subject.canonical,
      ...(selection.subject.symbol ? { symbol: selection.subject.symbol } : {}),
      ...(selection.payload.naverCode ? { naverCode: selection.payload.naverCode } : {}),
      country,
      ...(selection.payload.market ? { market: selection.payload.market } : {}),
      lastPublishedAt: selection.date,
    });
  }

  for (const pick of active?.picks ?? []) {
    put({
      canonical: pick.subject.canonical,
      displayName: pick.subject.displayName || pick.subject.canonical,
      ...(pick.subject.symbol ? { symbol: pick.subject.symbol } : {}),
      ...(pick.subject.naverCode ? { naverCode: pick.subject.naverCode } : {}),
      country: pick.subject.country,
      ...(pick.subject.market ? { market: pick.subject.market } : {}),
      lastPublishedAt: active?.date ?? kstDate(),
    });
  }

  return [...byKey.values()].sort((a, b) => b.lastPublishedAt.localeCompare(a.lastPublishedAt) || a.canonical.localeCompare(b.canonical));
}
