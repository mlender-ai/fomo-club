import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * DS-06 인터랙션·앱 요건 — 소스로 볼 수 있는 것.
 * 픽셀·타이밍은 `e2e/interaction.spec.ts` 가 본다.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CSS = read("../app/globals.css");
const DECK = code(read("../components/QuietPickDeck.tsx"));
const CARD = code(read("../components/QuietPickCard.tsx"));
const DEPTH = code(read("../components/QuietPickDepth.tsx"));
const HOME = code(read("../components/HomeView.tsx"));
const DS_SCREENS = [
  ["카드", CARD],
  ["덱", DECK],
  ["상세", DEPTH],
  ["홈 셸", HOME],
  ["성적표", code(read("../app/track-record/page.tsx"))],
  ["내 기록", code(read("../components/MyRecordTab.tsx"))],
] as const;

describe("완료 기준 1 — 탭 피드백과 햅틱 (§2)", () => {
  it("scale 피드백 클래스가 스펙 값으로 정의돼 있다", () => {
    expect(CSS).toMatch(/\.tap-card:active\s*\{\s*transform:\s*scale\(0\.985\)/);
    expect(CSS).toMatch(/\.tap-button:active\s*\{\s*transform:\s*scale\(0\.97\)/);
    expect(CSS).toMatch(/\.tap-star:active\s*\{\s*transform:\s*scale\(1\.15\)/);
    expect(CSS).toMatch(/\.tap-card\s*\{\s*transition:\s*transform 120ms ease-out/);
    expect(CSS).toMatch(/\.tap-star\s*\{\s*transition:\s*transform 180ms/);
  });

  it("리스트 행은 크기가 아니라 배경으로 답한다", () => {
    expect(CSS).toMatch(/\.tap-row:active\s*\{\s*background-color:\s*#101010/);
  });

  it("카드·버튼·별·리스트 행에 피드백이 붙어 있다", () => {
    // ★ 는 WO-HOOK-01 §2-3 으로 상세로 옮겼다(앞면에서 관심을 담을 수 없다).
    // WO-RESET-01 — 관심(★)·하단 탭·지켜보는 중을 화면에서 뺐다. 모듈은 남아 있다(되살릴 수 있게).
    expect(DEPTH).not.toContain("tap-star");
    expect(CARD).toContain("tap-button");
    expect(DECK).toContain("tap-card");
    expect(DECK).toContain("tap-row");
    expect(HOME).toContain("tap-button");
  });

  it("관심 등록만 medium 햅틱, 나머지는 light", () => {
    // 관심 등록이 상세로 옮겨갔으므로 medium 햅틱도 거기 있다(WO-HOOK-01 §2-3).
    // WO-RESET-01 — 관심(★)·하단 탭·지켜보는 중을 화면에서 뺐다. 모듈은 남아 있다(되살릴 수 있게).
    // 즐겨찾기 담기가 상세 4걸음으로 돌아왔다(WO-RESET-05 §5) — 등록만 medium 이다.
    expect(DEPTH).toContain("hapticMedium()");
    expect(CARD).toContain("haptic()");
    expect(DECK).toContain("haptic()");
    // 진동은 모션 감소를 켠 사용자에게 주지 않는다.
    expect(code(read("../lib/haptics.ts"))).toContain("reducedMotion()");
  });
});

describe("완료 기준 2 — 카드 전환 (§3)", () => {
  it("260ms · 지정 이징 · 원위치 200ms", () => {
    expect(DECK).toContain("const EXIT_MS = 260");
    expect(DECK).toContain("const RETURN_MS = 200");
    expect(DECK).toContain('cubic-bezier(0.32, 0.72, 0, 1)');
  });

  it("임계는 카드 폭 25% 또는 속도 0.5px/ms", () => {
    expect(DECK).toContain("const THRESHOLD_RATIO = 0.25");
    expect(DECK).toContain("const VELOCITY_THRESHOLD = 0.5");
    expect(DECK).toMatch(/width \* THRESHOLD_RATIO \|\| velocity > VELOCITY_THRESHOLD/);
  });

  it("관성 없음 — 한 번 스와이프에 한 장만 움직인다", () => {
    expect(DECK).toMatch(/setIdx\(\(i\) => \(dir === "next" \? i \+ 1 : i - 1\)\)/);
  });
});

describe("완료 기준 3 — 상세 진입/이탈 (§4)", () => {
  it("진입 300ms · 이탈 260ms, 같은 이징", () => {
    expect(CSS).toMatch(/\.ds-sheet-up \{ animation: ds-sheet-up 300ms var\(--ds-ease\)/);
    expect(DEPTH).toContain("const CLOSE_MS = 260");
  });

  it("애니메이션이 transform 을 남기지 않는다 — fixed 오버레이가 깨진다", () => {
    expect(CSS).toMatch(/animation: ds-sheet-up 300ms var\(--ds-ease\) backwards/);
  });

  it("헤더는 즉시 뜨고 본문만 스켈레톤이다", () => {
    const body = DEPTH.slice(DEPTH.indexOf("export function QuietPickDepth"));
    // 헤더는 조건 없이 그려진다(픽 데이터 재사용).
    expect(body).toContain('data-testid="depth-header"');
    expect(body).not.toMatch(/\{loading[^}]*&&[^}]*depth-header/);
    expect(body).toContain("<DepthSkeleton />");
  });

  it("좌측 엣지 스와이프 백이 있다", () => {
    expect(DEPTH).toContain("onBackPointerDown");
    expect(DEPTH).toMatch(/e\.clientX <= 24/);
    expect(DEPTH).toMatch(/window\.innerWidth \* 0\.25/);
  });
});

describe("완료 기준 4·5 — 세이프 에어리어 · 480px · 320px (§6-1)", () => {
  it("상하 세이프 에어리어를 지키고 하단 탭은 배경을 세이프 아래까지 연장한다", () => {
    expect(HOME).toContain("pt-[env(safe-area-inset-top)]");
    expect(HOME).toContain("pb-[env(safe-area-inset-bottom)]");
    // 하단 탭이 없으므로 탭 높이만큼의 아래 여백도 없다(WO-RESET-01 A-4).
    expect(HOME).not.toContain("pb-[calc(3.5rem+env(safe-area-inset-bottom))]");
  });

  it("콘텐츠 최대 폭은 480px 중앙 정렬이다", () => {
    for (const [name, source] of DS_SCREENS) {
      if (!source.includes("max-w-")) continue;
      expect(source.includes("max-w-[480px]"), `${name}`).toBe(true);
      expect(source.includes("max-w-xl"), `${name}: 576px 잔존`).toBe(false);
    }
  });

  it("결론은 2줄로 묶여 있다 — 320px 에서도 3줄이 되지 않는다", () => {
    expect(CARD).toContain("line-clamp-2");
    expect(CARD).toContain("break-keep");
  });
});

describe("완료 기준 6 — 폰트가 번들에 있다 (§6-2)", () => {
  it("CDN `@import` 를 쓰지 않는다", () => {
    expect(CSS).not.toContain("@import url(\"https://");
    expect(CSS).not.toContain("fonts.googleapis.com");
    expect(CSS).not.toContain("jsdelivr");
  });

  it("Departure Mono·Pretendard 를 자체 호스팅하고 FOUT 을 막는다", () => {
    expect(CSS).toContain('url("/fonts/DepartureMono-Regular.woff2")');
    expect(CSS).toContain('url("/fonts/Pretendard-Regular.woff2")');
    expect(CSS).toMatch(/font-display: block/);
  });

  it("mono 스택 1순위가 Departure Mono 다 — DS-00 §3 의 수치 폰트", () => {
    const tw = read("../tailwind.config.ts");
    expect(tw).toMatch(/mono: \["Departure Mono"/);
  });
});

describe("완료 기준 7 — `text-3` 가 본문에 쓰이지 않는다 (§7)", () => {
  /**
   * `text-3`(#5A5A57) 는 배경 대비 2.9:1 로 본문에 쓸 수 없다. 캡션·비활성·보조 표기만이다.
   * `text-ds-body`(14/1.65) 와 함께 쓰인 곳이 있으면 잡는다.
   */
  it("본문 스케일과 text-3 를 같은 요소에 쓰지 않는다", () => {
    for (const [name, source] of DS_SCREENS) {
      const offenders = (source.match(/className="[^"]*"/g) ?? []).filter(
        (cls) => cls.includes("text-ds-body") && cls.includes("text-ds-text-3")
      );
      expect(offenders, `${name}: ${offenders.join(" | ")}`).toEqual([]);
    }
  });

  it("결론·근거 값 같은 핵심 정보에 text-3 를 쓰지 않는다", () => {
    expect(CARD).not.toMatch(/data-testid="pick-hook"[^>]*text-ds-text-3/);
    expect(CARD).not.toMatch(/text-ds-text-3[^>]*data-testid="pick-hook"/);
  });
});

describe("완료 기준 8 — 모션 감소 (§7)", () => {
  it("전환 시간 0, 애니메이션 없음, scale 피드백 없음", () => {
    const block = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("animation: none !important");
    expect(block).toContain("transition-duration: 0ms !important");
    expect(block).toContain("transform: none !important");
  });

  it("상세 닫힘도 모션 감소를 존중한다", () => {
    expect(DEPTH).toContain("prefersReducedMotion() ? 0 : CLOSE_MS");
  });
});

describe("§6-5 심사 대응 — 면책·출처·개인정보", () => {
  it("최초 실행 1회 면책 고지가 실제로 렌더된다", () => {
    expect(HOME).toContain("<FirstVisitNotice");
    expect(HOME).toContain("NOTICE_KEY");
    expect(HOME).toContain("투자 판단과 책임은 이용자 본인에게 있어요");
  });

  it("데이터 출처·개인정보 화면이 있다", () => {
    const about = code(read("../app/about/page.tsx"));
    expect(about).toContain("데이터 출처");
    expect(about).toContain("개인정보");
    expect(about).toContain("이 기기(브라우저)에만 저장돼요");
  });

  it("목표가·매수/매도 의견이 화면에 없다 — 심사 반려 사유", () => {
    const BANNED = ["목표가", "매수 추천", "매도 추천", "매수하세요", "매도하세요", "투자의견"] as const;
    for (const [name, source] of DS_SCREENS) {
      for (const term of BANNED) {
        expect(source.includes(term), `${name}: ${term}`).toBe(false);
      }
    }
  });
});
