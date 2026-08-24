import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quietCardBlocks } from "../lib/quietCardLayout";

/**
 * WO-HOOK-01 메인 카드 — 완료 기준(§10) 중 소스·계약으로 볼 수 있는 것.
 *
 * 이 파일은 `quietCardDs01.test.ts` 를 대체한다. DS-01 이 고정하던 것들(종목명 노출, 근거
 * 라벨-값 박스, 카드 위 우리 성적, accent 3곳, CTA accent)은 이제 **위반**이라 그대로 두면
 * 새 스펙을 막는 회귀 가드가 된다.
 *
 * 픽셀은 `e2e/quiet-card.spec.ts` 가 본다. 여기서는 **구조가 스펙대로 배선돼 있는지**를 고정한다.
 */

const card = readFileSync(new URL("../components/QuietPickCard.tsx", import.meta.url), "utf8");
const deck = readFileSync(new URL("../components/QuietPickDeck.tsx", import.meta.url), "utf8");
const depth = readFileSync(new URL("../components/QuietPickDepth.tsx", import.meta.url), "utf8");
const divergence = readFileSync(new URL("../components/DivergenceChart.tsx", import.meta.url), "utf8");
const bars = readFileSync(new URL("../components/StreakBars.tsx", import.meta.url), "utf8");
const ratioBar = readFileSync(new URL("../components/RatioBar.tsx", import.meta.url), "utf8");

/** 주석은 화면에 안 나간다 — 렌더 구조를 볼 때는 지우고 본다(주석 서술 오탐 방지). */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("완료 기준 1 — 카드 3형이 신호 유형에 따라 자동 선택된다", () => {
  it("카드는 형을 고르지 않는다 — 서버가 고른 형을 그리기만 한다", () => {
    const body = code(card);
    expect(body).toContain("pick.cardType");
    // 화면에서 임계값을 다시 판정하면 서버와 두 벌이 된다.
    expect(body).not.toMatch(/volumePct\s*>=/);
    expect(body).not.toContain("isLongestStreak");
  });

  it("형이 그림을 가른다 — divergence / ratio / streak", () => {
    const body = code(card);
    expect(body).toContain('figure.kind === "divergence"');
    expect(body).toContain('figure.kind === "ratio"');
    expect(body).toContain("StreakBars");
  });

  it("형이 data 속성으로 드러난다(회귀 관측용)", () => {
    expect(code(card)).toContain("data-card-type");
  });
});

describe("완료 기준 2·3·4 — 마스킹", () => {
  it("가려진 카드에 종목명·티커가 없다", () => {
    const body = code(card);
    // 이름·티커는 공개된 뒤에만 그린다.
    expect(body).toMatch(/\{isOpen && \(\s*<p[^]*?data-testid="pick-name"/);
    expect(body).toMatch(/isOpen[^]*?subjectName|displayName\(pick\)/);
  });

  it("로고 이미지가 없다", () => {
    expect(code(card)).not.toContain("StockLogoBadge");
    expect(code(card)).not.toContain("<img");
  });

  it("가려도 국가·섹터·시총·가격은 남는다 — 다 가리면 낚시가 된다(§2-2)", () => {
    const body = code(card);
    expect(body).toContain("COUNTRY_LABEL");
    expect(body).toContain("trustedSector");
    expect(body).toContain("marketCapText");
    expect(body).toContain("priceText(pick)");
  });

  it("상세 진입이 정체를 영구 해제한다 — 로컬 저장(§2-3)", () => {
    const body = code(deck);
    expect(body).toContain("reveal(pick.subject.canonical)");
    expect(body).toContain("isRevealed(pick.subject.canonical)");
    const reveal = readFileSync(new URL("../lib/cardReveal.ts", import.meta.url), "utf8");
    expect(reveal).toContain("localStorage");
    // 해제를 되돌리는 창구가 없다 — 되돌아가면 장치가 아니라 방해다.
    expect(reveal).not.toContain("unreveal");
  });

  it("가려진 카드는 스크린리더에도 종목명을 읽어주지 않는다", () => {
    expect(code(card)).toMatch(/aria-label=\{\[isOpen \? displayName\(pick\) : identityLine/);
    expect(code(deck)).toMatch(/cardRevealed \? `\$\{pick\.subject\.canonical\}/);
  });

  it("CTA 가 가렸다는 사실을 명시한다(§2-4)", () => {
    expect(code(card)).toContain("어떤 회사인지 보기");
  });
});

describe("완료 기준 5 — accent 가 형별 1곳에만 있다 (§7)", () => {
  it("CTA·가격·후킹 문장에 accent 가 없다", () => {
    const body = code(card);
    const cta = body.slice(body.indexOf('data-testid="pick-cta"') - 500, body.indexOf('data-testid="pick-cta"'));
    expect(cta).not.toContain("ds-accent");
    const hook = body.slice(body.indexOf('data-testid="pick-hook"') - 300, body.indexOf('data-testid="pick-hook"'));
    expect(hook).not.toContain("ds-accent");
    const change = body.slice(body.indexOf('data-testid="pick-change"') - 300, body.indexOf('data-testid="pick-change"'));
    expect(change).not.toContain("ds-accent");
  });

  /**
   * 2026-08-24 공통 골격 — 카드 본문 자체는 accent 를 **한 번도** 쓰지 않는다.
   * 세 형 모두 자기 그림 컴포넌트가 accent 를 갖고, 그 뜻은 셋 다 "돈이 들어온 것" 이다.
   * (종전에는 B 만 카드 본문에 `text-ds-ratio text-ds-accent` 로 직접 박혀 있었다.)
   */
  it("카드 본문에는 accent 가 없다 — 형별 그림 컴포넌트가 각자 하나씩 갖는다", () => {
    expect(code(card)).not.toContain("ds-accent");
    expect(code(divergence)).toContain("#D4FF3F");
    expect(code(bars)).toContain("bg-ds-accent");
    expect(code(ratioBar)).toContain("bg-ds-accent");
  });

  it("accent 의 뜻이 형마다 같다 — 셋 다 '매수' 를 가리킨다", () => {
    // A: 매수 누적선 / B: 하루 거래량 중 매수분 / C: 매수 연속 구간
    expect(code(divergence)).toContain("BUY_LINE");
    expect(code(ratioBar)).toMatch(/bg-ds-accent[\s\S]{0,120}width/);
    expect(code(bars)).toMatch(/inStreak \? "bg-ds-accent"/);
  });

  it("A형은 누적선만 accent — 주가선은 회색이다", () => {
    expect(code(divergence)).toContain('const BUY_LINE = "#D4FF3F"');
    expect(code(divergence)).toContain('const PRICE_LINE = "#4A4A48"');
  });

  it("C형은 현재 연속 구간만 accent", () => {
    expect(code(bars)).toMatch(/inStreak \? "bg-ds-accent" : "bg-ds-chart-bar"/);
  });

  it("우리 성적은 카드에 없다 — 상세로 갔다(§7-1)", () => {
    expect(code(card)).not.toContain("ourRecord");
    expect(code(card)).not.toContain("짚은 뒤");
  });
});

describe("완료 기준 6 — 칩이 없다", () => {
  it("칩도, 근거 라벨-값 박스도 그리지 않는다", () => {
    const body = code(card);
    expect(body).not.toContain('data-testid="pick-chips"');
    expect(body).not.toContain('data-testid="pick-evidence"');
    expect(body).not.toContain("cardEvidenceRows");
  });

  it("보조는 최대 2줄 문장이다 — 개수는 서버가 이미 잘라 보낸다", () => {
    expect(code(card)).toContain('data-testid="pick-support"');
    expect(code(card)).toContain("support.map");
  });
});

describe("완료 기준 7·8·9 — 형별 그림", () => {
  it("A형: 두 선을 각자 정규화한다(같은 축에 두지 않는다)", () => {
    const body = code(divergence);
    expect(body).toContain("function normalize");
    expect(body).toMatch(/pathOf\(priceSeries/);
    expect(body).toMatch(/pathOf\(buySeries/);
    // y축 라벨 없음 — 비교 가능한 것은 방향뿐이다.
    expect(body).not.toContain("<text");
  });

  it("A형: 평평한 계열을 버리지 않는다 — 제자리 주가가 이 형의 최고 재료다", () => {
    expect(code(divergence)).toContain("series.map(() => 0.5)");
  });

  it("A형: 선 굵기와 범례가 스펙대로다 (1.5 / 2.5 / 범례 2개)", () => {
    const body = code(divergence);
    expect(body).toContain("strokeWidth={1.5}");
    expect(body).toContain("strokeWidth={2.5}");
    expect(body).toContain("주가");
    expect(body).toContain("buyLegend");
  });

  /**
   * B형은 52px 맨몸 숫자에서 **비중 막대**로 바뀌었다(2026-08-24).
   *
   * 종전 `{ratioPct}%` 는 카드 상단 `+5.7%` 바로 아래 라임색으로 놓여 **수익률로 읽혔다**.
   * 막대는 accent 를 다시 '매수분' 으로 되돌리고, 캡션이 무엇의 몫인지 말한다.
   */
  it("B형: 비중 막대 — accent 는 매수분, 나머지는 회색", () => {
    const body = code(ratioBar);
    expect(body).toContain("bg-ds-chart-bar");
    expect(body).toMatch(/bg-ds-accent[\s\S]{0,120}\$\{filled\}%/);
  });

  it("B형: 맨몸 퍼센트를 accent 로 크게 쓰지 않는다 — 수익률로 읽힌다", () => {
    expect(code(card)).not.toContain("text-ds-ratio");
    expect(code(ratioBar)).not.toContain("text-ds-ratio");
    expect(code(ratioBar)).not.toContain("text-ds-accent");
  });

  it("C형: 막대 간격 3px, 캡션 있음", () => {
    const body = code(bars);
    expect(body).toContain("gap-[3px]");
    expect(body).toContain("거래일");
  });

  /**
   * 공통 골격(2026-08-24) — **세 형 모두** 그림 아래 mono 한 줄이 accent 를 설명한다.
   * 종전에는 B 만 그 줄이 없었고, 그래서 숫자가 맨몸으로 섰다.
   */
  it("세 형 모두 그림 아래 mono 캡션이 있다", () => {
    for (const [name, body] of [["A", divergence], ["B", ratioBar], ["C", bars]] as const) {
      expect(body, `${name}형에 캡션이 없다`).toMatch(/font-mono text-ds-legend/);
    }
  });
});

/**
 * 상세는 카드보다 증거가 적으면 안 된다 (2026-08-24).
 *
 * 실측 회귀: A형 카드에서 「주가 / 외국인 매수 누적」 두 선의 갭을 보고 들어온 사용자가
 * 상세 「근거」에서는 **회색 주가선 하나만** 만났다. 확인하러 온 자리에서 확인할 대상이
 * 사라진 것이다. 카드와 **같은 컴포넌트**를 쓰게 해 두 화면이 갈릴 수 없게 한다.
 */
describe("상세 근거 — 카드가 보여준 그림을 그대로 다시 그린다", () => {
  it("상세가 CardFigure 를 재사용한다 (형별 분기를 복제하지 않는다)", () => {
    expect(code(depth)).toContain("<CardFigure cardType={pick.cardType} />");
    expect(code(depth)).toContain('data-testid="depth-signal-figure"');
    // 복제였다면 상세에도 형 분기가 있었을 것이다 — 없어야 한다.
    expect(code(depth)).not.toMatch(/figure\.kind === "divergence"/);
  });

  it("맥락 차트는 그대로 남는다 — 증거(갭)와 맥락(260일·되돌아보는 선)은 다른 일이다", () => {
    expect(code(depth)).toContain('data-testid="depth-chart"');
    expect(code(depth)).toContain("되돌아보는 선");
  });
});

describe("완료 기준 11 — 카드 높이가 내용에 따라 변한다", () => {
  const full = { figure: true, support: true, cta: true };

  it("최소 구성은 ①②③ + CTA 뿐이다", () => {
    expect(quietCardBlocks({ figure: false, support: false, cta: true })).toEqual([
      "identity",
      "price",
      "hook",
      "cta",
    ]);
  });

  it("전 블록 구성은 6블록이다", () => {
    expect(quietCardBlocks(full)).toEqual(["identity", "price", "hook", "figure", "support", "cta"]);
  });

  it("빠진 블록의 자리표시자가 없다", () => {
    for (const key of ["figure", "support", "cta"] as const) {
      expect(quietCardBlocks({ ...full, [key]: false })).not.toContain(key);
    }
  });

  it("카드에 고정 높이·최소 높이가 없다", () => {
    expect(code(card)).not.toContain("minHeight");
    expect(code(card)).not.toMatch(/\bh-\[\d+px\]/);
  });
});

describe("§8 삭제 목록 — 옮긴 것이지 지운 것이 아니다", () => {
  it("앞면 ★ 관심이 사라지고 상세가 갖는다", () => {
    expect(code(card)).not.toContain("StarIcon");
    expect(code(card)).not.toContain("toggleWatch");
    expect(code(depth)).toContain("toggleWatch");
    expect(code(depth)).toContain("StarIcon");
  });

  it("되돌아보는 선·회사 설명·신호 과거 성적은 상세가 그린다", () => {
    expect(code(card)).not.toContain("되돌아보는 선");
    expect(code(card)).not.toContain("signalStats");
    expect(code(depth)).toContain("pick.invalidation.text");
    expect(code(depth)).toContain('title="무슨 회사"');
  });

  it("넘기기 버튼·더보기 링크가 없고 CTA 는 하나다", () => {
    expect(code(card).match(/data-testid="pick-cta"/g)?.length).toBe(1);
    expect(code(card)).not.toContain("더보기");
    expect(code(deck)).not.toContain("넘기기<");
    expect(code(deck)).toContain('data-testid="deck-progress"');
  });

  it("이모지·국기가 카드에 없다", () => {
    const body = code(card);
    expect(body).not.toContain("🇰🇷");
    expect(body).not.toContain("🇺🇸");
    expect(body).not.toContain("◆");
  });

  it("등락에 색을 쓰지 않는다 — 하락만 down 회색이다", () => {
    expect(code(card)).toContain("text-ds-down");
    expect(code(card)).not.toContain("chartTokens");
  });
});
