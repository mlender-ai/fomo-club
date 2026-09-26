/**
 * 고래 탭 (UI-07) — 완료 확인과 「하지 말 것」.
 *
 * - 모집단 경고를 빼지 말 것 · 갭을 확정된 사실처럼 쓰지 말 것
 * - 지갑 주소 전체를 노출하지 말 것 (앞뒤만)
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WhaleWalletBody } from "../components/tabs/WhaleWalletBody";
import { LEADERBOARD_NOTE, POPULATION_WARNING, WhalesBody } from "../components/tabs/WhalesBody";
import { FULL_ADDRESS, checkPayload, shortAddress, walletKey } from "../lib/lab/fce-payload";
import { funnelStages } from "../lib/lab/whales";
import { fixtures } from "./fixtures/lab";

const data = fixtures();
const w = data.whales;
const html = renderToStaticMarkup(createElement(WhalesBody, { data: w }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const b = w.board as NonNullable<typeof w.board>;

describe("① 갭 Hero · 모집단 경고", () => {
  it("Hero 가 FCE 가 낸 갭이다 — 박아 둔 65.8% 가 아니다", () => {
    expect(b.gap?.gapPp).toBe(35.3);
    const hero = html.slice(html.indexOf('class="ui-hero"'), html.indexOf("</header>"));
    expect(text(hero)).toContain("35.3%p");
    expect(text(hero)).toContain("72.3% − 37.0%");
    // 연구 01 의 **제목**에는 65.8 이 남는다 — 연구 노트의 질문(09-19) 그대로다. Hero 에는 없다.
    expect(text(hero)).not.toContain("65.8");
  });

  it("경고 한 줄이 Hero 바로 아래 있다", () => {
    const hero = html.indexOf('class="ui-hero"');
    const warn = html.indexOf(POPULATION_WARNING);
    const next = html.indexOf('class="ui-card', hero);
    expect(warn).toBeGreaterThan(hero);
    expect(warn).toBeLessThan(next);
  });

  it("갭을 확정처럼 쓰지 않는다 — '확인 중'", () => {
    expect(POPULATION_WARNING).toMatch(/다른 모집단/);
    expect(POPULATION_WARNING).toMatch(/확인 중/);
  });
});

describe("② 갭 비교 · 반사실", () => {
  it("비교표 — 승률 · 손익비 · 거래 수 · 평균 보유 · 진입 지연 · 청산 방식", () => {
    for (const k of ["승률", "손익비", "거래 수", "평균 보유", "진입 지연", "청산 방식"]) expect(text(html)).toContain(k);
  });

  it("반사실이 있고, FCE 단서(우리 출구 결함)를 떼지 않는다", () => {
    expect(text(html)).toMatch(/반사실 · 고래 청산을 그대로 따랐다면/);
    expect(b.exit?.verdict).toBe("EXIT_B_BETTER");
    expect(b.exit?.caveat).toMatch(/holding_bars/);
    expect(text(html)).toMatch(/결함/);
  });
});

describe("③ 추적 지갑", () => {
  it("자격 통과 지갑이 통계와 함께 — 승률 · 표본 · 레버리지 · 최근", () => {
    expect(b.wallets.length).toBe(3);
    const rows = (html.match(/class="ui-row"/g) ?? []).length;
    expect(rows).toBeGreaterThanOrEqual(3);
    expect(text(html)).toMatch(/승률 74\.1% · N 54 · \d+~\d+배/);
  });

  it("상세 — 보유 · 최근 체결 · 추종 성적", () => {
    const d = renderToStaticMarkup(createElement(WhaleWalletBody, { data: w, walletKey: b.wallets[0]?.key ?? "" }));
    expect(text(d)).toMatch(/지금 보유 \d+개/);
    expect(text(d)).toMatch(/추종 승률/);
    expect(text(d)).toMatch(/최근 체결/);
  });
});

describe("④ 깔때기", () => {
  it("82 → 73 → 10 → 3 — FCE 순서(유형 → 표본 → 승률)", () => {
    expect(b.funnel?.stages.map((s) => s.left)).toEqual([82, 73, 10, 3]);
    expect(b.funnel?.consistent).toBe(true);
  });

  it("뺀 끝이 FCE 통과 수와 다르면 알린다", () => {
    const f = funnelStages({
      population: 10, populationNote: null, excludedType: 1, excludedByType: {}, sampleBelow: 2, winBelow: 3, eligible: 5, minSample: 30, minWinPct: 55,
    });
    expect(f.consistent).toBe(false);
  });
});

describe("⑤⑥⑦ 옆 칸", () => {
  it("관련 연구에 FCE 가 확인 중인 가설", () => {
    expect(text(html)).toMatch(/확인 중인 가설/);
    for (const h of b.gap?.hypotheses ?? []) expect(text(html)).toContain(h.label);
  });

  it("24시간 관측 — 다중체결 · 지갑 · 체결 · 최대 명목 · 강등", () => {
    expect(text(html)).toMatch(/24시간 관측/);
    expect(text(html)).toMatch(/전부 미검증 · 푸시 강등/);
  });

  it("리더보드에 모집단 주석", () => {
    expect(text(html)).toContain(LEADERBOARD_NOTE);
    expect(text(html)).toMatch(/사후 채점 29,040건/);
  });
});

describe("지갑 주소 전체를 노출하지 않는다", () => {
  it("조립본 · 화면 어디에도 40자리 주소가 없다", () => {
    expect(FULL_ADDRESS.test(JSON.stringify(w))).toBe(false);
    expect(FULL_ADDRESS.test(html)).toBe(false);
  });

  it("업로드에 전체 주소가 섞이면 거절한다", () => {
    const full = "0x020ca66c30bec2c4fe3861a94e4db4a498a35872";
    const { problems } = checkPayload({
      at: new Date().toISOString(),
      tracks: [{ key: "crypto", label: "크립토", status: "running", startingCapital: 500 }],
      whale: { walletsTotal: 1, eligible: 1, board: { wallets: [{ short: full }] } },
    });
    expect(problems.map((p) => p.path)).toContain("whale.board");
  });

  it("줄이는 규칙 — 앞 6 · 뒤 4", () => {
    const full = "0x020ca66c30bec2c4fe3861a94e4db4a498a35872";
    expect(shortAddress(full)).toBe("0x020c…5872");
    expect(walletKey(full)).toBe("0x020c5872");
  });
});
