import { describe, it, expect } from "vitest";
import {
  detectMacroMove, linkMacroToPicks, macroHook, macroSupport, formatMacroValue,
  MACRO_INDICATORS, MACRO_SENSITIVITY, MACRO_MIN_LINKED, MACRO_MIN_STREAK,
  type MacroSeries, type RecentPick,
} from "../src/keyword-cards/macro-link";

const series = (id: MacroSeries["id"], values: number[]): MacroSeries => ({
  id,
  points: values.map((value, i) => ({ date: `2026-08-${String(10 + i).padStart(2, "0")}`, value })),
});

describe("지표 움직임 — 아무 날에나 카드를 만들지 않는다", () => {
  it("연속 방향 + 누적 변동률을 둘 다 넘어야 한다", () => {
    const move = detectMacroMove(series("usdkrw", [1380, 1390, 1400, 1412]))!;
    expect(move.direction).toBe("up");
    expect(move.streakDays).toBe(3);
    expect(move.from).toBe(1380);
    expect(move.to).toBe(1412);
  });

  it("하루 튀었다 돌아온 것은 흐름이 아니다", () => {
    expect(detectMacroMove(series("usdkrw", [1380, 1420, 1381, 1382]))).toBeNull();
  });

  it("연속이어도 변동률이 작으면 만들지 않는다", () => {
    expect(detectMacroMove(series("usdkrw", [1380, 1381, 1382, 1383]))).toBeNull();
  });

  it("지표마다 임계가 다르다 — 환율 1.5%와 VIX 1.5%는 다른 사건이다", () => {
    const byId = Object.fromEntries(MACRO_INDICATORS.map((i) => [i.id, i.movePct]));
    expect(byId["usdkrw"]).toBeLessThan(byId["vix"]!);
  });

  it("관측이 모자라면 연속으로는 판정하지 않는다", () => {
    /**
     * 두 점은 연속 3일이 못 된다. 다만 **급변으로는 잡힐 수 있다**(MACRO-01) — 하루에
     * 임계를 넘게 움직이면 연속이 아니어도 사건이다. 그래서 연속 판정이 안 된다는 것을
     * 보려면 급변에도 안 걸리는 폭을 써야 한다.
     */
    expect(detectMacroMove(series("usdkrw", [1380, 1381]))).toBeNull();
    expect(MACRO_MIN_STREAK).toBe(3);

    // 같은 두 점이라도 하루 변동이 크면 급변으로 잡힌다 — 연속이 아니라 급변이다.
    // 1,400·1,450 같은 기준선을 **넘지 않는** 구간을 고른다. 넘으면 `level` 이 먼저 이긴다.
    const spike = detectMacroMove(series("usdkrw", [1420, 1445]))!;
    expect(spike.kind).toBe("spike");
    expect(spike.streakDays).toBe(1);
  });

  it("최신 관측일을 남긴다 — 지표는 하루이틀 늦게 나온다", () => {
    expect(detectMacroMove(series("usdkrw", [1380, 1390, 1400, 1412]))!.asOf).toBe("2026-08-13");
  });
});

describe("우리 종목과의 연결 — **이게 카드의 존재 이유다** (§B-3)", () => {
  const move = detectMacroMove(series("usdkrw", [1380, 1390, 1400, 1412]))!;
  const pick = (canonical: string, sector: string): RecentPick =>
    ({ canonical, sector, pickedAt: "2026-08-20" });

  it("유리·불리 업종으로 나눈다", () => {
    const link = linkMacroToPicks(move, [pick("한화에어로", "기계"), pick("대한항공", "항공사")])!;
    expect(link.favored.map((p) => p.canonical)).toEqual(["한화에어로"]);
    expect(link.hurt.map((p) => p.canonical)).toEqual(["대한항공"]);
  });

  it("연결이 2곳 미만이면 **카드를 만들지 않는다** — 그냥 뉴스가 된다", () => {
    expect(linkMacroToPicks(move, [pick("한화에어로", "기계")])).toBeNull();
    expect(linkMacroToPicks(move, [])).toBeNull();
    expect(MACRO_MIN_LINKED).toBe(2);
  });

  it("업종을 모르는 종목은 잇지 않는다 — 억지로 연결하지 않는다", () => {
    const unknown = [{ canonical: "가", pickedAt: "2026-08-20" }, { canonical: "나", pickedAt: "2026-08-20" }];
    expect(linkMacroToPicks(move, unknown)).toBeNull();
  });

  it("내릴 때는 유리·불리가 뒤집힌다", () => {
    const down = detectMacroMove(series("usdkrw", [1412, 1400, 1390, 1380]))!;
    const link = linkMacroToPicks(down, [pick("한화에어로", "기계"), pick("대한항공", "항공사")])!;
    expect(link.favored.map((p) => p.canonical)).toEqual(["대한항공"]);
    expect(link.hurt.map((p) => p.canonical)).toEqual(["한화에어로"]);
  });
});

describe("예측하지 않는다 (§F-1 · 완료 확인 8)", () => {
  const move = detectMacroMove(series("usdkrw", [1380, 1390, 1400, 1412]))!;
  const link = linkMacroToPicks(move, [
    { canonical: "가", sector: "기계", pickedAt: "2026-08-20" },
    { canonical: "나", sector: "항공사", pickedAt: "2026-08-20" },
  ])!;

  it("일반 원리만 말한다 — 이 종목이 어떻게 될지는 말하지 않는다", () => {
    const text = [macroHook(move), link.principle, ...macroSupport(link)].join(" ");
    for (const banned of ["오를 거", "내릴 거", "될 거", "전망", "예상", "추천", "사세요", "수혜주", "유망"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("모든 감응도 문구가 회사가 아니라 **회사 유형**을 말한다", () => {
    for (const [id, s] of Object.entries(MACRO_SENSITIVITY)) {
      for (const t of [s.upText, s.downText]) {
        expect(t, id).toMatch(/회사|자산/);
        expect(t, id).not.toMatch(/이 종목|오를|내릴/);
      }
    }
  });

  it("보조 줄이 **우리 종목과의 연결 한 줄뿐**이다 — 그게 우리만 말할 수 있는 것이다", () => {
    /**
     * 종전에는 `[값 변화, 연결]` 두 줄이었다. 그런데 카드가 값 변화를 이미 위에 그리고
     * 있어서 **같은 숫자가 한 카드에 두 번** 나왔다(MACRO-01 §D-2). 값은 카드가 그리고
     * 이 줄은 존재 이유 하나만 말한다.
     */
    const support = macroSupport(link);
    expect(support).toHaveLength(1);
    expect(support[0]).toBe("우리가 최근 짚은 종목 중 2곳이 여기 닿아요");
    // 값이 여기 섞여 들어오면 카드에서 중복된다.
    expect(support[0]).not.toMatch(/→/);
  });
});

describe("값 표기", () => {
  const find = (id: string) => MACRO_INDICATORS.find((i) => i.id === id)!;
  it("단위에 맞춘다", () => {
    expect(formatMacroValue(find("usdkrw"), 1438.4)).toBe("1,438원");
    expect(formatMacroValue(find("oil"), 83.9)).toBe("$83.9");
    expect(formatMacroValue(find("ust10y"), 4.67)).toBe("4.67%");
  });
});
