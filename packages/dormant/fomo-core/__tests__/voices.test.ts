import { describe, it, expect } from "vitest";
import {
  SITUATION_OPTIONS,
  RESOLVE_OPTIONS,
  composeVoice,
  curatedVoices,
} from "../src/voices";

describe("composeVoice", () => {
  it("감정+상황+의연함을 결정적으로 한 줄로 조합", () => {
    const line = composeVoice({
      emotion: "fear",
      situationKey: "blue_day",
      resolveKey: "no_panic",
    });
    expect(line).toBe("공포 · 오늘도 파란 날이었지만, 허둥대진 않았어요.");
  });

  it("잘못된 상황 키 → null (가짜 조합 금지)", () => {
    expect(
      composeVoice({ emotion: "fear", situationKey: "nope", resolveKey: "no_panic" })
    ).toBeNull();
  });

  it("잘못된 의연함 키 → null", () => {
    expect(
      composeVoice({ emotion: "fear", situationKey: "blue_day", resolveKey: "yolo" })
    ).toBeNull();
  });

  it("잘못된 감정 → null", () => {
    expect(
      composeVoice({
        emotion: "rage" as never,
        situationKey: "blue_day",
        resolveKey: "no_panic",
      })
    ).toBeNull();
  });
});

describe("가드레일 — 무모함 키 부재 (스키마로 강제)", () => {
  const RECKLESS = [
    "all_in",
    "full_bet",
    "yolo",
    "leverage",
    "buy_more",
    "average_down",
    "double_down",
  ];
  it("RESOLVE_OPTIONS에 무모함 키가 존재하지 않는다", () => {
    const keys = RESOLVE_OPTIONS.map((o) => o.key);
    for (const bad of RECKLESS) expect(keys).not.toContain(bad);
  });
  it("라벨에 금칙 표현(배팅/추매/존버/가즈아) 없음", () => {
    const all = [...SITUATION_OPTIONS, ...RESOLVE_OPTIONS].map((o) => o.label).join(" ");
    for (const word of ["배팅", "추매", "존버", "가즈아", "풀매수"]) {
      expect(all).not.toContain(word);
    }
  });
});

describe("선택지 무결성", () => {
  it("상황·의연함 각 5~6개, 키 중복 없음", () => {
    expect(SITUATION_OPTIONS.length).toBeGreaterThanOrEqual(5);
    expect(RESOLVE_OPTIONS.length).toBeGreaterThanOrEqual(5);
    const keys = [...SITUATION_OPTIONS, ...RESOLVE_OPTIONS].map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("모든 유효 조합이 null 없이 조합된다", () => {
    for (const s of SITUATION_OPTIONS) {
      for (const r of RESOLVE_OPTIONS) {
        expect(
          composeVoice({ emotion: "fomo", situationKey: s.key, resolveKey: r.key })
        ).not.toBeNull();
      }
    }
  });
});

describe("curatedVoices (콜드스타트 폴백)", () => {
  it("같은 날짜 → 동일 결과 (결정적)", () => {
    expect(curatedVoices("2026-06-11")).toEqual(curatedVoices("2026-06-11"));
  });
  it("다른 날짜 → 다른 선두 항목 (돌아올 이유)", () => {
    const a = curatedVoices("2026-06-11")[0];
    const b = curatedVoices("2026-06-12")[0];
    expect(a).not.toEqual(b);
  });
  it("기본 3개, emotion·text 포함", () => {
    const items = curatedVoices("2026-06-11");
    expect(items).toHaveLength(3);
    for (const v of items) {
      expect(v.text.length).toBeGreaterThan(5);
      expect(v.emotion).toBeTruthy();
    }
  });
});
