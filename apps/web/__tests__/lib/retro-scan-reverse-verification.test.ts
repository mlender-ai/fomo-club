import { describe, expect, it } from "vitest";
import { scanBusinessContext, scanFactSheet, scanSymbolRisk } from "../../../../scripts/invariant-retro-scan";
import { symbolRiskKindForChunks } from "@fomo/core";
import type { BusinessContext, FactSheet, SourceChunk } from "@fomo/core";
import type { SymbolRiskRecord } from "../../lib/risk/repository";

/**
 * WO-SUB-CLOSE PART C-1 — **소급 스캔 역검증.**
 *
 * 지시서: "통과 확인만으로 끝내지 말고 **의도적 위반이 실패를 일으키는지** 본다."
 *
 * ## 왜 이 테스트가 필요한가
 *
 * 소급 스캔은 "위반 0건" 을 보고했다. 그런데 0건에는 두 가지 원인이 있다 —
 * **위반이 없어서** 0 이거나, **검사가 그걸 못 봐서** 0 이다. 지금까지는 둘을 구분할 수단이
 * 없었다. 실제로 두 구멍이 있었다:
 *
 * 1. 스캔이 종목 고유 리스크 산출물을 **아예 읽지 않았다** — 위험 문안의 금칙어와 소스 라벨
 *    오류는 검사 대상이 아니었다.
 * 2. 스캔이 위반을 찾아도 **종료 코드가 0 이었다** — 워크플로가 초록색이라 아무도 몰랐다.
 *
 * 그래서 이 파일은 정상 입력이 통과하는 것을 보지 않는다. **위반을 일부러 주입하고 검출되는지**
 * 만 본다. 검사기가 무력화되면(조건을 지우거나 대상을 빼면) 여기서 실패한다.
 */

function sheet(overrides: Partial<FactSheet> = {}): FactSheet {
  return {
    canonical: "테스트종목",
    field_sources: {},
    missing_fields: [],
    ...overrides,
  } as unknown as FactSheet;
}

function riskRecord(overrides: Partial<SymbolRiskRecord> = {}): SymbolRiskRecord {
  return {
    canonical: "테스트종목",
    market: "US",
    items: [],
    unavailable_reason: "위험요소 소스를 확보하지 못함",
    source_doc_ids: [],
    synthesized_at: "2026-08-13T00:00:00.000Z",
    prompt_id: "synthesize.v1",
    ...overrides,
  } as SymbolRiskRecord;
}

const item = (overrides: Partial<SymbolRiskRecord["items"][number]> = {}): SymbolRiskRecord["items"][number] => ({
  id: "sym-1-테스트",
  text: "원자재 값이 오르면 마진이 눌릴 수 있어요.",
  source_ids: ["doc#1"],
  source_kind: "filing",
  as_of: "2026-01-01",
  ...overrides,
});

describe("역검증: 결측 정직성 위반을 주입하면 검출된다", () => {
  it("항목 0건인데 사유가 비어 있으면 위반", () => {
    // 이 조합이 저장되면 화면은 "리스크 없는 회사" 로 읽힌다 — 06 §11 이 가장 강하게 막은 상태다.
    const violations = scanSymbolRisk(riskRecord({ items: [], unavailable_reason: null }));
    expect(violations.map((entry) => entry.invariant)).toContain("결측정직성");
  });

  it("항목이 있는데 사유도 차 있으면 위반", () => {
    const violations = scanSymbolRisk(riskRecord({ items: [item()], unavailable_reason: "확보 실패" }));
    expect(violations.map((entry) => entry.invariant)).toContain("결측정직성");
  });

  it("정상 레코드는 위반이 없다 — 검사기가 아무거나 잡는 것이 아님을 확인", () => {
    expect(scanSymbolRisk(riskRecord({ items: [item()], unavailable_reason: null }))).toEqual([]);
  });
});

describe("역검증: 출처 없는 리스크 항목을 주입하면 검출된다", () => {
  it("source_ids 가 빈 항목이 저장돼 있으면 위반", () => {
    // 조립기(buildSymbolRiskBlock)가 막지만, 과거 레코드나 다른 경로로 들어온 것을 스캔이 봐야 한다.
    const violations = scanSymbolRisk(riskRecord({ items: [item({ source_ids: [] })], unavailable_reason: null }));
    expect(violations.map((entry) => entry.invariant)).toContain("출처");
  });
});

describe("역검증: 리스크 문안 금칙어를 주입하면 검출된다", () => {
  it("INV-09 금칙어가 위험 문안에 있으면 검출 — 종전 스캔의 사각지대였다", () => {
    // 스캔이 종목 리스크를 읽지 않던 동안 이 문안은 소급 스캔에 잡히지 않았다.
    const violations = scanSymbolRisk(
      riskRecord({ items: [item({ text: "지금이 저점이니 반드시 사야 해요." })], unavailable_reason: null })
    );
    expect(violations.some((entry) => entry.invariant === "INV-09")).toBe(true);
  });

  it("사업 실체 문장의 금칙어도 여전히 검출된다(회귀 방지)", () => {
    const context = {
      canonical: "테스트종목",
      slot1_revenue_source: { text: "지금은 저평가라 매수 기회예요." },
    } as unknown as BusinessContext;
    expect(scanBusinessContext(context).some((entry) => entry.invariant === "INV-09")).toBe(true);
  });
});

describe("역검증: 소스 라벨 오류를 주입하면 검출된다", () => {
  it("정의되지 않은 source_kind 가 저장돼 있으면 위반", () => {
    const violations = scanSymbolRisk(
      riskRecord({ items: [item({ source_kind: "news" as never })], unavailable_reason: null })
    );
    expect(violations.map((entry) => entry.invariant)).toContain("소스종류");
  });
});

describe("역검증: 결측 모순을 주입하면 팩트시트 스캔이 검출한다", () => {
  it("missing_fields 인데 field_sources 에도 있으면 INV-12 위반", () => {
    const violations = scanFactSheet(
      sheet({
        missing_fields: ["valuation.per_ttm"],
        field_sources: { "valuation.per_ttm": { source: "sec", as_of: "2026-01-01" } },
      } as unknown as Partial<FactSheet>)
    );
    expect(violations.some((entry) => entry.invariant === "INV-12")).toBe(true);
  });
});

/**
 * 혼합 번들 오라벨 — PART C-1 이 지목한 버그 클래스.
 *
 * 종전 합성기는 호출 한 건에 소스 종류를 하나 선언하고 그 값을 **모든 항목**에 찍었다.
 * 오늘은 US=SEC·KR=DART 둘 다 공시라 라벨이 맞았지만, 번들에 공시가 아닌 소스가 섞이면
 * 그 항목까지 `filing` 이 된다. 화면은 이 라벨로 "공시에서 확인했어요" 를 말하므로 거짓이 된다.
 */
describe("역검증: 혼합 번들이 라벨을 고르지 않는다", () => {
  const chunk = (kind: SourceChunk["kind"]): SourceChunk =>
    ({ source_id: `d#${kind}`, doc_id: "d", chunk_index: 0, kind, text: "본문" }) as SourceChunk;

  it("공시만 인용하면 filing", () => {
    expect(symbolRiskKindForChunks([chunk("disclosure").kind])).toEqual({ ok: true, kind: "filing" });
  });

  it("종류가 섞이면 라벨을 고르지 않고 사유를 남긴다", () => {
    const result = symbolRiskKindForChunks([chunk("disclosure").kind, chunk("vendor_summary").kind]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("섞음");
  });

  it("벤더 요약은 공시로 승격되지 않는다 — 억지 대응 금지", () => {
    const result = symbolRiskKindForChunks([chunk("vendor_summary").kind]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("대응되지 않음");
  });

  it("인용이 없으면 라벨이 없다", () => {
    expect(symbolRiskKindForChunks([]).ok).toBe(false);
  });
});

/**
 * **스캔이 실패할 수 있는지**가 이 파일의 마지막 단정이다.
 *
 * 검출 함수가 위반을 돌려줘도 스크립트가 종료 코드 0 으로 끝나면 워크플로는 초록색이고,
 * 아무도 위반을 보지 않는다. 종전 스캔이 정확히 그 상태였다 — 예외에만 exit 1 이었다.
 * 소스를 스캔해 그 구조가 되돌아가지 않게 못 박는다(행동 검사로는 프로세스를 죽여야 해서 못 본다).
 */
describe("역검증: 스캔이 위반에 실패로 응답한다", () => {
  it("위반 건수가 종료 코드에 반영된다", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../../../scripts/invariant-retro-scan.ts", import.meta.url), "utf8");
    expect(source).toMatch(/violations\.length > 0[\s\S]{0,200}process\.exitCode = 1/);
  });

  it("리포트 저장이 종료 코드 설정보다 먼저다 — 실패해도 증거가 남는다", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../../../scripts/invariant-retro-scan.ts", import.meta.url), "utf8");
    expect(source.indexOf("writeFileSync(join(outDir")).toBeLessThan(source.indexOf("process.exitCode = 1"));
  });

  it("워크플로의 아티팩트 업로드가 always() 다 — 실패한 실행에서 리포트를 잃지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const workflow = readFileSync(new URL("../../../../.github/workflows/invariant-retro-scan.yml", import.meta.url), "utf8");
    expect(workflow).toMatch(/upload-artifact@v4\s*\n\s*if: always\(\)/);
  });
});
