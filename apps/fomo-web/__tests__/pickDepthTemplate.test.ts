import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 픽 뎁스 전용 템플릿 봉인 — 구조는 **WO-HOOK-02** 가 정본이다(DS-03 을 대체).
 * ① 픽은 QuietPickDepth 로 열린다(레거시 KeywordDepthPage 짜깁기 금지)
 * ② 7섹션 순서 고정 (결론 → **왜 지금 사는가** → 근거 → 회사 → 값 → 틀리는 경우 → 우리 기록)
 * ③ **빈 섹션·"아직 없어요" 류 상태 문구 전면 금지** — 신규 컴포넌트가 누락되지 않게
 *    components/app 전체를 스캔한다(레거시만 걸고 신규가 빠지던 패턴 차단, 재발 3회째라 봉인).
 * ④ 모바일 하단 잘림 방지(safe-area + dvh)
 */

/**
 * 주석은 화면에 안 나간다. 이 파일의 봉인 검사는 **렌더되는 코드**에만 걸어야 한다 —
 * 안 그러면 "왜 이걸 안 쓰는가"를 적어둔 주석이 위반으로 잡힌다.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

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
    expect(deck).toContain("<QuietPickDepth");
    expect(deck).toContain("pick={selected}");
    // selected(픽)를 레거시 뎁스로 여는 경로가 없어야 한다.
    expect(deck).not.toContain("<StockInsightView\n          stock={selected.subject.canonical}");
  });

  /**
   * WO-HOOK-02 §4 — 순서가 곧 논증이다. 결론 다음이 **왜 지금 사는가**이고, 우리 기록이 맨 아래다.
   * 섹션은 **7개를 넘지 않는다**(완료 기준 9).
   */
  /**
   * WO-RESET-02 PART D — **섹션 다섯 개. 이보다 늘리지 않는다.**
   *
   * 「근거」는 「얼마나 샀나」로 이름이 바뀌고 「무슨 회사」 뒤로 내려갔다 — 근거를 대는 자리는
   * 이제 맨 위 「왜 지금 사는가」이고, 여기는 규모를 확인하는 자리다.
   * 「우리 기록」은 목록에 없어 화면에서 뺐다(컴포넌트·원장은 남는다).
   */
  /**
   * WO-RESET-05 §1 — 상세는 한 장이 아니라 **네 걸음**이다. 순서가 곧 이야기다:
   * 놀라움(신호) → 이유(왜 지금) → 실체(어떤 회사) → 결정(즐겨찾기).
   */
  it("[완료 1] 네 걸음이 이야기 순서로 고정된다", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    const order = ['step === "signal"', 'step === "why"', 'step === "company"', 'step === "decide"'];
    const positions = order.map((needle) => {
      const at = body.indexOf(needle);
      expect(at, `없는 걸음: ${needle}`).toBeGreaterThan(-1);
      return at;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("[완료 12] 데이터 없는 걸음은 목록에서 빠진다 — 빈 걸음을 만들지 않는다", () => {
    // 1·4걸음은 항상, 2·3걸음은 재료가 있을 때만.
    expect(depth).toContain('const out: StepId[] = ["signal"];');
    expect(depth).toContain('if ((pick.whyNow?.length ?? 0) > 0) out.push("why");');
    expect(depth).toContain('if ((pick.companyRead?.length ?? 0) > 0) out.push("company");');
    expect(depth).toContain('out.push("decide");');
  });

  it("[완료 2] 진행 점은 실제 걸음 수를 받는다 — 4로 고정하지 않는다", () => {
    expect(depth).toContain("<StepDots total={steps.length} index={index} />");
  });

  /** WO-RESET-05 §0-2 — 「틀리는 경우」는 상세에서 뺀다. 데이터는 두고 화면만. */
  it("[완료 3] 「틀리는 경우」가 화면에 없다", () => {
    const body = stripComments(depth.slice(depth.indexOf("export function QuietPickDepth")));
    expect(body).not.toContain("틀리는 경우");
    expect(body).not.toContain('data-testid="depth-wrong"');
    expect(body).not.toContain("symbolRisks");
    expect(body).not.toContain("archetypeRisks");
    // 모든 종목에 똑같이 나오던 그 문장의 재료도 화면에서 안 읽는다.
    expect(body).not.toContain("invalidation.text");
  });

  it("근거는 실수치에서 조립한다 — 화면이 문장을 되파싱하지 않는다", () => {
    expect(depth).toContain("depthEvidenceRows(pick, hook)");
    expect(depth).not.toMatch(/signal\.scale\s*\.split/);
  });

  it("레거시 섹션 제목이 새 템플릿에 없다", () => {
    for (const legacy of ["오늘 발견 포인트", "차트 균형", "신호 혼조", "세부 이벤트", "원문 기반 요약"]) {
      expect(depth, `레거시 혼입: ${legacy}`).not.toContain(legacy);
    }
  });
});

describe("위계 — 박스 하나, accent 하나 (DS-03 완료 기준 3·4)", () => {
  it("카드 결론이 1걸음 첫 줄로 이어지고, 그 걸음에서 1회만 나온다", () => {
    // 카드와 **같은 것**을 쓴다 — 두 화면이 다른 말을 하면 어느 쪽도 못 믿는다.
    expect(depth).toContain("const hook = pick.cardType?.hook ?? pickHook(pick);");
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    expect(body.match(/data-testid="depth-hook"/g)?.length ?? 0).toBe(1);
  });

  it("surface-2 는 **버튼에만** 쓴다 — 본문에 박스를 두지 않는다", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    /**
     * 하단 고정 바의 보조 버튼(닫기)이 surface-2 를 쓴다(2026-08-31). 그건 버튼이지
     * 「우리 기록」 같은 정보 박스가 아니다 — 규칙이 금한 것은 본문 박스다.
     */
    for (const m of body.match(/bg-ds-surface-2[^"]*"/g) ?? []) {
      expect(body.slice(Math.max(0, body.indexOf(m) - 400), body.indexOf(m))).toMatch(/<button/);
    }
  });

  it("accent 는 **행동 버튼**에만 쓴다 — 강조가 여럿이면 강조가 아니다", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    // 걸음 본문에는 accent 가 없다. 다음 버튼·즐겨찾기 버튼만 accent 배경을 쓴다.
    const accents = body.match(/bg-ds-accent/g)?.length ?? 0;
    expect(accents).toBe(1); // 즐겨찾기 버튼(다음 버튼은 DepthSteps 에 있다)
    expect(body).not.toContain("text-ds-accent");
  });

  it("타이포 — 걸음 제목과 결론이 같은 급(display-sm)이고, 그 아래는 본문·캡션뿐이다", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    expect(body).toContain("text-ds-display-sm");
    // 섹션 라벨(mono)이 사라졌다 — 걸음마다 제목이 하나라 라벨 층이 필요 없다.
    expect(body).not.toContain("text-ds-label tracking-[0.06em]");
  });

  it("걸음 안에서 덩어리 간격은 24px 단위다", () => {
    expect(readFileSync(new URL("../components/DepthSteps.tsx", import.meta.url), "utf8")).toContain("mt-s6");
  });

  /** WO-RESET-05 §4-1 — 맨숫자 나열을 지웠다. 이제 비교 문장이 붙은 것만 나간다. */
  it("[완료 7] 화면이 맨숫자를 직접 나열하지 않는다 — 3걸음은 서버가 굳힌 것만 그린다", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    expect(body).not.toContain('WANTED = ["PER", "PBR", "EPS", "배당수익률"]');
    expect(body).toContain("const companyGroups = pick.companyRead ?? [];");
    // 비교 문장은 `companyRead` 가 만들고 화면은 그리기만 한다.
    const steps = readFileSync(new URL("../components/DepthSteps.tsx", import.meta.url), "utf8");
    expect(steps).toContain('data-testid="depth-comparison"');
    expect(steps).toContain("{row.comparison}");
  });

  it("상세는 데스크톱에서 퍼지지 않는다 — 480px 중앙 정렬 (DS-06 §6-1)", () => {
    // 주석의 서술을 세지 않도록 클래스 속성 안에서만 찾는다.
    const inClasses = (depth.match(/className="[^"]*max-w-\[480px\][^"]*"/g) ?? []).length;
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

  it("[완료 12] 확보 안 된 걸음은 목록에서 빠져 통째로 사라진다", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    // 걸음 자체가 `steps` 에 없으면 렌더 분기에 도달하지 않는다.
    expect(body).toContain('{step === "why" && (');
    expect(body).toContain('{step === "company" && (');
  });

  it("비교 기준이 없으면 그 숫자를 아예 안 보여준다 — 규칙은 fomo-core 가 지킨다", () => {
    // 화면은 판단하지 않는다. `companyRead` 가 비교 문장 없는 줄을 애초에 안 만든다.
    const core = readFileSync(
      new URL("../../../packages/fomo-core/src/keyword-cards/company-read.ts", import.meta.url), "utf8"
    );
    expect(core).toContain("comparison: string;");
    expect(core).toContain("비교 기준이 없으면 그 숫자를 안 보여준다");
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
  it("본문 스크롤 영역에 하단 여백이 있다 — **고정 바 높이만큼**(2026-08-31)", () => {
    // 40px → 112px: 하단 고정 바(버튼 44 + 여백)에 마지막 줄이 가리면 안 된다.
    expect(depth).toContain("pb-[calc(112px+env(safe-area-inset-bottom))]");
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

  it("헤더는 `닫기` 텍스트가 아니라 뒤로 화살표이고, 이전 **걸음**으로 간다", () => {
    expect(depth).toContain('aria-label={index > 0 ? "이전 걸음" : "뒤로"}');
    expect(depth).toContain("onClick={back}");
    // 1걸음에서만 카드로 돌아간다.
    expect(depth).toContain("const back = () => (index > 0 ? goPrev() : dismiss());");
  });

  /** WO-RESET-01 A-3 — 관심(★)을 화면에서 뺐다. 하단 CTA 를 두지 않는 규칙은 그대로다. */
  it("하단 CTA 도 ★ 도 두지 않는다", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    expect(body).not.toContain("h-btn-primary");
    expect(body).not.toContain('aria-label={watched');
  });
});

/**
 * WO-HOOK-02 — 상세가 답해야 하는 질문은 하나다: **왜 조용히 사고 있는가.**
 * 그 답이 없으면 상세는 HTS 필터로 다 나오는 기본 정보 나열이다.
 */
describe("WO-HOOK-02 — 왜 지금 사는가", () => {
  it("[완료 6] 왜 지금 사는가는 **2걸음**이다 — 신호 다음, 회사보다 앞", () => {
    const body = depth.slice(depth.indexOf("export function QuietPickDepth"));
    const at = (needle: string) => {
      const i = body.indexOf(needle);
      expect(i, `없음: ${needle}`).toBeGreaterThan(-1);
      return i;
    };
    expect(at('step === "why"')).toBeGreaterThan(at('step === "signal"'));
    expect(at('step === "why"')).toBeLessThan(at('step === "company"'));
  });

  /**
   * WO-RESET-02 PART C — 판정은 전부 fomo-core 가 한다. 화면은 임계를 다시 두지 않는다:
   * 날짜 항목은 서버가 굽고(`pick.whyNow`), 특이 여부는 `whyNowStateEvents` 가 정한다.
   */
  it("[완료 5] 특이 판정은 fomo-core 가 한다(화면이 임계를 다시 두지 않는다)", () => {
    expect(depth).toContain("whyNowStateEvents");
    expect(depth).not.toMatch(/percentile\s*<=\s*\d/);
    expect(depth).not.toMatch(/pctAboveYearLow\s*<=\s*\d/);
  });

  it("[완료 8] 꼬리표가 붙고, 문안을 화면이 짓지 않는다", () => {
    expect(depth).toContain("WHY_NOW_TIMELINE_DISCLAIMER");
    expect(depth).toContain('data-testid="depth-why-now-note"');
  });

  it("[완료 4] 공시 제목은 **사람 말**로 오고 원문 링크가 함께 붙는다", () => {
    expect(depth).toContain('data-testid="depth-why-now-source"');
    expect(depth).toContain('target="_blank"');
    expect(depth).toContain('rel="noreferrer noopener"');
    // 번역은 fomo-core 가 한다 — 화면이 제목을 손대지 않는다.
    const core = readFileSync(
      new URL("../../../packages/fomo-core/src/keyword-cards/why-now.ts", import.meta.url), "utf8"
    );
    expect(core).toContain("disclosurePhrase(d.title)");
  });

  it("[완료 4] 공시 0건 줄을 서버가 줄 때만 그린다", () => {
    expect(depth).toContain("pick.whyNowQuietNote");
    expect(depth).toContain('data-testid="depth-why-now-quiet"');
  });

  it("완료 기준 3 — 근거는 2줄 상한이고 앞면 훅을 넘겨받아 중복을 뺀다", () => {
    const sections = readFileSync(new URL("../lib/depthSections.ts", import.meta.url), "utf8");
    expect(sections).toContain("DEPTH_EVIDENCE_MAX = 2");
    expect(sections).toContain("rows.slice(0, DEPTH_EVIDENCE_MAX)");
    expect(sections).toContain("hookSaysLongest");
    expect(depth).toContain("depthEvidenceRows(pick, hook)");
  });

  it("완료 기준 7 — `7일 아직` 류 채점 상태 문구가 원장 계산에도 없다", () => {
    const record = stripComments(readFileSync(new URL("../lib/ourRecord.ts", import.meta.url), "utf8"));
    for (const legacy of ["7일 아직", "30일 아직", "90일 아직"]) {
      expect(record, `채점 상태 문구 잔존: ${legacy}`).not.toContain(legacy);
    }
    expect(record).toContain("graded");
  });

  it("완료 기준 8 — 박스와 accent 가 우리 기록 하나뿐이다", () => {
    // `왜 지금 사는가` 는 박스가 없다(§2-4) — surface-2 도, accent 도 쓰지 않는다.
    const why = depth.slice(depth.indexOf('title="왜 지금 사는가"'), depth.indexOf('title="근거"'));
    expect(why).not.toContain("bg-ds-surface-2");
    expect(why).not.toContain("ds-accent");
  });

  it("[완료 1] 왼쪽 열은 **날짜**이고 고정폭이다(줄마다 끝이 흔들리지 않는다)", () => {
    expect(depth).toContain('w-[64px] shrink-0 font-mono text-ds-label text-ds-text-2');
    // 화면이 `8월 4일` 을 짓지 않는다 — fomo-core 의 `whenLabel` 이 만들어 페이로드로 온다.
    expect(depth).not.toMatch(/월\s*\$\{/);
  });
});
