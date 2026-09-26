/**
 * 건강도 원 (UI-06 A-2) — 70↑ 초록 · 40~70 주황 · 40↓ 빨강.
 *
 * **값이 없으면 아무것도 그리지 않는다**(UI-FIX B-3 — `건강도 —` 를 띄우지 말고 칸을 숨긴다). FCE 가
 * 건강도를 라이브 계좌 포지션에만 싣는다. 페이퍼에 싣는 날 이 부품이 그대로 켜진다.
 *
 * SVG 로 그리지 않는다 — `conic-gradient` 한 줄이면 된다.
 */
export function healthTone(score: number): "up" | "warn" | "dn" {
  return score >= 70 ? "up" : score >= 40 ? "warn" : "dn";
}

export function HealthRing({ score, size = 44 }: { score: number | null; size?: number }) {
  if (score === null) return null;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <span
      className={`ui-health is-${healthTone(pct)}`}
      style={{ width: size, height: size, ["--ui-health-pct" as string]: `${pct}%` }}
      role="img"
      aria-label={`건강도 ${Math.round(pct)}`}
    >
      <span className="ui-health-value">{Math.round(pct)}</span>
    </span>
  );
}
