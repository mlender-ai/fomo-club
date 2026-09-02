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
    expect(engine).toContain("const flowCards: FlowCard[] = sectorFlow.pairs.map(");
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

  it("하루 최대 2장 (§D-1)", () => {
    expect(engine).toContain("const SECTOR_FLOW_MAX_CARDS = 2;");
    expect(engine).toContain("pairs.slice(0, SECTOR_FLOW_MAX_CARDS)");
  });
});

describe("그림·문장 규칙 (완료 확인 3·7)", () => {
  it("막대 둘 + 화살표 하나. 산키·애니메이션 없음", () => {
    expect(card).toContain("↓");
    for (const banned of ["sankey", "Sankey", "animate", "transition:", "@keyframes", "svg"]) {
      expect(card, banned).not.toContain(banned);
    }
  });

  it("왼쪽은 회색, 오른쪽은 라임 — 다른 카드와 같은 문법", () => {
    expect(card).toContain("bg-ds-chart-bar");
    expect(card).toContain("bg-ds-accent");
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
