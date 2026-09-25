/**
 * 텍스트 예산 (UI-FIX A-2) — **넘으면 CI 가 떨어진다.**
 *
 * > 화면 대부분이 설명 문단이었다. 지시서가 "주석을 붙여라" 를 반복했고, 그게 전부 본문 문단이 됐다.
 *
 * 여섯 탭 본문을 실측 견본(`fixtures/lab.ts`)으로 **서버 렌더**해 HTML 을 잰다. `ⓘ` 바텀시트는
 * 닫힌 상태라 DOM 에 없다 — 문단을 시트로 옮기면 통과하고, 화면에 두면 떨어진다.
 *
 * | 항목 | 상한 |
 * |---|---|
 * | 설명 문단(2줄 이상 산문) | 화면당 0개 — `<p>` 하나가 {@link PROSE} 자를 넘으면 문단이다 |
 * | 큰 숫자 아래 보조 문구 | 1줄 · {@link HERO_META} 자 |
 * | 목록 행 | 이름 1줄 + 부제 1줄 — 둘 다 말줄임 · 부제 {@link ROW_SUB} 자 |
 * | 알약 안 글자 | {@link PILL} 자 (빈칸·가운뎃점 제외) |
 * | 헤더·카드 아래 부제 | 1줄 · {@link SUBTITLE} 자 |
 *
 * 글자 수는 390px 폰 기준이다. 본문 15px 한글이 한 줄에 ~24자, 캡션 12.5px 가 ~28자 들어간다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JournalBody } from "../components/tabs/JournalBody";
import { OverviewBody } from "../components/tabs/OverviewBody";
import { PositionsBody } from "../components/tabs/PositionsBody";
import { ResearchBody } from "../components/tabs/ResearchBody";
import { StrategiesBody } from "../components/tabs/StrategiesBody";
import { WhalesBody } from "../components/tabs/WhalesBody";
import { fixtures } from "./fixtures/lab";

/** 이보다 긴 `<p>` 는 폰에서 두 줄을 넘는다 — 설명 문단으로 본다. */
const PROSE = 32;
const HERO_META = 16;
const ROW_SUB = 24;
const PILL = 6;
const SUBTITLE = 24;

const data = fixtures();

const TABS: [string, ComponentType<{ data: never }>, unknown][] = [
  ["Overview", OverviewBody as ComponentType<{ data: never }>, data.overview],
  ["전략", StrategiesBody as ComponentType<{ data: never }>, data.strategies],
  ["포지션", PositionsBody as ComponentType<{ data: never }>, data.positions],
  ["고래", WhalesBody as ComponentType<{ data: never }>, data.whales],
  ["연구", ResearchBody as ComponentType<{ data: never }>, data.research],
  ["복기", JournalBody as ComponentType<{ data: never }>, data.journal],
];

// ── HTML 에서 글자 꺼내기 ─────────────────────────────────────────────────

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");

/** 태그를 벗긴 보이는 글자. */
const text = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** 글자 수 — 코드 포인트 기준(한글 한 자 = 1). */
const len = (s: string) => [...s].length;

/** `<tag class="… cls …">…</tag>` 의 안쪽. 같은 태그가 안에 중첩되지 않는 요소에만 쓴다. */
function inner(html: string, tag: string, cls: string): string[] {
  const re = new RegExp(`<${tag}[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  return [...html.matchAll(re)].map((m) => m[1] ?? "");
}

/** 모든 `<p>` 의 보이는 글자. */
function paragraphs(html: string): string[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1] ?? ""));
}

/** 알약 — 안의 점(`ui-pill-dot`)을 먼저 걷어낸다. */
function pills(html: string): string[] {
  const flat = html.replace(/<span class="ui-pill-dot"[^>]*><\/span>/g, "");
  return inner(flat, "span", "ui-pill").map(text);
}

/** 링크 글자를 뺀 본문. 문서 번호는 **링크 글자로만** 허용된다(A-4). */
const withoutLinks = (html: string) => text(html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, " "));

const render = (C: ComponentType<{ data: never }>, d: unknown) =>
  renderToStaticMarkup(createElement(C, { data: d as never }));

// ── 규칙 ─────────────────────────────────────────────────────────────────

describe.each(TABS)("텍스트 예산 — %s", (name, Body, payload) => {
  const html = render(Body, payload);

  it("설명 문단이 0개다 — 2줄 넘는 산문은 ⓘ 로 접는다", () => {
    const long = paragraphs(html).filter((p) => len(p) > PROSE);
    expect(long, `${name}: ${long.join(" | ")}`).toEqual([]);
  });

  it(`큰 숫자 아래 보조 문구는 1줄 · ${HERO_META}자 안`, () => {
    for (const m of inner(html, "p", "ui-hero-meta").map(text)) {
      expect(len(m), m).toBeLessThanOrEqual(HERO_META);
    }
  });

  it(`헤더·카드 부제는 1줄 · ${SUBTITLE}자 안`, () => {
    for (const d of [...inner(html, "p", "sh-desc"), ...inner(html, "p", "ui-card-desc")].map(text)) {
      expect(len(d), d).toBeLessThanOrEqual(SUBTITLE);
    }
  });

  it(`알약 안 글자는 ${PILL}자 안`, () => {
    for (const p of pills(html)) {
      expect(len(p.replace(/[\s·]/g, "")), p).toBeLessThanOrEqual(PILL);
    }
  });

  it(`목록 행 = 이름 1줄 + 부제 1줄 · 부제 ${ROW_SUB}자 안`, () => {
    const rows = inner(html, "li", "ui-row");
    for (const row of rows) {
      expect(inner(row, "span", "ui-row-title").length).toBeLessThanOrEqual(1);
      expect(inner(row, "span", "ui-row-sub").length).toBeLessThanOrEqual(1);
    }
    for (const sub of inner(html, "span", "ui-row-sub").map(text)) {
      expect(len(sub), sub).toBeLessThanOrEqual(ROW_SUB);
    }
  });

  it("에러 코드·문서 번호·내부 용어가 없다 (A-4)", () => {
    const body = withoutLinks(html)
      // C-6 이 이 알약 하나만 허용했다.
      .replace("모집단 다름", "");
    expect(body).not.toMatch(/\b[a-z]+(?:_[a-z]+)+\b/); // fill_price_outside_observed_range
    expect(body).not.toMatch(/LAB-\d|§|연구 \d{2}/);
    expect(body).not.toMatch(/invariant|\bNAV\b|커버리지|모집단/);
  });

  it("설명을 지운 게 아니라 접었다 — ⓘ 가 있다 (A-3)", () => {
    expect(html).toMatch(/class="ui-info"/);
  });
});

describe("전략 탭 (C-2 · B-6)", () => {
  const html = render(StrategiesBody as ComponentType<{ data: never }>, data.strategies);

  it("hero 가 문장이 아니라 숫자다 — `넘은 수 / 잰 수`", () => {
    expect(text(inner(html, "p", "ui-hero-value")[0] ?? "")).toMatch(/^\d+ \/ \d+$/);
  });

  it("행마다 반복되던 `기준선 없음` · `운용중` 이 없다", () => {
    expect(text(html)).not.toMatch(/기준선 없음|운용중/);
  });

  it("상태는 사람 말이다 — 체결 가격 이상 · 데이터 불일치 · 지역 차단", () => {
    const subs = inner(html, "span", "ui-row-sub").map(text);
    expect(subs).toEqual(expect.arrayContaining(["체결 가격 이상", "데이터 불일치", "지역 차단"]));
  });
});

describe("같은 질문에 같은 답 (B-4 · B-5)", () => {
  it("전략 탭 기준선 = Overview 전략 경쟁 기준선", () => {
    for (const row of data.strategies.rows.filter((r) => r.returnOverMdd !== null)) {
      const race = data.overview.competition.rows.find((c) => c.key === row.key);
      expect(row.baseline?.value).toBe(race?.baseline?.value);
      expect(row.beatsBenchmark).toBe(race?.beats);
    }
    expect(data.strategies.beatCount).toBe(data.overview.competition.beaten);
  });

  it("Overview 누적 거래 = 복기 닫힌 거래", () => {
    expect(data.overview.stats.trades).toBe(data.journal.total.count);
  });

  it("전략 행 N = 원장 N (크립토·고래)", () => {
    for (const key of ["crypto", "whale"]) {
      expect(data.strategies.rows.find((r) => r.key === key)?.trades).toBe(data.overview.ledger[key]?.count);
    }
  });
});

describe("레이아웃이 한 줄을 지킨다 (B-1)", () => {
  const css = readFileSync(join(__dirname, "../app/ui.css"), "utf8");

  it("행 이름·부제는 줄바꿈 금지 + 말줄임", () => {
    const rule = css.match(/\.ui-row-title,\s*\.ui-row-sub\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("폰에서 이름 칸이 최소 폭을 갖는다 — 0 까지 밀리지 않는다", () => {
    expect(css).toMatch(/grid-template-columns:\s*32px minmax\(96px, 1fr\) auto/);
  });
});
