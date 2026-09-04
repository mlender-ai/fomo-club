import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WO-RESET-06 §A — **3일 규칙**. 강등이 아니라 제외다.
 *
 * 소스 스캔인 이유: 이 규칙을 단위로 태우려면 신호 검출·수급·팩트시트까지 다 모의해야
 * 하는데, 그 환경을 세우는 비용이 검사하려는 사실보다 크다. 여기서 막는 것은
 * **"제외가 강등으로 되돌아가는 회귀"** 이고 그건 코드 모양으로 충분히 잡힌다.
 * 실제 동작은 3일 연속 관측(완료 확인 11)이 확인한다.
 */
const engine = readFileSync(new URL("../../lib/quiet-pick.ts", import.meta.url), "utf8");
const cron = readFileSync(new URL("../../app/api/fomo/cron/quiet-pick/route.ts", import.meta.url), "utf8");
const core = readFileSync(
  new URL("../../../../packages/fomo-core/src/keyword-cards/exposure-history.ts", import.meta.url), "utf8"
);

describe("완료 확인 1 — 최근 창 안에 나온 종목은 기본적으로 덱에서 빠진다", () => {
  it("판정은 그대로다 — 점수를 깎는 것이 아니다", () => {
    expect(engine).toContain("const seenRecently = recentExposure(exposureHistory.get(sig.subject.canonical), date);");
    // 걸리면 `heldByExposure` 로 표시된다. 가중치 곱이 아니다.
    expect(engine).toContain("const heldByExposure = Boolean(seenRecently && !reentry);");
  });

  /**
   * HOTFIX-DECK §B-1 — **제외에서 보류로.**
   *
   * 종전에는 여기서 `continue` 로 후보를 버렸다. 2026-08-28 에 그 한 줄이 품질 통과 후보
   * 19개 중 18개를 지웠고 덱은 1장이 나갔다. 이제는 픽을 끝까지 만들어 보류분으로 들고
   * 있다가, 덱이 최소 장수에 못 미칠 때만 뒤에서 꺼내 쓴다.
   */
  it("버리지 않는다 — 보류분으로 들고 있다가 덱이 모자라면 뒤에서 채운다", () => {
    expect(engine).toContain("const heldByExposurePicks = new Set<QuietPick>();");
    expect(engine).toContain("heldByExposurePicks.add(pick);");
    expect(engine).toMatch(/composeDeckWithFloor\(entries, \{[\s\S]*?held: heldEntries,[\s\S]*?minDeckSize: DECK_MIN_SIZE,/);
    // 규칙에 걸렸다고 루프를 빠져나가지 않는다 — 그 한 줄이 이 사고의 원인이었다.
    expect(engine).not.toMatch(/if \(seenRecently && !reentry\) \{[\s\S]{0,400}?continue;/);
  });

  it("영구 배제가 아니다 — 못 들면 「지켜보는 중」으로 보내고 사유를 남긴다", () => {
    expect(engine).toContain('reasonCode: "seen_recently" as const');
    expect(engine).toContain("이미 나왔어요 — 새로 생긴 일은 아직 없어요");
    // 덱에 든 것은 선반에 없어야 한다 — 같은 종목이 양쪽에 있으면 화면이 서로 다른 말을 한다.
    expect(engine).toContain("heldByExposurePicks.has(pick) && !publishedSet.has(pick)");
  });

  it("이력은 크론이 **이미 읽은 스냅샷**에서 만든다 — 커넥션을 더 잡지 않는다", () => {
    /**
     * FIX-03 PART A — 이력의 재료를 **8일치 → 30일치**로 넓혔다. 실측에서 종근당의
     * 8월 26일 노출이 8일 창 밖이라 `exposure` 가 없었고, 그래서 「다시 나왔어요」가
     * 꺼졌다. 30일치는 거시 카드용으로 이미 읽어둔 스냅샷이라 커넥션을 더 잡지 않는다.
     */
    expect(cron).toContain("buildExposureHistory(recentDates.map((d) => recentSnaps.get(dateId(d)) ?? null))");
    // 덱 반복 규칙(보류)은 여전히 2일 창이다 — 이력이 길어져도 오늘 덱은 달라지지 않는다.
    expect(cron).toContain("page1Streaks = quietPickPage1Streaks(wanted.map");
    // `wanted` 는 오늘을 뺀 과거 날짜다 — 자기 자신 때문에 제외되면 안 된다.
    expect(cron).toContain("const wanted = priorDates(date, PAGE1_HISTORY_DAYS);");
  });
});

describe("완료 확인 2 — 예외 다섯 개", () => {
  const codes = ["actor_joined", "structure_shift", "new_material", "invalidation_break", "amount_surge"];

  it("다섯 사유가 모두 구현돼 있다", () => {
    for (const code of codes) expect(engine, code).toContain(`code: "${code}"`);
  });

  it("타입에도 다섯이 다 있다 — 새 사유가 타입 밖으로 새지 않게", () => {
    const union = engine.slice(engine.indexOf("export type QuietPickReentryCode"), engine.indexOf("export interface QuietPickReentry"));
    for (const code of codes) expect(union, code).toContain(`"${code}"`);
  });

  it("예외가 있으면 3일 안이어도 통과한다", () => {
    expect(engine).toContain("if (seenRecently && reentry) {");
    expect(engine).toContain("exposureCensus.readmitted += 1;");
  });
});

describe("완료 확인 3 — 「연속일수가 하루 늘었다」는 예외가 아니다", () => {
  it("제외 판정 함수는 **달력 날짜만** 본다 — 신호의 세기·연속일수를 받지 않는다", () => {
    const fn = core.slice(core.indexOf("export function recentExposure"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // 신호 속성을 하나라도 읽으면 그게 예외 통로가 된다.
    for (const forbidden of ["signal", "streak", "strength", "amount", "sig.", ".days"]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    // 보는 것은 `entry.date` 와 오늘 날짜뿐이다.
    expect(body).toContain("entry.date");
    expect(body).toContain("RECENT_EXPOSURE_DAYS");
  });

  it("재등장 사유 어디에도 「N일째」 문구가 없다", () => {
    const detect = engine.slice(engine.indexOf("function detectReentry"), engine.indexOf("function resolveAgeAnchor"));
    expect(detect).not.toMatch(/일째/);
    expect(detect).not.toMatch(/이어지는/);
  });

  it("규모 급증 임계는 진행 문구용(5%)보다 훨씬 높다 — 누적 신호가 매일 부활하지 않게", () => {
    expect(engine).toContain("const REENTRY_AMOUNT_SURGE = 0.5;");
    const surge = Number(/REENTRY_AMOUNT_SURGE = ([\d.]+)/.exec(engine)![1]);
    const growth = Number(/AMOUNT_GROWTH_MIN = ([\d.]+)/.exec(engine)![1]);
    expect(surge).toBeGreaterThan(growth * 5);
  });
});

/**
 * 완료 확인 9 는 HOTFIX-DECK 이 **뒤집었다.**
 *
 * 원문은 "덱이 짧아져도 억지로 채우지 않는다" 였고, 그래서 보충 로직이 하나도 없는지를
 * 소스로 확인했다. 그 규칙이 2026-08-28 에 덱을 1장으로 만들었다.
 *
 * 지금 지켜야 할 것은 "채우지 않는다" 가 아니라 **"무엇으로 채우는가"** 다. 채우는 재료는
 * 품질 게이트를 전부 통과한 보류분뿐이고, 「지켜보는 중」 선반(대형주·이미 오른 종목)은
 * 절대 승격 대상이 아니다. 그 선을 여기서 지킨다.
 */
describe("덱을 채우되 품질로 채우지 않는다 (HOTFIX-DECK §C-1)", () => {
  it("채우는 재료는 보류분뿐이다 — 선반은 승격 풀로 쓰지 않는다", () => {
    expect(engine).toContain("watchPool: [],");
    // 선반 항목(`watching`)이 구성 입력으로 들어가는 경로가 없어야 한다.
    expect(engine).not.toMatch(/watchPool: watching/);
    expect(engine).not.toMatch(/held: watching/);
  });

  it("보충은 최소 장수까지만이다 — 상한까지 억지로 채우지 않는다", () => {
    expect(engine).toContain("minDeckSize: DECK_MIN_SIZE,");
    // 사다리는 세 칸뿐이고 마지막 칸은 "그대로 둔다" 이다(deck-ranking).
    const ranking = readFileSync(new URL("../../lib/deck-ranking.ts", import.meta.url), "utf8");
    expect(ranking).toContain('export type DeckRelaxation = "recent_exposure" | "fresh_floor" | "kind_cap";');
  });
});

describe("완료 확인 10 — 계측", () => {
  it("막은 건수·통과 건수·사유별 분포를 남긴다", () => {
    expect(engine).toContain("const exposureCensus = { blocked: 0, readmitted: 0, byReason: {} as Record<string, number>, readmittedByFloor: 0 };");
    expect(engine).toContain("exposure: exposureCensus,");
  });

  /** HOTFIX-DECK §C-3 — 단계별 통과 수를 매일 굳힌다. 다음엔 이 객체 하나만 보면 된다. */
  it("단계별 통과 수를 페이로드에 남긴다", () => {
    expect(engine).toContain("} satisfies QuietPickFunnel,");
    for (const stage of ["universeKr", "withCandles", "withSignal", "qualified", "freeOfRecentExposure", "deck"]) {
      expect(engine, stage).toContain(`${stage}:`);
    }
  });

  /** 푼 규칙을 남기지 않으면 다음 사람이 그날의 덱을 잘못 읽는다. */
  it("푼 규칙을 회전율 계측에 남긴다", () => {
    expect(engine).toContain("relaxations: composed.relaxations,");
  });
});
