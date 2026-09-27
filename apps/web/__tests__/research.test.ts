/**
 * 연구 탭 (UI-08) — 완료 확인과 「하지 말 것」.
 *
 * - 제목을 명사형으로 쓰지 말 것 · 닫힌 연구를 지우지 말 것
 * - 결정 없이 닫지 말 것 · 근거 없이 "알아낸 것" 을 쓰지 말 것
 *
 * 노트는 **레포의 실제 파일**을 시드와 같은 파서로 읽는다(`fixtures/lab.ts` `NOTES`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResearchBody } from "../components/tabs/ResearchBody";
import { ResearchDetailBody, type ResearchDetailItem } from "../components/tabs/ResearchDetailBody";
import { decisionLine } from "../lib/lab/research";
import { isQuestion, parseNote } from "../lib/lab/research-note";
import { NOTES, NOW, fixtures } from "./fixtures/lab";

const data = fixtures();
const r = data.research;
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const list = renderToStaticMarkup(createElement(ResearchBody, { data: r }));

const note = (front: string, body = "## 결정\n정했다.\n") => `---\n${front}\n---\n\n${body}`;

describe("시드 7개 — 실제 파일 (완료 9 · 11)", () => {
  it("일곱 개가 다 있고 닫힌 것도 남아 있다", () => {
    expect(NOTES.map((n) => n.no)).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(NOTES.filter((n) => n.status === "closed").map((n) => n.no)).toEqual(["04", "05"]);
  });

  it("제목이 전부 질문형이다 (완료 3)", () => {
    for (const n of NOTES) expect(isQuestion(n.title), n.title).toBe(true);
    expect(isQuestion("고래 갭 조사")).toBe(false);
  });

  it("알아낸 것마다 출처가 있고 표시가 셋 중 하나다 (완료 8)", () => {
    for (const n of NOTES) {
      expect(n.findings.length, n.no).toBeGreaterThan(0);
      for (const f of n.findings) {
        expect(f.source.length, `${n.no} ${f.text}`).toBeGreaterThan(0);
        expect(["confirmed", "rejected", "pending"]).toContain(f.mark);
      }
    }
  });

  it("각 노트에 왜 · 가설 · 방법 · 결정이 있다", () => {
    for (const n of NOTES) {
      expect(n.why, n.no).toBeTruthy();
      expect(n.hypotheses.length, n.no).toBeGreaterThan(0);
      expect(n.methods.length, n.no).toBeGreaterThan(0);
      expect(n.decision, n.no).toBeTruthy();
    }
  });

  it("01 은 청산 반사실을 '기각' 으로 적지 않는다 — FCE 대조(09-26)가 뒤집었다", () => {
    const n01 = NOTES.find((n) => n.no === "01");
    const exit = n01?.findings.find((f) => f.text.includes("청산 반사실"));
    expect(exit?.mark).toBe("pending");
    expect(exit?.text).toMatch(/\+236\.86/);
    expect(exit?.note).toMatch(/holding_bars/);
  });
});

describe("파서 규칙 — 어기면 시드가 멈춘다", () => {
  it("명사형 제목은 거절", () => {
    expect(() => parseNote(note('no: "09"\ntitle: 고래 갭 조사\nstatus: open\nopened_at: 2026-09-01'))).toThrow(/질문형/);
  });

  it("결정 없이 닫으면 거절", () => {
    expect(() =>
      parseNote(note('no: "09"\ntitle: 되나\nstatus: closed\nverdict: "no"\nopened_at: 2026-09-01', "## 가설\n1. 된다\n"))
    ).toThrow(/결정 없이/);
  });

  it("출처 없는 알아낸 것은 거절", () => {
    expect(() =>
      parseNote(note('no: "09"\ntitle: 되나\nstatus: open\nopened_at: 2026-09-01', "## 지금까지 알아낸 것\n- ✓ 된다\n"))
    ).toThrow(/출처가 없다/);
  });

  it("번호 목록 · 해석 줄", () => {
    const n = parseNote(
      note(
        'no: "09"\ntitle: 되나\nstatus: open\nopened_at: 2026-09-01',
        "## 가설\n1. 하나\n2. 둘\n\n## 지금까지 알아낸 것\n- ✗ 아니다 | 실측\n  → 그래서 버린다\n"
      )
    );
    expect(n.hypotheses).toEqual(["하나", "둘"]);
    expect(n.findings[0]).toEqual({ mark: "rejected", text: "아니다", note: "그래서 버린다", source: "실측" });
  });
});

describe("A 목록", () => {
  it("hero 가 열린 질문 수다 (완료 1)", () => {
    expect(r.open).toBe(NOTES.filter((n) => n.status !== "closed").length);
    expect(text(list)).toMatch(new RegExp(`열린 질문 ${r.open} 닫힌 질문 ${r.closed}`));
  });

  it("필터 4개 — 전체 · 진행중 · 실매매 차단 · 닫힘 (완료 2)", () => {
    expect(text(list)).toMatch(/전체 7 진행중 4 실매매 차단 1 닫힘 2/);
    const closedOnly = renderToStaticMarkup(createElement(ResearchBody, { data: r, initialFilter: "closed" }));
    expect((closedOnly.match(/class="rs-entry is-closed"/g) ?? []).length).toBe(2);
    expect(closedOnly).not.toMatch(/class="rs-entry"/);
    const blocked = renderToStaticMarkup(createElement(ResearchBody, { data: r, initialFilter: "blocked" }));
    expect((blocked.match(/class="rs-entry(?: is-closed)?"/g) ?? []).length).toBe(1);
  });

  it("실매매 차단이 따로 · 빨강 (완료 5)", () => {
    expect(list).toMatch(/class="ui-pill is-dn[^"]*"[^>]*>(?:<span[^>]*><\/span>)?실매매 차단/);
  });

  it("닫힌 것에 결정 한 줄 · 열린 것에 경과일 (완료 6)", () => {
    expect(text(list)).toContain("결정 → 전략 3종을 폐기했다");
    expect(text(list)).toContain("결정 → 지금 1배 트랙을 만들지 않는다");
    expect(text(list)).toMatch(/\d+일째/);
  });

  it("실제 돈을 넣으려면 — 관문 셋 · 해결 수 (완료 10)", () => {
    expect(text(list)).toMatch(/실제 돈을 넣으려면/);
    expect(r.gates.map((g) => g.label)).toEqual(["강제청산 모델링", "호스트 상시화", "기준선을 넘은 전략"]);
    expect(text(list)).toMatch(/3개 중 0개 해결/);
  });

  it("결정 한 줄은 노트의 첫 굵은 글씨", () => {
    expect(decisionLine("**전략 3종을 폐기했다**(2026-09-22). 결과는…")).toBe("전략 3종을 폐기했다");
    expect(decisionLine("아직 없다. 기다린다.")).toBe("아직 없다");
  });
});

describe("B 상세 (완료 7 · 8 · 12)", () => {
  const html = renderToStaticMarkup(
    createElement(ResearchDetailBody, { item: data.researchDetail as unknown as ResearchDetailItem, now: NOW })
  );

  it("질문 · 왜 · 가설 · 방법 · 알아낸 것 · 결정 · 관련", () => {
    for (const s of ["왜 궁금한가", "가설", "어떻게 확인하나", "지금까지 알아낸 것", "결정", "관련"]) {
      expect(html).toContain(`<h2 class="rd-section-title">${s}</h2>`);
    }
    expect(html).toMatch(/<h1 class="rd-title">고래는/);
  });

  it("✓ · ✗ · · 가 다 나온다", () => {
    expect(html).toMatch(/aria-label="확인됨"/);
    expect(html).toMatch(/aria-label="기각"/);
    expect(html).toMatch(/aria-label="진행중"/);
  });

  it("결정은 강조 카드", () => {
    expect(html).toMatch(/class="rd-decision"/);
  });

  it("본문 폭 680", () => {
    const css = readFileSync(join(__dirname, "../app/ui.css"), "utf8");
    const g = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/\.rd \{[^}]*max-width: var\(--research-max\)/);
    expect(g).toMatch(/--research-max: 680px/);
  });
});
