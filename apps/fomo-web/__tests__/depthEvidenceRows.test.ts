/**
 * DETAIL-03 PART B — **한 화면에 같은 숫자가 두 번 나오면 안 된다.**
 *
 * 실측(바이오니아 1걸음): `매수  시장 대비 3일 연속 · 3일 연속`.
 * `scale` 이 이미 기간을 담고 있는데(`market_divergence` 는 `${days}일 연속` 을 넣는다)
 * 그 뒤에 `days` 로 같은 말을 또 붙였다.
 */
import { describe, expect, it } from "vitest";
import { depthEvidenceRows } from "../lib/depthSections";
import type { QuietPick } from "../lib/fomoApi";

function pick(over: Record<string, unknown> = {}): QuietPick {
  return {
    subject: { canonical: "바이오니아", displayName: "바이오니아", naverCode: "064550", market: "KOSDAQ", country: "KR" },
    price: { current: 9850, changePct: -10.4, sparkline: [] },
    signal: { kind: "market_divergence", code: "market_divergence", actors: "시장 대비", scale: "3일 연속", days: 3 },
    invalidation: { level: null, text: "" },
    ...over,
  } as unknown as QuietPick;
}

const HOOK = "코스닥은 빠지는데 혼자 36.3%";

/** 한 걸음 안에서 같은 숫자 문자열이 2회 이상 나오면 실패 (§B-4). */
function repeatedNumbers(texts: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of texts.join(" ").match(/\d+(?:[.,]\d+)?/g) ?? []) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c >= 2).map(([n]) => n);
}

describe("depthEvidenceRows — 같은 숫자를 두 번 쓰지 않는다", () => {
  it("`scale` 이 이미 기간을 말하면 연속일수를 다시 붙이지 않는다 (§B-3)", () => {
    const rows = depthEvidenceRows(pick(), HOOK);
    const buy = rows.find((r) => r.label === "매수");
    // 종전 실측값: `시장 대비 3일 연속 · 3일 연속`
    expect(buy?.value ?? "").not.toBe("시장 대비 3일 연속 · 3일 연속");
    expect((buy?.value.match(/3일 연속/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("주수·금액 규모는 연속일수와 함께 남는다 — 다른 축이라 중복이 아니다", () => {
    const rows = depthEvidenceRows(
      pick({ signal: { kind: "institution_streak", code: "institution_streak", actors: "기관", scale: "268주", days: 3 } }),
      "기관이 3일째 조용히 사고 있어요"
    );
    const buy = rows.find((r) => r.label === "매수");
    expect(buy?.value).toContain("268주");
  });

  it("한 걸음 안에서 같은 숫자가 두 번 나오지 않는다 (§B-4)", () => {
    const rows = depthEvidenceRows(pick(), HOOK);
    const texts = [HOOK, ...rows.map((r) => `${r.label} ${r.value}`)];
    expect(repeatedNumbers(texts), `중복 숫자: ${repeatedNumbers(texts).join(",")}`).toEqual([]);
  });

  it("훅이 이미 말한 일수를 근거 줄이 반복하지 않는다", () => {
    const rows = depthEvidenceRows(
      pick({ signal: { kind: "volume_awakening", code: "volume_awakening", actors: "거래량", scale: "3배", days: 1 } }),
      "거래량이 3배로 늘었어요"
    );
    const texts = rows.map((r) => `${r.label} ${r.value}`);
    expect(repeatedNumbers([...texts, "거래량이 3배로 늘었어요"])).toEqual([]);
  });
});

describe("depthEvidenceRows — 시장 역행은 지수 수치를 보여준다 (§B-2)", () => {
  const facts = { indexChangePct: -3.3, stockChangePct: 36.3, indexLabel: "코스닥", streakWindowDays: 3 };

  it("훅에 없는 정보(지수 수치·차이)를 낸다", () => {
    const rows = depthEvidenceRows(pick({ signalFacts: facts }), HOOK);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel["기간"]).toBe("최근 3거래일");
    expect(byLabel["코스닥"]).toBe("-3.3%");
    expect(byLabel["차이"]).toBe("39.6%p");
  });

  it("훅이 이미 말한 종목 수익률은 반복하지 않는다", () => {
    const rows = depthEvidenceRows(pick({ signalFacts: facts }), HOOK);
    // 훅이 `36.3%` 를 말했으므로 `이 종목` 줄은 없다.
    expect(rows.some((r) => r.label === "이 종목")).toBe(false);
    expect(rows.some((r) => r.label === "매수")).toBe(false);
  });

  it("훅이 종목 수익률을 말하지 않으면 `이 종목` 줄이 있다", () => {
    const rows = depthEvidenceRows(pick({ signalFacts: facts }), "코스닥은 빠지는데 이것만 버티고 있어요");
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel["이 종목"]).toBe("+36.3%");
  });

  it("지수 수치가 없으면 기간만 말하고 끝낸다 — 틀린 라벨로 채우지 않는다", () => {
    const rows = depthEvidenceRows(pick(), HOOK);
    expect(rows.some((r) => r.label === "코스닥")).toBe(false);
    /**
     * `매수` 라벨을 쓰지 않는다 — **`시장 대비` 는 아무것도 사지 않는다.**
     * 그 라벨이 `시장 대비 3일 연속 · 3일 연속` 을 만든 자리다.
     */
    expect(rows.some((r) => r.label === "매수")).toBe(false);
    expect(rows.find((r) => r.label === "기간")?.value).toBe("최근 3거래일");
  });
});
