import { describe, expect, it } from "vitest";
import { decideStep } from "../src/keyword-cards/decide-step";
import { reexposureHook, reexposureKindOf, kindOfSignal } from "../src/keyword-cards/reexposure";
import { WHY_NOW_FORBIDDEN } from "../src/keyword-cards/why-now";

/**
 * FIX-03 PART B — 마지막 걸음은 **요약이 아니라 결정을 돕는 자리**다.
 * 입력은 2026-09-04 프로덕션 실측(종근당 화면 + 재노출 5장)에서 가져왔다.
 */
const 종근당 = {
  signal: { kind: "volume_awakening", scale: "3배", days: 1, actors: "거래량" },
  disclosures: { count: 3, windowDays: 90 },
  company: [
    { title: "돈은 잘 버나요", summaryText: "매출도 영업이익도 늘었어요" },
    { title: "값은 어떤가요", summaryText: "PER·PBR이 다른 제약 12곳 가운데 낮은 편이에요" },
  ],
  exposure: { firstWhen: "8월 26일", firstPrice: 68800, count: 2 },
  currentPrice: 68500,
};

describe("한 문장 요약 — 나열하지 않는다 (B-4)", () => {
  it("신호와 회사 사실을 **한 문장**으로 묶는다", () => {
    expect(decideStep(종근당).headline).toBe("거래가 평소의 3배로 붙었고, 매출과 이익도 늘고 있어요");
  });

  it("실적이 줄었으면 그렇게 쓴다 — 좋게 포장하지 않는다", () => {
    const g = decideStep({ ...종근당, company: [{ title: "돈은 잘 버나요", summaryText: "매출도 영업이익도 줄었어요" }] });
    expect(g.headline).toContain("다만 매출과 이익은 줄었어요");
  });

  it("적자면 적자라고 쓴다", () => {
    const g = decideStep({ ...종근당, company: [{ title: "돈은 잘 버나요", summaryText: "지금은 영업에서 적자예요" }] });
    expect(g.headline).toContain("적자");
  });

  it("실적이 없으면 값으로, 값도 없으면 **회사 정보가 부족하다고** 말한다", () => {
    const onlyValue = decideStep({ ...종근당, company: [{ title: "값은 어떤가요", summaryText: "PBR이 다른 제약 12곳 가운데 낮은 편이에요" }] });
    expect(onlyValue.headline).toContain("값도 같은 업종보다 낮아요");
    const none = decideStep({ ...종근당, company: [] });
    expect(none.headline).toBe("거래가 평소의 3배로 붙었어요. 회사 정보는 아직 부족해요");
  });

  /**
   * 지시서 §B-4 예시는 `회사 실적도 괜찮아요` 인데 같은 절이 「평가하지 않는다」고 못을
   * 박았다. **규칙을 따르고 예시 문구를 사실형으로 바꿨다** — 그 결정을 이 검사로 고정한다.
   */
  it("평가어를 쓰지 않는다 — `괜찮아요`·`좋아요` 가 없다", () => {
    const combos = [
      "매출도 영업이익도 늘었어요",
      "매출도 영업이익도 줄었어요",
      "매출은 늘었는데 영업이익은 줄었어요",
      "지금은 영업에서 적자예요",
    ];
    for (const summaryText of combos) {
      const { headline } = decideStep({ ...종근당, company: [{ title: "돈은 잘 버나요", summaryText }] });
      expect(headline, headline).not.toMatch(/괜찮|좋아요|좋은|나쁜|훌륭|유망/);
      expect(WHY_NOW_FORBIDDEN.test(headline), headline).toBe(false);
    }
  });
});

describe("라벨-값 표 — 문장 나열이 아니다 (B-2)", () => {
  it("신호·공시·실적·값 네 줄이 라벨과 값으로 나온다", () => {
    expect(decideStep(종근당).rows).toEqual([
      { label: "거래", value: "평소의 3배" },
      { label: "공시", value: "최근 90일에 3건" },
      { label: "실적", value: "매출도 영업이익도 늘었어요" },
      { label: "값", value: "PER·PBR이 다른 제약 12곳 가운데 낮은 편이에요" },
    ]);
  });

  it("신호 종류마다 라벨이 다르다 — 거래·수급·임원을 같은 말로 부르지 않는다", () => {
    const label = (kind: string, extra: Record<string, unknown> = {}) =>
      decideStep({ signal: { kind, scale: "3배", days: 3, actors: "기관", ...extra } }).rows[0]?.label;
    expect(label("volume_awakening")).toBe("거래");
    expect(label("institution_streak")).toBe("수급");
    expect(label("insider_cluster")).toBe("임원");
    expect(label("market_divergence")).toBe("시장 대비");
  });

  it("공시 0건도 사실이다 — 감추지 않는다", () => {
    const g = decideStep({ ...종근당, disclosures: { count: 0, windowDays: 90 } });
    expect(g.rows.find((r) => r.label === "공시")!.value).toBe("최근 90일에 없어요");
  });

  it("수집 전이면 공시 줄이 아예 없다 — 0건과 미수집은 다르다", () => {
    const { rows } = decideStep({ signal: 종근당.signal });
    expect(rows.some((r) => r.label === "공시")).toBe(false);
  });

  it("재료가 없는 줄은 만들지 않는다", () => {
    const { rows } = decideStep({ signal: { kind: "volume_awakening" } });
    expect(rows).toEqual([]);
  });
});

describe("우리 기록 — 이 앱을 믿을 유일한 근거 (B-5)", () => {
  it("전에 짚은 날과 **그 뒤 변동**을 쓴다", () => {
    expect(decideStep(종근당).ourRecord).toBe("우리가 8월 26일에도 짚었고 그 뒤로 -0.4% 움직였어요");
  });

  it("마이너스를 숨기지 않고, 플러스에도 부호를 붙인다", () => {
    const up = decideStep({ ...종근당, currentPrice: 72000 });
    expect(up.ourRecord).toContain("+4.7%");
  });

  it("세 번 이상이면 몇 번인지 말한다", () => {
    const g = decideStep({ ...종근당, exposure: { firstWhen: "8월 26일", firstPrice: 68800, count: 3 } });
    expect(g.ourRecord).toBe("우리가 8월 26일부터 3번 짚었고 그 뒤로 -0.4% 움직였어요");
  });

  it("처음 짚는 종목이면 이 줄이 없다", () => {
    expect(decideStep({ signal: 종근당.signal }).ourRecord).toBeNull();
  });

  it("가격을 못 쟀으면 지어내지 않는다", () => {
    const g = decideStep({ ...종근당, currentPrice: null });
    expect(g.ourRecord).toBe("우리가 8월 26일에도 짚었고 그 뒤 가격은 아직 못 쟀어요");
  });
});

/**
 * FIX-03 PART A-3 — 실측 재노출 5장에서 `signal.reentry` 가 전부 비어 있었다.
 * 노출 이력의 지난번 사유로 판정한다. **종류가 바뀐 것만** 새로운 일이다.
 */
describe("다시 나온 종목의 훅 — 지난번과 무엇이 다른가 (A-3)", () => {
  it("지난번 수급 · 이번 거래량 → `이번엔 거래도 붙기 시작했어요` (녹십자홀딩스 실측)", () => {
    expect(
      reexposureHook({
        previousReason: "22거래일 만에 가장 길게 사고 있어요",
        signalKind: "volume_awakening",
        actors: "거래량",
      })
    ).toBe("이번엔 거래도 붙기 시작했어요");
  });

  it("지난번 거래량 · 이번 외국인 → 주체 이름을 그대로 쓴다", () => {
    expect(reexposureHook({ previousReason: "거래가 3배로 붙었어요", signalKind: "foreign_streak", actors: "외국인" }))
      .toBe("이번엔 외국인이 사기 시작했어요");
  });

  it("**같은 종류로 또 나온 것은 새로운 일이 아니다** — null (유진기업·UAMY 실측)", () => {
    expect(reexposureHook({ previousReason: "22거래일 만에 가장 길게 사고 있어요", signalKind: "institution_streak", actors: "기관" })).toBeNull();
    expect(reexposureHook({ previousReason: "주가는 빠지는데 임원은 사고 있어요", signalKind: "insider_cluster", actors: "임원 4명" })).toBeNull();
  });

  it("지난번 사유를 모르면 판정하지 않는다 — 지어내지 않는다", () => {
    expect(reexposureHook({ previousReason: null, signalKind: "volume_awakening" })).toBeNull();
    expect(reexposureHook({ previousReason: "무슨 일이 있었어요", signalKind: "volume_awakening" })).toBeNull();
  });

  it("이력 문장에서 종류를 읽는다 — `22거래일` 을 거래량으로 오독하지 않는다", () => {
    expect(reexposureKindOf("22거래일 만에 가장 길게 사고 있어요")).toBe("supply");
    expect(reexposureKindOf("거래가 3배로 붙었어요")).toBe("volume");
    expect(reexposureKindOf("거래량 8배, 주가는 0%")).toBe("volume");
    expect(reexposureKindOf("코스닥은 빠지는데 혼자 10.2%")).toBe("divergence");
  });

  it("검출기 코드는 문장 추측 없이 바로 종류가 된다", () => {
    expect(kindOfSignal("institution_streak")).toBe("supply");
    expect(kindOfSignal("volume_awakening")).toBe("volume");
    expect(kindOfSignal(undefined)).toBe("unknown");
  });

  it("어떤 훅도 인과·평가·예측 게이트를 통과한다", () => {
    const hooks = [
      reexposureHook({ previousReason: "22거래일 만에 가장 길게 사고 있어요", signalKind: "volume_awakening" }),
      reexposureHook({ previousReason: "거래가 3배로 붙었어요", signalKind: "insider_cluster" }),
      reexposureHook({ previousReason: "거래가 3배로 붙었어요", signalKind: "market_divergence" }),
    ].filter((v): v is string => v !== null);
    expect(hooks.length).toBeGreaterThan(0);
    for (const h of hooks) expect(WHY_NOW_FORBIDDEN.test(h), h).toBe(false);
  });
});
