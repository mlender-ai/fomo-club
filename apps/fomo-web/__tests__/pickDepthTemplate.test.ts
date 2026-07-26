import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WO-P3 — 픽 뎁스 전용 템플릿 봉인.
 * ① 픽은 QuietPickDepth 로 열린다(레거시 KeywordDepthPage 짜깁기 금지)
 * ② 5블록 질문 순서 고정
 * ③ **빈 섹션·"아직 없어요" 류 상태 문구 전면 금지** — 신규 컴포넌트가 누락되지 않게
 *    components/app 전체를 스캔한다(레거시만 걸고 신규가 빠지던 패턴 차단, 재발 3회째라 봉인).
 * ④ 모바일 하단 잘림 방지(safe-area + GNB 여백)
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

  it("질문 순서 5블록이 위→아래로 고정(렌더 트리 기준)", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    const order = [
      "<ReadingBlock pick={pick} />",
      'title="무슨 회사인가"',
      "<RecentBlock items={news}",
      'title="차트"',
      "<RecordBlock picks={records} />",
    ].map((s) => body.indexOf(s));
    expect(order.every((i) => i >= 0), "5블록 제목 누락").toBe(true);
    for (let i = 1; i < order.length; i += 1) expect(order[i]).toBeGreaterThan(order[i - 1]!);
  });

  it("① 블록은 성적(P2)·이례성(A2)·무효선을 함께 쓴다", () => {
    expect(depth).toContain("pick.signalStats");
    expect(depth).toContain("pick.anomalies");
    expect(depth).toContain("무효선이 그 대비책");
  });

  it("⑤ 판단 기록은 pickType 필터로 레거시 30장 기록 혼입을 막는다", () => {
    expect(depth).toContain('p.pickType === "quiet"');
  });

  it("레거시 섹션 제목이 새 템플릿에 없다", () => {
    for (const legacy of ["오늘 발견 포인트", "차트 균형", "신호 혼조", "세부 이벤트", "원문 기반 요약"]) {
      expect(depth, `레거시 혼입: ${legacy}`).not.toContain(legacy);
    }
  });
});

describe("정보 위계(WO-P5 §2) — 눈이 갈 곳이 하나", () => {
  it("카드 훅이 뎁스 첫 줄로 이어진다(맥락 단절 방지)", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    const hookIdx = body.indexOf("{pick.hook}");
    const firstBlockIdx = body.indexOf("<ReadingBlock pick={pick} />");
    expect(hookIdx).toBeGreaterThan(0);
    expect(hookIdx).toBeLessThan(firstBlockIdx); // 훅이 ① 블록보다 위
  });

  it("타이포 3단 — 블록 제목(작게·회색) / 핵심 문장(크게·흰색) / 근거(작게·회색)", () => {
    expect(depth).toContain('className="text-[11px] font-semibold tracking-wide text-muted"'); // 1단 제목
    expect(depth).toContain("text-[19px] font-bold leading-7 text-whiteout"); // 2단 핵심(훅)
    expect(depth).toContain('className="w-[92px] shrink-0 text-[12px] leading-6 text-muted"'); // 3단 라벨
  });

  it("강조는 화면당 1곳 — 성적 행에만 accent, 차트는 무채색", () => {
    // accent 를 쓰는 행은 '이런 패턴의 성적' 하나뿐.
    expect(depth.match(/accent$/gm)?.length ?? 0).toBe(1);
    expect(depth).toContain('label="이런 패턴의 성적"');
    // 차트 선·마커에 라임(chartTokens.up)을 쓰지 않는다.
    const chart = depth.slice(depth.indexOf("function PickChart"), depth.indexOf("function RecordBlock"));
    expect(chart).not.toContain("chartTokens.up");
  });

  it("블록 사이 구분선 + 여백이 있다", () => {
    expect(depth).toContain("border-t border-hairline-soft pt-5");
  });

  it("② 재무 수치는 4줄까지만 나열한다", () => {
    expect(depth).toContain("maxLines={4}");
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

  it("③ 침묵 문구는 빈 상태가 아니라 픽 논리로 쓴다(예외 1건)", () => {
    expect(depth).toContain("최근 30일 뉴스·공시가 없어요 — 그래서 이 매수가 더 눈에 띄는 거예요");
  });

  it("데이터 없는 블록은 null 을 반환해 섹션 자체가 사라진다", () => {
    expect(depth).toContain("if (picks.length === 0) return null"); // ⑤
    expect(depth).toContain("if (!loaded) return null"); // ③ 로딩 중 빈 껍데기 금지
    expect(depth).toContain("if (closes.length < 20) return null"); // ④ 캔들 부족
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
  it("본문 스크롤 영역에 GNB+safe-area 여백이 있다", () => {
    expect(depth).toContain("env(safe-area-inset-bottom)");
    expect(depth).toContain("pb-[calc(7rem+env(safe-area-inset-bottom))]");
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
    expect(depth).toContain("truncate text-base font-bold");
  });
});
