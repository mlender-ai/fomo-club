import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 픽 뎁스 전용 템플릿 봉인 — 구조는 **DS-03** 이 정본이다.
 * ① 픽은 QuietPickDepth 로 열린다(레거시 KeywordDepthPage 짜깁기 금지)
 * ② 6섹션 순서 고정 (결론 → 근거 → 회사 → 값 → 틀리는 경우 → 우리 기록)
 * ③ **빈 섹션·"아직 없어요" 류 상태 문구 전면 금지** — 신규 컴포넌트가 누락되지 않게
 *    components/app 전체를 스캔한다(레거시만 걸고 신규가 빠지던 패턴 차단, 재발 3회째라 봉인).
 * ④ 모바일 하단 잘림 방지(safe-area + dvh)
 */

const depth = readFileSync(new URL("../components/QuietPickDepth.tsx", import.meta.url), "utf8");
const deck = readFileSync(new URL("../components/QuietPickDeck.tsx", import.meta.url), "utf8");

function tsxFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("픽 뎁스 = 전용 템플릿(QuietPickDepth)", () => {
  it("픽은 전용 뎁스로 열고, 레거시 StockInsightView 로 열지 않는다", () => {
    expect(deck).toContain("<QuietPickDepth pick={selected}");
    // selected(픽)를 레거시 뎁스로 여는 경로가 없어야 한다.
    expect(deck).not.toContain("<StockInsightView\n          stock={selected.subject.canonical}");
  });

  /**
   * DS-03 §1 — 순서가 곧 논증이다. 결론이 맨 위이고, 우리 기록이 맨 아래다.
   * 섹션은 **6개를 넘지 않는다**(완료 기준 1).
   */
  it("6섹션 순서가 위→아래로 고정(렌더 트리 기준)", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    const order = [
      'data-testid="depth-hook"',
      'title="근거"',
      'title="무슨 회사"',
      'title="값"',
      'title="틀리는 경우"',
      "<OurRecordBlock record={record}",
    ].map((s) => body.indexOf(s));
    expect(order.every((i) => i >= 0), "섹션 누락").toBe(true);
    for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeGreaterThan(order[i - 1]!);
  });

  it("섹션은 6개를 넘지 않는다 (완료 기준 1)", () => {
    const titles = depth.match(/<Section title="/g) ?? [];
    // ① 결론은 제목이 없으므로 Section 은 5개 = 총 6섹션.
    expect(titles.length).toBe(5);
  });

  it("근거는 실수치에서 조립한다 — 화면이 문장을 되파싱하지 않는다", () => {
    expect(depth).toContain("evidenceRows(pick)");
    expect(depth).toContain("companyBlurb(basics?.summary)");
    expect(depth).toContain("computeOurRecord(records");
  });

  it("레거시 섹션 제목이 새 템플릿에 없다", () => {
    for (const legacy of ["오늘 발견 포인트", "차트 균형", "신호 혼조", "세부 이벤트", "원문 기반 요약"]) {
      expect(depth, `레거시 혼입: ${legacy}`).not.toContain(legacy);
    }
  });
});

describe("위계 — 박스 하나, accent 하나 (DS-03 완료 기준 3·4)", () => {
  it("카드 결론이 상세 첫 줄로 이어지고, 화면에서 1회만 나온다 (완료 기준 2)", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    expect(body.match(/\{hook\}/g) ?? []).toHaveLength(1);
    expect(body.indexOf('data-testid="depth-hook"')).toBeLessThan(body.indexOf('title="근거"'));
  });

  it("박스는 ⑥ 우리 기록 하나뿐이다", () => {
    // 표면을 가진 블록(surface-2 배경)은 우리 기록 박스뿐. ②④⑤ 는 라벨-값 나열이다.
    expect(depth.match(/bg-ds-surface-2/g) ?? []).toHaveLength(1);
    const box = depth.slice(depth.indexOf("function OurRecordBlock"));
    expect(box).toContain("bg-ds-surface-2");
    expect(box).toContain("rounded-block");
  });

  it("accent 는 ⑥ 의 수익률 한 곳뿐이다", () => {
    const accents = depth.match(/ds-accent/g) ?? [];
    // 좌측 바(bg) + 수익률(text) = 2개, 둘 다 우리 기록 박스 안이다.
    expect(accents).toHaveLength(2);
    const chart = depth.slice(depth.indexOf("function DepthChart"), depth.indexOf("function RevenueBars"));
    expect(chart).not.toContain("ds-accent");
  });

  it("타이포 3단 — 섹션 제목(label mono) / 결론(display-sm) / 라벨-값", () => {
    expect(depth).toContain('font-mono text-ds-label tracking-[0.06em] text-ds-text-2'); // 섹션 제목
    expect(depth).toContain("text-ds-display-sm text-ds-text-1"); // 결론
    expect(depth).toContain('w-[88px] shrink-0 font-mono text-ds-label text-ds-text-2'); // 라벨 고정폭
  });

  it("섹션 사이 24px + 0.5px 구분선", () => {
    expect(depth).toContain("mt-s5 border-t-hairline border-ds-border pt-s5");
  });

  it("값 지표는 화이트리스트다 — EPS·52주 고저가 나열이 아니다", () => {
    expect(depth).toContain('const WANTED = ["PER", "PBR", "EPS", "배당수익률"]');
    expect(depth).not.toContain("if (out.length >= 5) break");
  });

  it("상세는 데스크톱에서 퍼지지 않는다 — max-w-xl 중앙 정렬", () => {
    // 주석의 서술을 세지 않도록 클래스 속성 안에서만 찾는다.
    const inClasses = (depth.match(/className="[^"]*max-w-xl[^"]*"/g) ?? []).length;
    expect(inClasses).toBe(2); // 헤더 + 본문
    expect(depth).toContain("mx-auto");
  });
});

describe("빈 섹션·상태 문구 금지(전 컴포넌트 스캔)", () => {
  // 데이터가 없으면 섹션을 렌더하지 않는다 — "아직 없어요/준비 중/불러오는 중" 류를 화면에 쓰지 않는다.
  const FORBIDDEN = ["아직 없어요", "아직 없습니다", "준비 중이에요", "준비중이에요", "생성 중이에요", "축적 중"];

  it("components/app 어디에도 금칙 상태 문구가 없다", () => {
    const roots = [
      fileURLToPath(new URL("../components", import.meta.url)),
      fileURLToPath(new URL("../app", import.meta.url)),
    ];
    for (const file of roots.flatMap(tsxFiles)) {
      const source = readFileSync(file, "utf8");
      for (const phrase of FORBIDDEN) {
        expect(source.includes(phrase), `${file} 에 금칙 문구 "${phrase}"`).toBe(false);
      }
    }
  });

  it("확보 안 된 섹션은 조건부 렌더로 통째 사라진다 (완료 기준 8)", () => {
    expect(depth).toContain("{rows.length > 0 && ("); // ② 근거
    expect(depth).toContain("{(blurb || substance) && ("); // ③ 회사
    expect(depth).toContain("{valueRows.length >= 3 && ("); // ④ 값 — 3개 미만이면 섹션 없음
    expect(depth).toContain("{hasWrongSection && ("); // ⑤
    expect(depth).toContain("{record && <OurRecordBlock"); // ⑥
    expect(depth).toContain("if (closes.length < 20) return null"); // 차트
    expect(depth).toContain("if (usable.length < 3) return null"); // 매출 막대
  });

  it("밴드가 없으면 밴드 얘기를 하지 않는다 (완료 기준 5)", () => {
    // 캡션·유형 경고문은 band 가 있을 때만 값이 채워진다.
    expect(depth).toContain("const band = valuation?.band ?? null");
    expect(depth).toMatch(/bandCaptions = band \?/);
    expect(depth).toMatch(/archetypeWarning = band \?/);
  });
});

describe("레거시 뎁스도 같은 수리를 받는다(워치·검색 경로)", () => {
  const legacy = readFileSync(new URL("../components/KeywordDepthPage.tsx", import.meta.url), "utf8");

  it("오버레이가 dvh 기준이고 스크롤 하단에 GNB·safe-area 여백이 있다", () => {
    // 100vh 오버레이 + py-6 하단 여백이 '맨 밑 잘림'의 원인이었다.
    expect(legacy).toContain("h-[100dvh]");
    expect(legacy).toContain("pb-[calc(6rem+env(safe-area-inset-bottom))]");
    expect(legacy).not.toContain('overflow-y-auto px-6 py-6"');
  });

  it("뎁스 헤더에 종목 로고가 붙는다", () => {
    expect(legacy).toContain("<StockLogoBadge");
  });
});

describe("로고 — KR·US 모두 서버 프록시로 채운다", () => {
  const badge = readFileSync(new URL("../components/StockLogoBadge.tsx", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../lib/stockLogo.ts", import.meta.url), "utf8");

  it("클라이언트가 외부 로고 호스트를 직접 때리지 않는다(핫링크 차단 → 빈 자리 방지)", () => {
    expect(badge).not.toContain("assets.parqet.com");
    expect(badge).toContain("stockLogoApiSrcForStock");
  });

  it("US 티커도 프록시 src 를 만든다", () => {
    expect(lib).toContain("usStockLogoUrls");
    expect(lib).toContain("symbol: symbol!");
  });
});

describe("모바일 — 하단 잘림 방지", () => {
  it("본문 스크롤 영역에 하단 여백이 있다 (DS-03 §2 — 40px + safe-area)", () => {
    expect(depth).toContain("pb-[calc(40px+env(safe-area-inset-bottom))]");
  });

  it("iOS 주소창 대응 — 100vh 대신 dvh 로 실제 뷰포트에 맞춘다(잘림 근본 원인)", () => {
    expect(depth).toContain("h-[100dvh]");
  });

  it("상단 안전영역 + sticky 헤더/스크롤 분리 구조", () => {
    expect(depth).toContain("pt-[env(safe-area-inset-top)]");
    expect(depth).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(depth).toContain("shrink-0"); // 헤더는 스크롤에 밀리지 않는다
  });

  it("긴 종목명은 말줄임(모바일 360px 폭 보호)", () => {
    expect(depth).toContain('truncate text-[14px] font-medium leading-tight text-ds-text-1');
  });

  it("헤더는 `닫기` 텍스트가 아니라 뒤로 화살표다 (DS-03 §3)", () => {
    expect(depth).toContain('aria-label="뒤로"');
    expect(depth).not.toContain('aria-label="닫기"');
  });

  it("하단 CTA 를 두지 않는다 — 관심은 헤더 우측 별이다 (DS-03 §10)", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    expect(body).toContain('aria-label={watched ? "관심 해제" : "관심"}');
    expect(body).not.toContain("h-btn-primary");
  });
});
