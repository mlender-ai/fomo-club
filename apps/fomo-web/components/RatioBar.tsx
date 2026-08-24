"use client";

/**
 * B형 그림 — 하루 거래량 중 매수분이 차지하는 몫.
 *
 * ## 왜 큰 숫자를 막대로 바꿨나 (2026-08-24)
 *
 * 종전 B형은 52px `{ratioPct}%` 를 accent 로 맨몸으로 세웠다. 세 가지가 깨져 있었다.
 *
 * 1. **수익률로 읽힌다.** 카드 상단이 `82,200원 +5.7%` 이고 그 아래 라임색 `14%` 가 온다.
 *    둘 다 퍼센트라 눈이 같은 종류로 묶는다 — 실측 화면에서 그렇게 읽혔다.
 * 2. **accent 의 뜻이 형마다 달랐다.** A 에서 accent 는 *매수 누적선*, C 에서는 *매수 연속
 *    구간* — 둘 다 "돈이 들어온 것" 이다. B 에서만 *비율이라는 계측값* 이었다.
 * 3. **캡션이 없었다.** A 는 범례(`주가 / 기관 매수 누적`), C 는 캡션(`최근 N거래일 …`)이
 *    accent 를 설명하는데 B 만 아무 줄도 없었다.
 *
 * 막대는 셋을 한 번에 고친다 — accent 가 다시 *매수분* 을 가리키고, 전체 대비 몫이라 퍼센트
 * 기호 없이도 크기가 보이며, 캡션이 무엇의 몫인지 말한다.
 *
 * 숫자를 지우지는 않는다. 후킹 문장(`하루 거래량의 3분의 1을 사갔어요`)이 이미 크기를 말하고,
 * 여기 수치는 그 문장을 **확인**하는 자리다 — 그래서 캡션 안에 mono 로 작게 둔다.
 */
export function RatioBar({
  ratioPct,
  /** 없으면 주체 없이 쓴다 — 구 페이로드에서 "기관" 을 지어내지 않는다. */
  actor,
  height = 46,
}: {
  ratioPct: number;
  actor?: string;
  height?: number;
}) {
  // 100% 를 넘는 경우가 있다(하루 거래량보다 많이 샀다) — 막대는 가득 차고 수치가 진실을 말한다.
  const filled = Math.max(0, Math.min(100, ratioPct));
  if (!Number.isFinite(ratioPct) || ratioPct <= 0) return null;

  return (
    <div data-testid="ratio-bar">
      <div
        className="flex w-full overflow-hidden rounded-[2px] bg-ds-chart-bar"
        style={{ height }}
        aria-hidden
      >
        <span className="bg-ds-accent" style={{ width: `${filled}%` }} />
      </div>
      <p className="mt-s2 font-mono text-ds-legend text-ds-text-2" data-testid="pick-ratio">
        {`하루 거래량 중 ${actor ? `${actor} ` : ""}매수 ${Math.round(ratioPct)}%`}
      </p>
    </div>
  );
}
