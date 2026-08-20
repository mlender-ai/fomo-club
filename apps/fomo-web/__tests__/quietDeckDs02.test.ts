import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staleLabel } from "../lib/deckStale";

/**
 * DS-02 덱 화면 — 완료 기준(§10) 중 소스·순수 함수로 볼 수 있는 것.
 * 픽셀은 `e2e/quiet-deck.spec.ts` 가 본다.
 */

const deck = readFileSync(new URL("../components/QuietPickDeck.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../components/HomeView.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../components/QuietPickCard.tsx", import.meta.url), "utf8");

/** 주석은 화면에 안 나간다 — 렌더 구조를 볼 때는 지우고 본다. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("완료 기준 1 — 헤더·덱 타이틀에 accent 가 없다", () => {
  it("덱과 픽 탭 셸(헤더·main·하단 탭)이 accent 토큰을 쓰지 않는다", () => {
    expect(code(deck)).not.toContain("ds-accent");
    /**
     * 셸만 본다. 최초 실행 면책 고지(DS-06 §6-5)는 모달이고 그 CTA 는 accent 를 쓴다 —
     * DS-00 §2-1 이 CTA accent 를 허용한다. 헤더·타이틀·탭에 없는 것이 이 규칙이다.
     */
    const shell = code(home).slice(code(home).indexOf("return ("), code(home).indexOf("function FirstVisitNotice"));
    expect(shell).not.toContain("ds-accent");
  });

  it("종전 네온 하드코딩이 덱과 픽 탭 셸에서 사라졌다 — accent 는 카드의 성적 자리에만 있다", () => {
    // 픽 탭 셸 = 헤더 + main + 하단 탭. 미사용 first-visit 고지 시트는 DS-02 범위 밖이다(DS-02 §미해결).
    const shell = code(home).slice(code(home).indexOf("return ("), code(home).indexOf("function FirstVisitNotice"));
    for (const source of [code(deck), shell]) {
      expect(source).not.toMatch(/#d8ff3a/i);
      expect(source).not.toContain("var(--neon");
    }
    expect(code(card)).toContain("ds-accent");
  });
});

describe("완료 기준 2 — N/10·N곳 남음 폐지, 점 인디케이터", () => {
  it("덱에 카운터 텍스트가 없다", () => {
    expect(code(deck)).not.toContain("곳 남음");
    expect(code(deck)).not.toMatch(/\$\{idx \+ 1\}\/\$\{picks\.length\}/);
  });

  it("12장을 넘으면 점 대신 mono 텍스트로 바꾼다", () => {
    expect(code(deck)).toContain("DOTS_MAX");
    expect(code(deck)).toMatch(/total > DOTS_MAX/);
  });
});

describe("완료 기준 3 — 지켜보는 중은 카드가 아니라 구분선 리스트", () => {
  it("행에 radius·로고가 없고 하단 구분선을 쓴다", () => {
    const shelf = code(deck).slice(code(deck).indexOf("function WatchShelf"));
    expect(shelf).toContain("border-b-hair");
    expect(shelf).not.toMatch(/rounded-(xl|card|lg)/);
    expect(shelf).not.toContain("StockLogoBadge");
  });

  it("기본 5개만 보여주고 나머지는 더 보기다", () => {
    expect(code(deck)).toContain("WATCH_PREVIEW");
    expect(code(deck)).toContain("더 보기");
  });
});

describe("완료 기준 4·5 — 하단 탭에 아이콘 없음 · 카드 전체가 탭 타겟", () => {
  it("하단 탭은 텍스트와 활성 바만 그린다", () => {
    const nav = code(home).slice(code(home).indexOf("<nav"), code(home).indexOf("</nav>"));
    expect(nav).not.toMatch(/Icon\b/);
    expect(code(home)).toContain('data-testid="bottom-tab"');
    // 활성 표시 = 2px × 16px 바
    expect(code(home)).toMatch(/h-0\.5 w-4/);
  });

  it("카드 무대 전체가 상세로 가는 탭 타겟이다", () => {
    expect(code(deck)).toMatch(/role="button"/);
    expect(code(deck)).toContain('entryPoint: "tap"');
  });
});

describe("완료 기준 6·7 — 스켈레톤 로딩 · 스테일 기준 시각", () => {
  it("스피너가 아니라 카드 형태 스켈레톤을 쓴다", () => {
    expect(code(deck)).toContain('data-testid="deck-skeleton"');
    expect(code(deck)).toContain("ds-skeleton");
    expect(code(deck)).not.toContain("FullPageLoading");
    expect(code(deck)).not.toContain("FlickerSpinner");
  });

  it("실패 화면은 문구와 재시도 버튼이다", () => {
    expect(code(deck)).toContain("잠시 후 다시 열어주세요");
    expect(code(deck)).toContain("다시 시도");
  });

  describe("staleLabel", () => {
    const now = Date.parse("2026-08-19T12:00:00Z");
    it("1시간 미만이면 표시하지 않는다 — 정상 서빙에 잡음을 붙이지 않는다", () => {
      expect(staleLabel("2026-08-19T11:30:00Z", now)).toBeNull();
    });
    it("시간 단위로 밝힌다", () => {
      expect(staleLabel("2026-08-19T09:00:00Z", now)).toBe("3시간 전 기준");
      expect(staleLabel("2026-08-19T01:00:00Z", now)).toBe("11시간 전 기준");
    });
    it("하루를 넘기면 일 단위로 밝힌다", () => {
      expect(staleLabel("2026-08-17T12:00:00Z", now)).toBe("2일 전 기준");
    });
    it("값이 없거나 깨졌으면 아무 말도 하지 않는다 — 지어내지 않는다", () => {
      expect(staleLabel(undefined, now)).toBeNull();
      expect(staleLabel("어제", now)).toBeNull();
    });
  });
});

describe("스와이프는 이동이다 (DS-02 §4-1) — 관심은 ★ 버튼이 담당한다", () => {
  it("좌 = 다음 / 우 = 이전", () => {
    // DS-06 §3 이후 임계는 카드 폭 25% 또는 속도 0.5px/ms 다 — 방향 판정만 본다.
    expect(code(deck)).toMatch(/if \(dx < 0\) move\("next"\);/);
    expect(code(deck)).toMatch(/else move\("prev"\);/);
    expect(code(deck)).toContain("THRESHOLD_RATIO");
    expect(code(deck)).toContain("VELOCITY_THRESHOLD");
  });

  it("덱은 더 이상 관심 저장을 하지 않는다", () => {
    expect(code(deck)).not.toContain("upsertWatch");
    expect(code(deck)).not.toContain("recordTaste");
  });

  it("카드의 ★ 가 저장과 지표를 이어받았다 — 신호가 끊기지 않았다", () => {
    expect(code(card)).toContain("toggleWatch");
    expect(code(card)).toContain("card_watchlist_add");
    expect(code(card)).toContain("reason: hook");
  });

  it("마지막 장에서 종료 화면을 만들지 않고 지켜보는 중으로 스크롤한다", () => {
    expect(code(deck)).not.toContain("오늘 픽을 다 봤어요");
    expect(code(deck)).toContain("scrollIntoView");
    expect(code(deck)).toContain('id="watching"');
  });
});
