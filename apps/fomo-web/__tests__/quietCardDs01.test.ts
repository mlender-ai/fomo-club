import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quietCardBlocks } from "../lib/quietCardLayout";

/**
 * DS-01 메인 카드 — 완료 기준(§6) 중 소스·계약으로 볼 수 있는 것.
 *
 * 픽셀은 `e2e/quiet-card.spec.ts` 가 본다(높이 가변·accent 1곳·텍스트 총량). 여기서는
 * **구조가 스펙대로 배선돼 있는지**를 고정한다 — 값이 바뀌면 의도한 변경인지 확인하게 된다.
 */

const card = readFileSync(new URL("../components/QuietPickCard.tsx", import.meta.url), "utf8");
const deck = readFileSync(new URL("../components/QuietPickDeck.tsx", import.meta.url), "utf8");
const depth = readFileSync(new URL("../components/QuietPickDepth.tsx", import.meta.url), "utf8");

/** 주석은 화면에 안 나간다 — 렌더 구조를 볼 때는 지우고 본다(주석 서술 오탐 방지). */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("완료 기준 1 — 결론이 화면에서 가장 큰 텍스트다", () => {
  it("결론만 display(24px) 스케일을 쓴다", () => {
    expect(code(card)).toMatch(/text-ds-display[^>]*data-testid="pick-hook"/s);
    // display 는 카드당 1회다(DS-00 §3-1).
    expect(code(card).match(/text-ds-display/g)?.length).toBe(1);
  });

  it("종목명·가격은 결론보다 작다 (title 17 · data 16)", () => {
    expect(code(card)).toContain("text-ds-title");
    expect(code(card)).toContain('text-[16px]');
    expect(code(card)).not.toContain("text-2xl");
  });

  it("결론은 2줄을 넘지 않는다 (완료 기준 7)", () => {
    expect(code(card)).toMatch(/line-clamp-2[^>]*data-testid="pick-hook"/s);
  });
});

describe("프라이머리(accent) 는 결론 · 성적 · CTA 세 자리 (기획자 모킹 기준)", () => {
  /**
   * 1차 구현은 DS-00 문구("화면당 1회, CTA 금지")만 따라 결론·CTA 를 무채색으로 만들었고
   * 화면이 죽었다. 모킹이 정본이다 — 결론이 가장 먼저 눈에 닿고, CTA 가 손을 부른다.
   */
  it("결론 · 성적 · CTA 가 accent 를 쓴다", () => {
    const body = code(card);
    expect(body).toMatch(/text-ds-display text-ds-accent"[^>]*data-testid="pick-hook"/s);
    const record = body.slice(body.indexOf('data-testid="pick-our-record"'));
    expect(record.slice(0, 700)).toContain("bg-ds-accent"); // 좌측 바
    expect(record.slice(0, 700)).toContain("text-ds-accent"); // 수익률
    const cta = body.slice(body.indexOf('data-testid="pick-cta"') - 400, body.indexOf('data-testid="pick-cta"'));
    expect(cta).toContain("bg-ds-accent");
    expect(cta).toContain("text-ds-accent-ink");
  });

  it("스파크라인 · 등락 · 근거 박스에는 accent 가 없다", () => {
    const body = code(card);
    expect(body).toMatch(/variant="ds"/); // 스파크라인은 회색 변형
    const evidence = body.slice(body.indexOf('data-testid="pick-evidence"'), body.indexOf("</dl>"));
    expect(evidence).not.toContain("ds-accent");
    expect(body).toContain("text-ds-down"); // 하락은 회색
  });

  it("기록이 없으면 성적 블록 자체가 없다 — 색을 다른 데로 옮기지 않는다", () => {
    expect(code(card)).toMatch(/\{record && \(/);
  });
});

describe("완료 기준 3·4 — 칩이 없고 CTA 가 하나다", () => {
  it("칩 대신 근거 박스(라벨-값 3행)를 그린다 — 모킹 기준", () => {
    expect(code(card)).toContain('data-testid="pick-evidence"');
    expect(code(card)).not.toContain('data-testid="pick-chips"');
    expect(code(card)).toContain("cardEvidenceRows(pick, hook)");
    // 박스: surface-2 + radius 10. 라벨 좌 / 값 우측 정렬.
    expect(code(card)).toContain("rounded-block bg-ds-surface-2");
    expect(code(card)).toContain("justify-between");
  });

  it("가격에 통화 기호가 붙는다 — `4.945` 처럼 단위 없는 값을 내지 않는다", () => {
    expect(code(card)).toContain("priceText(pick)");
    expect(code(card)).toContain('`$${value.toFixed(2)}`');
  });

  it("결론 아래 신호 후 주가를 한 줄로 말한다 (모킹 `주가는 5일간 -9%`)", () => {
    expect(code(card)).toContain("sincePriceLine(pick)");
    expect(code(card)).toContain('data-testid="pick-since"');
  });

  it("카드의 CTA 는 하나다", () => {
    expect(code(card).match(/data-testid="pick-cta"/g)?.length).toBe(1);
    expect(code(card)).not.toContain("더보기");
  });

  it("덱에서 넘기기 버튼과 두 번째 CTA 가 사라졌다 — 스와이프가 대신한다", () => {
    expect(code(deck)).not.toContain("넘기기<");
    expect(code(deck)).not.toContain(">자세히<");
    // N/10 은 카드 밖이다.
    expect(code(deck)).toContain('data-testid="deck-progress"');
    expect(code(card)).not.toContain("progress");
  });
});

describe("완료 기준 5 — 블록이 빠지면 카드가 짧아진다", () => {
  const full = { evidence: true, sparkline: true, ourRecord: true, cta: true };

  it("최소 구성은 ①②③⑦ 뿐이다", () => {
    expect(quietCardBlocks({ evidence: false, sparkline: false, ourRecord: false, cta: true })).toEqual([
      "identity",
      "price",
      "hook",
      "cta",
    ]);
  });

  it("전 블록 구성은 6블록 + CTA 다", () => {
    expect(quietCardBlocks(full)).toEqual([
      "identity",
      "price",
      "hook",
      "evidence",
      "sparkline",
      "ourRecord",
      "cta",
    ]);
  });

  it("빠진 블록의 자리표시자가 없다", () => {
    for (const key of ["evidence", "sparkline", "ourRecord", "cta"] as const) {
      expect(quietCardBlocks({ ...full, [key]: false })).not.toContain(key);
    }
  });

  it("카드에 고정 높이·최소 높이가 없다", () => {
    expect(code(card)).not.toContain("minHeight");
    expect(code(card)).not.toMatch(/h-\[\d+px\]/);
  });

  it("스파크라인은 20포인트 미만이면 그리지 않는다", () => {
    expect(code(card)).toContain("series.length >= 20");
  });
});

describe("완료 기준 6 — 카드에서 뺀 것들이 상세에 있다 (옮긴 것이지 지운 것이 아니다)", () => {
  it("되돌아보는 선·회사 설명·신호 과거 성적은 상세가 그린다", () => {
    expect(code(card)).not.toContain("되돌아보는 선");
    expect(code(card)).not.toContain("signalStats");
    expect(code(depth)).toContain("pick.invalidation.text");
    expect(code(depth)).toContain('title="무슨 회사"');
    // 신호 과거 성적은 DS-03 에서 ② 근거의 한 행이 됐다(섹션을 늘리지 않는다).
    const sections = readFileSync(new URL("../lib/depthSections.ts", import.meta.url), "utf8");
    expect(sections).toContain("pick.signalStats?.headline");
  });

  it("재등장 사유·실체 한 줄이 상세로 내려갔다", () => {
    expect(code(card)).not.toContain("다시 올라온 이유");
    expect(code(depth)).toContain('data-testid="depth-reentry"');
    expect(code(depth)).toContain('data-testid="depth-substance"');
  });

  it("이모지·국기·로고 이미지가 카드에 없다", () => {
    expect(code(card)).not.toContain("🇰🇷");
    expect(code(card)).not.toContain("🇺🇸");
    expect(code(card)).not.toContain("StockLogoBadge");
    expect(code(card)).not.toContain("◆");
  });

  it("등락에 색을 쓰지 않는다 — 하락만 down 회색이다", () => {
    expect(code(card)).toContain("text-ds-down");
    expect(code(card)).not.toContain("chartTokens");
    expect(code(card)).not.toContain("CaretUpIcon");
  });
});
