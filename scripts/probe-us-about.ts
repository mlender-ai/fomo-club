/**
 * LAUNCH-P2 §C 진단 — **어느 문턱에서 떨어지나.**
 *
 * 백필 첫 실행에서 40건이 전부 탈락했다(`rejected: 40`). 사유를 봐야 고칠 수 있다.
 * **프롬프트 사본을 쓰지 않는다** — 사본을 재다 한 번 헛짚었다(사본은 통과, 실제는 탈락).
 * 여기서는 `us-company-about` 의 함수를 그대로 부른다.
 */
import { fetchCompanyDescription, translateAbout, translateAboutNoNumbers } from "../apps/web/lib/us-company-about";
import { isAiConfigured } from "@fomo/shared";

const CASES: ReadonlyArray<readonly [string, string]> = [
  ["SOFI", "소파이"],
  ["ONON", "온"],
  ["PLTR", "팔란티어"],
  ["RKLB", "로켓랩"],
  ["HOOD", "로빈후드"],
];

async function main(): Promise<void> {
  if (!isAiConfigured()) { console.error("AI 미설정 — .env 확인"); process.exit(2); }
  let first = 0, retried = 0, failed = 0;
  for (const [symbol, name] of CASES) {
    const source = await fetchCompanyDescription(symbol);
    if (!source) { console.log(`${symbol}: 소스 없음`); failed += 1; continue; }
    const one = await translateAbout(name, source);
    if (one) { first += 1; console.log(`${symbol} ✅ 1차\n   ${one}`); continue; }
    const two = await translateAboutNoNumbers(name, source);
    if (two) { retried += 1; console.log(`${symbol} ✅ 재시도(숫자 없이)\n   ${two}`); continue; }
    failed += 1;
    console.log(`${symbol} ❌ 두 번 다 탈락`);
  }
  console.log(`\n1차 통과 ${first} · 재시도로 살린 것 ${retried} · 탈락 ${failed} / ${CASES.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
