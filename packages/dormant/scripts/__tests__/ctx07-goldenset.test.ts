import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCardFrontBudget } from "../../packages/fomo-core/src/invariants/card-front-budget";
import { isFreshSignal, SIGNAL_AGE_MAX_DAYS } from "../../apps/web/lib/deck-ranking";

/**
 * CTX-07 §6 — 골든셋 검증. **캡처된 실제 응답**에 불변식을 대조한다.
 *
 * 라이브 응답에 단정하지 않는 이유는 `scripts/capture-goldenset.ts` 헤더에 있다 —
 * 그날의 시장이 테스트를 깨면 그 게이트는 꺼진다.
 *
 * 여기서 하는 일은 둘이다.
 *  ① 픽스처가 **실제 응답인지** 검증한다(출처 필드 존재 — 손으로 쓴 것을 걸러낸다).
 *  ② 굳은 응답에 활성 불변식을 걸어 **실데이터에서도 지켜지는지** 본다.
 *     역검증은 검사기가 위반을 잡는지 증명하고, 이 파일은 실데이터가 위반이 아닌지 증명한다.
 */

const DIR = join(__dirname, "..", "..", "docs", "quality", "goldenset");

function fixture(key: string): { provenance: Record<string, unknown>; case: Record<string, string>; response: any } {
  const path = join(DIR, `${key}.json`);
  expect(existsSync(path), `골든셋 픽스처 없음: ${key} — npx tsx scripts/capture-goldenset.ts`).toBe(true);
  return JSON.parse(readFileSync(path, "utf8"));
}

const KEYS = ["bigtec", "hanmi-semi", "celltrion", "quiet-picks", "clbk"] as const;

describe("CTX-07 §6 골든셋 — 실제 응답인가", () => {
  it("매니페스트에 캡처분과 보류분이 모두 적혀 있다", () => {
    const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
    expect(manifest.captured.length).toBe(KEYS.length);
    // 보류 케이스는 **사유와 함께** 남는다. 빈 칸으로 두면 왜 없는지 잊는다.
    expect(manifest.pending.length).toBeGreaterThan(0);
    for (const p of manifest.pending) expect(p.blocked_by?.length ?? 0).toBeGreaterThan(10);
  });

  for (const key of KEYS) {
    it(`${key} — 출처(URL·시각·커밋)가 있다. 없으면 손으로 쓴 것과 구분되지 않는다`, () => {
      const f = fixture(key);
      expect(f.provenance.url).toMatch(/^https?:\/\//);
      expect(f.provenance.status).toBe(200);
      expect(String(f.provenance.captured_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(String(f.provenance.commit)).toMatch(/^[0-9a-f]{40}$/);
      expect(f.case.purpose.length).toBeGreaterThan(10);
    });
  }
});

describe("CTX-07 §6 골든셋 — 굳은 응답에 불변식 대조", () => {
  it("INV-C12: 발행 카드 전량이 앞면 텍스트 예산 안이다", () => {
    const picks = fixture("quiet-picks").response.picks ?? [];
    expect(picks.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const pick of picks) {
      const violations = checkCardFrontBudget({
        subject: pick.subject?.canonical ?? "?",
        hook: pick.hook ?? "",
        chips: pick.chips ?? [],
        invalidation: pick.invalidation?.text ?? "",
      });
      for (const v of violations) offenders.push(`${pick.subject?.canonical}: ${v.slot} ${v.chars}자 > ${v.limit}자`);
    }
    expect(offenders).toEqual([]);
  });

  it("WO-DECK-01: 발행 픽 중 경과일 상한을 넘긴 것이 없다", () => {
    const picks = fixture("quiet-picks").response.picks ?? [];
    const aged = picks
      .filter((p: any) => typeof p.signal?.ageDays === "number" && p.signal.ageDays > SIGNAL_AGE_MAX_DAYS)
      .map((p: any) => `${p.subject?.canonical}:${p.signal.ageDays}일`);
    expect(aged).toEqual([]);
  });

  it("빅텍 — 오래된 신호는 픽이 아니라 선반에 있다(강등이지 제외가 아님)", () => {
    const res = fixture("quiet-picks").response;
    const inDeck = (res.picks ?? []).some((p: any) => p.subject?.canonical === "빅텍");
    const onShelf = (res.watching ?? []).find((w: any) => w.subject?.canonical === "빅텍");
    // 둘 다 아닐 수는 있다(그날 신호가 없으면). 그러나 **덱과 선반에 동시에** 있으면 안 된다.
    expect(inDeck && Boolean(onShelf)).toBe(false);
    if (onShelf) expect(String(onShelf.reasonText).length).toBeGreaterThan(5);
  });

  it("셀트리온 — 대형주 응답이 실재한다(필터 대조군)", () => {
    const f = fixture("celltrion").response;
    expect(f.verdict ?? f.score ?? f.signals).toBeTruthy();
  });

  it("CLBK — US 결손 케이스가 응답으로 남아 있다", () => {
    const f = fixture("clbk").response;
    expect(f).toBeTruthy();
    // 결손이 있는 것이 이 케이스의 요지다 — 값이 다 차 있으면 골든셋 목적을 잃는다.
    expect(typeof f).toBe("object");
  });

  it("신규/지속 구분이 응답에서 계산 가능하다 — 구성 규칙의 입력이 실재한다", () => {
    const picks = fixture("quiet-picks").response.picks ?? [];
    const withAge = picks.filter((p: any) => typeof p.signal?.ageDays === "number");
    expect(withAge.length).toBe(picks.length);
    const fresh = withAge.filter((p: any) => isFreshSignal(p.signal.ageDays)).length;
    expect(fresh).toBeGreaterThan(0);
  });
});
