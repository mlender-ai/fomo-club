/**
 * A/B 검정력 산출 (WO-SUB-04).
 *
 * 문서(`docs/audit/POWER_wo_sub_04_ab.md`)가 이 스크립트의 출력을 인용한다 — 손으로 계산하면
 * 나중에 입력이 바뀌었을 때 문서와 어긋나고, 그 어긋남은 어떤 게이트에도 안 걸린다.
 *
 * 실행: npx tsx scripts/ab-power.ts [--rate=23] [--base=0.0435] [--share=0.70]
 */

const Z_ALPHA_2SIDED = 1.959963985; // α=0.05 양측
const Z_POWER = { 80: 0.8416212336, 90: 1.2815515655 } as const;

function flag(name: string, fallback: number): number {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const value = hit ? Number.parseFloat(hit.split("=")[1] ?? "") : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}

/** 2비율 검정 팔당 표본. `p2 > 1` 이면 Infinity(탐지 불가) — 정의역 밖에서 계산하지 않는다. */
export function perArm(p1: number, mdeRelative: number, zBeta: number): number {
  const p2 = p1 * (1 + mdeRelative);
  if (p2 >= 1 || p2 <= p1) return Number.POSITIVE_INFINITY;
  const pbar = (p1 + p2) / 2;
  const numerator =
    (Z_ALPHA_2SIDED * Math.sqrt(2 * pbar * (1 - pbar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  return numerator / (p2 - p1) ** 2;
}

/**
 * ITT 희석 보정.
 *
 * 처치군 중 `share` 만 실제 처치를 받으면 관측 효과가 `share` 배로 줄고 필요 표본은 `1/share²`
 * 배가 된다. 이걸 빼고 계산하면 필요 기간을 과소평가한다.
 */
export function dilutionFactor(share: number): number {
  return 1 / share ** 2;
}

/** 주어진 표본으로 탐지 가능한 최소 상대 효과. 이분 탐색. */
export function detectableMde(p1: number, perArmSamples: number, zBeta: number): number | null {
  let lo = 0.001;
  let hi = (1 - p1) / p1 - 1e-9; // p2 < 1 을 넘지 않는 상한
  if (hi <= lo) return null;
  if (perArm(p1, hi, zBeta) > perArmSamples) return null; // 최대 효과로도 표본 부족
  for (let i = 0; i < 300; i += 1) {
    const mid = (lo + hi) / 2;
    if (perArm(p1, mid, zBeta) > perArmSamples) lo = mid;
    else hi = mid;
  }
  return hi;
}

function main(): void {
  const base = flag("base", 1 / 23);
  const daily = flag("rate", 23);
  const share = flag("share", 0.7);
  const factor = dilutionFactor(share);

  console.log(`기저 전환율 ${(base * 100).toFixed(2)}% · 일 노출 ${daily} · 처치 비율 ${(share * 100).toFixed(0)}% (희석 계수 ${factor.toFixed(2)})\n`);
  console.log("MDE(상대) | 검정력 | 팔당 표본 | 총 노출 | 희석 보정 | 필요 일수 | 연수");
  console.log("-".repeat(80));
  for (const mde of [0.3, 0.5, 1.0]) {
    for (const power of [80, 90] as const) {
      const n = perArm(base, mde, Z_POWER[power]);
      const total = n * 2;
      const diluted = total * factor;
      const days = diluted / daily;
      console.log(
        `${(mde * 100).toFixed(0).padStart(6)}%   | ${String(power).padStart(4)}%  | ${n.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(9)} | ${total.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(8)} | ${diluted.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(9)} | ${days.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(9)} | ${(days / 365).toFixed(1)}`
      );
    }
  }

  console.log("\n기간별 탐지 가능한 최소 효과 (검정력 80%)");
  console.log("-".repeat(50));
  for (const days of [14, 30, 90, 180]) {
    const perArmSamples = ((daily * days) / factor) / 2;
    const mde = detectableMde(base, perArmSamples, Z_POWER[80]);
    console.log(`${String(days).padStart(3)}일 → ${mde === null ? "탐지 불가" : `상대 +${(mde * 100).toFixed(0)}%`}`);
  }
}

if (process.argv[1]?.includes("ab-power")) main();
