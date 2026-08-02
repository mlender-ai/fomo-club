import { beforeEach, describe, expect, it } from "vitest";
import {
  isDailyQuotaError,
  noteQuotaFrom,
  noteTokenUsage,
  pacingReport,
  parseResetDuration,
  quotaExhausted,
  resetQuotaState,
} from "../../lib/business-context/synthesize";

/**
 * 페이싱 — **TPD(일일) 와 TPM(분당) 은 같은 429 로 오는데 대응이 정반대다.**
 *
 * 실측(run 30740841495, 2026-08-02): 골든셋 3배치가 각각 70분 스텝 타임아웃을 꽉 채우고
 * 5/30 종목으로 끝났다. 원인은 시간이 아니라 일일 토큰 한도였다:
 *
 *   Rate limit reached ... on tokens per day (TPD): Limit 100000, Used 99966, Requested 1077
 *   x-ratelimit-remaining-tokens: 12000   ← 분당 잔량은 **가득 차 있었다**
 *   retry-after: 902
 *
 * 페이싱은 `x-ratelimit-remaining-tokens`(TPM 잔량)만 보므로 "여유 있다"고 판단했고,
 * 재시도는 902초를 4번 그대로 기다렸다. TPD 는 그날 안에 풀리지 않으므로 그 대기는 전부 낭비다.
 * 감속(6초→30초 상한)도 소용이 없었다 — 벽이 분당 한도가 아니었다.
 */
describe("일일 쿼터(TPD) 판별", () => {
  beforeEach(() => resetQuotaState());

  it("TPD 소진 본문을 일일 쿼터로 판별한다", () => {
    const body =
      '{"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 100000, Used 99966, Requested 1077. Please try again in 15m1.152s."}}';
    expect(isDailyQuotaError(body)).toBe(true);
  });

  it("분당 한도(TPM) 본문은 일일 쿼터가 아니다 — 기다리면 풀리므로 재시도해야 한다", () => {
    const body =
      '{"error":{"message":"Rate limit reached for model `llama-3.3-70b-versatile` on tokens per minute (TPM): Limit 12000, Used 11900, Requested 800. Please try again in 3.165s."}}';
    expect(isDailyQuotaError(body)).toBe(false);
  });

  it("요청 수 일일 한도(RPD)도 일일 쿼터다", () => {
    expect(isDailyQuotaError("Rate limit reached ... on requests per day (RPD): Limit 1000")).toBe(true);
  });

  it("본문이 없으면 판별하지 않는다 — 추측으로 배치를 중단시키지 않는다", () => {
    expect(isDailyQuotaError(undefined)).toBe(false);
    expect(isDailyQuotaError("")).toBe(false);
  });

  it("TPD 429 를 보면 소진 상태가 되고 사유가 남는다", () => {
    expect(quotaExhausted()).toBe(false);
    noteQuotaFrom({ ok: false, status: 429, errorBody: "on tokens per day (TPD): Limit 100000" });
    expect(quotaExhausted()).toBe(true);
    expect(pacingHasQuotaEvent()).toBe(true);
  });

  it("TPM 429 로는 소진 상태가 되지 않는다", () => {
    noteQuotaFrom({ ok: false, status: 429, errorBody: "on tokens per minute (TPM): Limit 12000" });
    expect(quotaExhausted()).toBe(false);
  });

  it("성공 응답으로는 소진 상태가 되지 않는다", () => {
    noteQuotaFrom({ ok: true, status: 200 });
    expect(quotaExhausted()).toBe(false);
  });

  it("429 가 아닌 실패는 본문이 비슷해도 소진으로 보지 않는다", () => {
    noteQuotaFrom({ ok: false, status: 500, errorBody: "on tokens per day (TPD)" });
    expect(quotaExhausted()).toBe(false);
  });
});

function pacingHasQuotaEvent(): boolean {
  // 조용한 중단 금지 — 왜 멈췄는지가 결과 파일에 남아야 한다(§5-1 계열).
  return pacingReport().events.some((event) => event.includes("일일 쿼터"));
}

/**
 * 일일 예산은 **실측으로만** 세운다. 07-29 진단의 종목당 ~1,600토큰 추정대로면 TPD 100,000 에
 * 62종목이 들어가야 하는데 실측은 5종목에서 소진됐다 — 12배 차이다. 추정으로 배치 계획을
 * 다시 세우면 같은 자리에서 또 틀린다(작업 원칙 4: 원인 특정 없이 파라미터만 조정 금지).
 */
describe("토큰 소비 실측", () => {
  beforeEach(() => resetQuotaState());

  it("제공자가 준 소비량을 누적한다", () => {
    noteTokenUsage(633);
    noteTokenUsage(1_077);
    expect(pacingReport().totalTokensUsed).toBe(1_710);
    expect(pacingReport().billedCalls).toBe(2);
  });

  it("usage 가 없는 응답은 세지 않는다 — 0 으로 세면 종목당 소비가 낮게 보인다", () => {
    noteTokenUsage(undefined);
    noteTokenUsage(Number.NaN);
    expect(pacingReport().totalTokensUsed).toBe(0);
    expect(pacingReport().billedCalls).toBe(0);
  });

  it("소진 여부를 페이싱 보고에 함께 낸다 — 배치가 이 값으로 status 를 정한다", () => {
    expect(pacingReport().quotaExhausted).toBe(false);
    noteQuotaFrom({ ok: false, status: 429, errorBody: "on tokens per day (TPD)" });
    expect(pacingReport().quotaExhausted).toBe(true);
  });
});

describe("parseResetDuration", () => {
  it("초·분초 표기를 ms 로 읽는다", () => {
    expect(parseResetDuration("3.165s")).toBe(3_165);
    expect(parseResetDuration("2m52.8s")).toBe(172_800);
    expect(parseResetDuration(undefined)).toBe(0);
  });
});
