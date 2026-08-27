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

describe("완료 확인 1 — 최근 3일 내 나온 종목이 기본적으로 제외된다", () => {
  it("제외다 — 점수를 깎는 것이 아니다", () => {
    expect(engine).toContain("const seenRecently = recentExposure(exposureHistory.get(sig.subject.canonical), date);");
    // `continue` 로 루프를 빠져나간다 = 픽에서 빠진다. 가중치 곱이 아니다.
    expect(engine).toMatch(/if \(seenRecently && !reentry\) \{[\s\S]*?continue;\n\s*\}/);
  });

  it("영구 배제가 아니다 — 「지켜보는 중」으로 보내고 사유를 남긴다", () => {
    expect(engine).toContain('code: "seen_recently"');
    expect(engine).toContain("이미 나왔어요 — 새로 생긴 일은 아직 없어요");
  });

  it("이력은 크론이 **이미 읽은 스냅샷**에서 만든다 — 커넥션을 더 잡지 않는다", () => {
    expect(cron).toContain("buildExposureHistory(wanted.map((d) => snapshots.get(dateId(d)) ?? null))");
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

describe("완료 확인 9 — 덱이 짧아져도 억지로 채우지 않는다", () => {
  it("제외된 자리를 메우는 보충 로직이 없다", () => {
    expect(engine).not.toMatch(/backfill|refill|fillDeck|보충/);
  });
});

describe("완료 확인 10 — 계측", () => {
  it("막은 건수·통과 건수·사유별 분포를 남긴다", () => {
    expect(engine).toContain("const exposureCensus = { blocked: 0, readmitted: 0, byReason: {} as Record<string, number> };");
    expect(engine).toContain("exposure: exposureCensus,");
  });
});
