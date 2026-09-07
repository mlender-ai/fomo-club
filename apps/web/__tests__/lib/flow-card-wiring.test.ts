import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WO-RESET-08 — **흐름 카드가 실제로 덱에 나와야 한다.**
 * 데이터층만 만들고 안 이으면 화면에 아무것도 안 나온다(2026-08-28 실측).
 */
const engine = readFileSync(new URL("../../lib/quiet-pick.ts", import.meta.url), "utf8");
const deck = readFileSync(new URL("../../../fomo-web/components/QuietPickDeck.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../../../fomo-web/components/FlowCard.tsx", import.meta.url), "utf8");

describe("흐름 카드 배선 (완료 확인 2)", () => {
  it("엔진이 업종 분류표를 읽는다", () => {
    expect(engine).toContain("readSectorMap: typeof readSectorMap;");
    expect(engine).toContain('guardedInput("readSectorMap"');
  });

  it("수급 이력 × 그날 종가로 금액을 만든다 — 주식 수는 종목 간 비교가 안 된다", () => {
    expect(engine).toContain("function detectSectorFlows(");
    expect(engine).toContain("rows.push({ date: flow.date, code, net: shares * close });");
    // 종가를 모르면 그 행을 버린다 — 지어내지 않는다.
    expect(engine).toContain("if (!close) continue;");
  });

  it("응답에 실린다 — 이게 끊기면 카드가 안 나온다", () => {
    expect(engine).toContain("const flowCards: FlowCard[] = sectorFlow.stories.map(");
    expect(engine).toContain("...(flowCards.length > 0 ? { flowCards } : {}),");
  });

  it("덱이 같은 화면에 끼워 넣는다 — 별도 섹션이 아니다 (§D-1·§E-1)", () => {
    expect(deck).toContain("res.flowCards ?? []");
    expect(deck).toContain('out.splice(Math.min(at, out.length), 0, { kind: "flow", card });');
    /*
      이 줄의 뜻은 「흐름 카드가 덱 슬롯 자리에서 그대로 그려진다」이지 소품 목록이 아니다.
      전체 JSX 를 못 박아 뒀더니 상세 CTA 를 붙이는 것만으로 깨졌다(DETAIL-01) —
      배선을 지키는 테스트가 배선 개선을 막으면 안 된다. 슬롯에서 그린다는 사실만 본다.
    */
    expect(deck).toContain("<FlowCard card={slot.card}");
  });

  it("앞쪽에 둔다 — 맨 앞은 아니다(첫 카드는 종목이어야 앱이 무엇인지 전해진다)", () => {
    expect(deck).toContain("[1, 4].forEach((at, i) => {");
    // 거시 자리는 MACRO-01 에서 셋으로 늘었다 — 흐름 자리보다 **뒤**라는 것만 여기서 본다.
    expect(deck).toContain("[3, 6, 9].forEach((at, i) => {");
  });

  /**
   * FLOW-02 §E-2 로 상한이 셋이 됐다 — **종류가 넷이 됐기 때문**이다.
   * 상한만 올리고 종류를 안 늘리면 같은 이야기가 세 번 나온다. 그래서 여기서
   * ① 상한 ② 종류별 한 장(각 검출기가 하나만 돌려준다) ③ 같은 업종 두 번 금지를 함께 본다.
   */
  it("하루 최대 3장 · 종류마다 한 장 · 같은 업종 두 번 금지 (FLOW-02 §E-2)", () => {
    expect(engine).toContain("const SECTOR_FLOW_MAX_CARDS = 3;");
    expect(engine).toContain("if (stories.length >= SECTOR_FLOW_MAX_CARDS) break;");
    expect(engine).toContain("if (sectors.some((sector) => used.has(sector))) continue;");
    for (const picker of ["pickConcentration(dailies, SECTOR_FLOW_MIN_NET)", "pickPersistentOutflow(dailies, SECTOR_FLOW_MIN_NET)", "pickReversal(dailies, SECTOR_FLOW_MIN_NET)"]) {
      expect(engine, picker).toContain(picker);
    }
  });

  /** 보고할 것 4번 — 「카드 종류별 하루 발생 수」를 응답이 답한다. */
  it("종류별 후보 수를 남긴다 — 카드가 한 장인 날 원인을 응답이 답해야 한다", () => {
    expect(engine).toContain("candidatesByKind: { rotation: 0, concentration: 0, persistent: 0, reversal: 0 }");
    expect(engine).toContain("census.candidatesByKind[story.kind] += 1;");
  });
});

describe("그림·문장 규칙 (완료 확인 3·7)", () => {
  it("막대 + 화살표 하나. 산키·애니메이션 없음", () => {
    expect(card).toContain("↓");
    for (const banned of ["sankey", "Sankey", "animate", "transition:", "@keyframes", "svg"]) {
      expect(card, banned).not.toContain(banned);
    }
  });

  /**
   * 막대는 이제 상세와 **같은 조각**(`FlowBar`)이 그린다(DETAIL-01) — 카드와 상세가 다르게
   * 생기면 눌러 들어간 사람이 같은 것을 보고 있는지 확신하지 못한다.
   * 그래서 색 문법은 그 조각에서 확인한다. 지키는 것은 같다: 빠진 쪽 회색, 들어온 쪽 라임.
   */
  it("빠진 쪽은 회색, 들어온 쪽은 라임 — 다른 카드와 같은 문법", () => {
    const steps = readFileSync(new URL("../../../fomo-web/components/DepthSteps.tsx", import.meta.url), "utf8");
    expect(steps).toContain("bg-ds-chart-bar");
    expect(steps).toContain("bg-ds-accent");
    expect(card).toContain("<FlowBar");
  });

  it("업종 이름을 자르지 않는다 — 표시명을 쓰고 라벨은 막대 위에 둔다 (FLOW-01 §A-1·§A-2)", () => {
    // 프로덕션 실측(2026-09-02): 왼쪽 72px 칸 + truncate 가 `반도체와반...` 을 만들었다.
    expect(card).not.toContain("w-[72px]");
    // 막대가 셋씩이 된 뒤(FLOW-02 §D-2) 라벨은 줄마다 붙는다 — 원문이 아니라 표시명이다.
    expect(card).toContain("sectorDisplayName(row.sector)");
    expect(card).not.toMatch(/label=\{card\.(from|to)Sector\}/);
  });

  /**
   * FLOW-02 §D-2 · 완료 확인 8 — **한 쌍만 보여주지 않는다.**
   * 한 쌍만 그리면 그 업종만 움직인 것처럼 보인다. 상세와 같은 재료로 셋씩 그린다.
   */
  it("카드에 빠진 곳 셋 · 들어온 곳 셋이 나온다", () => {
    expect(card).toContain("card.depth?.outflows ?? []");
    expect(card).toContain("card.depth?.inflows ?? []");
    expect(card).toContain('title="돈이 빠진 곳"');
    expect(card).toContain('title="돈이 들어온 곳"');
  });

  /** §C-1 — 카드에 대표 종목 둘. 서버가 만든 줄을 그대로 그린다. */
  it("대표 종목 줄이 카드에 그려진다 — 서버가 만든 보조 줄을 그대로 쓴다", () => {
    expect(card).toContain("card.support.map((line)");
    expect(engine).toContain("support: flowSupport(story, depth)");
    const core = readFileSync(
      new URL("../../../../packages/fomo-core/src/keyword-cards/sector-flow.ts", import.meta.url), "utf8"
    );
    expect(core).toContain("export function flowStockLine(");
    expect(core).toContain("등을 ${direction === \"in\" ? \"사고\" : \"팔고\"} 있어요");
  });

  it("화면이 인과를 덧붙이지 않는다 — 문장은 서버가 만든 것을 그대로 쓴다", () => {
    expect(card).toContain("{card.hook}");
    /**
     * 상단 라벨 `돈이 옮겨가고 있어요` 는 **WO §B-1 이 직접 쓴 문구**라 그대로 둔다 —
     * 업종을 짚지 않은 일반 라벨이다. §E-1 이 금한 것은 **두 업종을 이어 붙인 인과 단정**
     * (`반도체 자금이 방산으로 이동했어요`)이고, 그 문장은 서버가 만들며 코어 테스트가 막는다.
     * 여기서는 화면이 **제 문장을 새로 짓지 않는지**만 본다.
     */
    for (const banned of ["이동했", "때문에", "흘러갔", "로 인해"]) {
      expect(card, banned).not.toContain(banned);
    }
    // 업종 이름을 문장에 엮지 않는다 — 그리기만 한다.
    expect(card).not.toMatch(/\$\{card\.fromSector\}[^`]*\$\{card\.toSector\}/);
  });

  it("종목명을 가리지 않는다 — 가릴 게 없는 업종 카드다 (§B-4)", () => {
    expect(card).not.toContain("maskedIdentityLine");
    expect(card).not.toContain("isRevealed");
  });
});

describe("집계 규칙", () => {
  it("분류를 못 찾은 종목은 「기타」로 묶지 않고 센다 (§E-3)", () => {
    const core = readFileSync(
      new URL("../../../../packages/fomo-core/src/keyword-cards/sector-flow.ts", import.meta.url), "utf8"
    );
    expect(core).toContain("unclassified += 1; continue;");
    expect(core).not.toContain('"기타"');
  });

  it("임계가 잠정값임을 코드에 밝힌다 — 실측으로 확정할 자리다 (§D-2)", () => {
    expect(engine).toContain("잠정값이다");
    expect(engine).toContain("const SECTOR_FLOW_MIN_NET =");
  });
});
