import { whenLabel } from "./why-now";

/**
 * WO-RESET-06 — **같은 카드가 계속 나오지 않게.** 순수 함수(네트워크·시간·난수 0).
 *
 * ## 무엇이 문제였나
 *
 * 천보가 계속 나왔다. 빅텍도 그랬다. **같은 카드를 매일 보면 앱을 다시 열 이유가 없다.**
 *
 * WO-DECK-01 이 재노출 강등(점수 ×0.6)을 걸어뒀는데 충분하지 않았다. 강등은 순위를 낮출
 * 뿐이고, 그 종목보다 강한 후보가 없으면 **여전히 1등으로 나온다.** 유니버스가 66이던
 * 시절에는 늘 그랬다.
 *
 * ## 그래서 강등이 아니라 **제외**다
 *
 * 최근 3일 안에 덱에 나온 종목은 오늘 덱에서 뺀다. 다만 **새로운 일이 생겼으면** 다시
 * 나올 수 있다(§A-2) — 그때는 카드가 처음과 달라야 한다(§B).
 *
 * ## 「연속일수가 하루 늘었다」는 새로운 일이 아니다
 *
 * WO 가 못을 박았다. 그건 어제와 같은 사건이 하루 더 이어진 것이지 **새로 생긴 일**이
 * 아니다. 이 파일은 그 판정을 하지 않는다 — 예외 판정은 사유가 있는 것만 통과시킨다.
 */

/** 한 번의 노출. 스냅샷에서 뽑는다 — 새로 저장할 것이 없다. */
export interface ExposureEntry {
  /** `YYYY-MM-DD`. */
  date: string;
  /**
   * 화면에 쓸 말 — `8월 24일`. **여기서 만든다.**
   *
   * 화면이 `${월}월 ${일}일` 을 조립하면 같은 규칙이 여러 컴포넌트에 흩어지고, 한 곳만
   * 고치면 두 화면이 다른 날짜 표기를 쓰게 된다. 「왜 지금」 타임라인이 이미 그 이유로
   * `whenLabel` 을 코어에 두고 있다 — 같은 규칙을 따른다.
   */
  when: string;
  /** 그날 무슨 신호였나 — 화면의 이력 줄이 그대로 쓴다. */
  reason: string;
  /** 그날 가격. 없으면 이력 줄에서 가격 칸을 비운다(지어내지 않는다). */
  price?: number;
  /** 그날의 신호 코드 — 종류 변경을 판정하는 데 쓴다. */
  code?: string;
}

/**
 * 이 안에 나온 적 있으면 오늘은 뺀다.
 *
 * WO §A-1 이 정한 값이다. 3일이면 "어제 봤는데 또" 를 확실히 막으면서, 한 주 내내 같은
 * 종목이 사라지지도 않는다. 3일이 지나면 다시 후보가 된다.
 */
export const RECENT_EXPOSURE_DAYS = 3;

/** 상세가 보여주는 이력 줄 수 상한(§C-1). 그보다 오래된 것은 화면에서 의미가 없다. */
export const EXPOSURE_HISTORY_MAX = 5;

/**
 * 최근 스냅샷들 → 종목별 노출 이력(**최신이 먼저**).
 *
 * `snapshots` 는 최신 날짜가 앞이고 **오늘자는 빠져** 있어야 한다 — 오늘을 넣으면 자기
 * 자신 때문에 제외된다(`quietPickPage1Streaks` 와 같은 규약).
 */
export function buildExposureHistory(
  snapshots: ReadonlyArray<{
    date?: string;
    picks?: ReadonlyArray<{
      subject: { canonical: string };
      hook?: string;
      price?: { current?: number };
      signal?: { code?: string; reentry?: { text?: string } | null };
      cardType?: { hook?: string } | null;
    }>;
  } | null | undefined>
): Map<string, ExposureEntry[]> {
  const out = new Map<string, ExposureEntry[]>();
  for (const snap of snapshots) {
    const date = snap?.date;
    if (!date || !snap?.picks?.length) continue;
    for (const pick of snap.picks) {
      const name = pick.subject?.canonical;
      if (!name) continue;
      const list = out.get(name) ?? [];
      /**
       * 그날 **무엇 때문에 나왔나**. 재등장 사유가 있으면 그게 이유고, 없으면 카드가 말한
       * 결론이다. 둘 다 없으면 이력 줄을 만들지 않는다 — 빈 줄은 답하는 시늉이다.
       */
      const reason = pick.signal?.reentry?.text?.trim()
        || pick.cardType?.hook?.replace(/\n/g, " ").trim()
        || pick.hook?.replace(/\n/g, " ").trim();
      if (!reason) continue;
      const when = whenLabel(date);
      if (!when) continue; // 날짜를 못 읽으면 이력 줄을 만들지 않는다
      list.push({
        date,
        when,
        reason,
        ...(typeof pick.price?.current === "number" ? { price: pick.price.current } : {}),
        ...(pick.signal?.code ? { code: pick.signal.code } : {}),
      });
      out.set(name, list);
    }
  }
  // 최신이 먼저. 스냅샷 순서를 믿지 않고 날짜로 정렬한다.
  for (const list of out.values()) list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/** `YYYY-MM-DD` 두 날짜 사이의 일수. 형식이 아니면 `null`. */
function daysApart(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * 최근 `RECENT_EXPOSURE_DAYS` 일 안에 나온 적 있나 (§A-1).
 *
 * 있으면 **제외 대상**이다 — 예외 사유가 있어야 통과한다. 판정과 예외를 한 함수에 섞지
 * 않는다: 여기는 "언제 나왔나" 만 답하고, "그래도 내보낼 이유가 있나" 는 부르는 쪽이 판단한다.
 */
export function recentExposure(
  history: readonly ExposureEntry[] | undefined,
  today: string
): ExposureEntry | null {
  for (const entry of history ?? []) {
    const gap = daysApart(entry.date, today);
    if (gap === null) continue;
    if (gap >= 0 && gap < RECENT_EXPOSURE_DAYS) return entry;
  }
  return null;
}

/** 화면에 실을 노출 요약(§B-4 · §C-1). 처음 나온 종목이면 `null` — 그때는 아무것도 안 붙인다. */
export interface ExposureSummary {
  /** 처음 나온 날의 화면 표기 — `8월 24일`. */
  firstWhen: string;
  /** 오늘까지 포함해 몇 번째인가. 처음이면 이 값이 만들어지지 않는다. */
  count: number;
  /** 가장 처음 나온 날과 그때 가격 — `36,000원 → 지금 36,300원` 의 왼쪽. */
  firstDate: string;
  firstPrice?: number;
  /** 최근 5회(최신 먼저). 상세 1걸음이 그대로 그린다. */
  recent: ExposureEntry[];
}

export function exposureSummary(
  history: readonly ExposureEntry[] | undefined,
  today: string
): ExposureSummary | null {
  const past = (history ?? []).filter((e) => e.date < today);
  if (past.length === 0) return null;
  // 정렬은 `buildExposureHistory` 가 해뒀지만, 밖에서 만든 배열도 받을 수 있어 여기서 다시 본다.
  const sorted = [...past].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const first = sorted[sorted.length - 1]!;
  return {
    count: sorted.length + 1, // 오늘을 포함한 회차
    firstDate: first.date,
    firstWhen: first.when,
    ...(typeof first.price === "number" ? { firstPrice: first.price } : {}),
    recent: sorted.slice(0, EXPOSURE_HISTORY_MAX),
  };
}
