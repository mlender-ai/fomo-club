/**
 * CTX-07 §6 — 골든셋 캡처. **실제 응답을 그대로 떠서** 픽스처로 굳힌다.
 *
 * ## 왜 손으로 쓰지 않는가
 *
 * 완료조건 6 은 "골든셋 픽스처가 실제 응답이다" 다. 손으로 쓴 픽스처는 **우리가 기대하는 모양**을
 * 담는다 — 그래서 스키마가 조용히 바뀌어도 테스트가 통과한다. 실제로 이 저장소에서
 * 가격 무효선이 발행 시점 값끼리 비교하면서 타입·테스트를 전부 통과한 적이 있다.
 *
 * ## 왜 캡처해서 굳히는가 (라이브로 검사하지 않는가)
 *
 * 라이브 응답에 단정하면 **그날의 시장이 테스트를 깬다.** 셀트리온이 오늘 신호가 없으면
 * "대형주 필터 제외" 케이스가 사라진다 — 코드가 멀쩡한데 CI 가 빨개진다. 그런 게이트는 꺼진다.
 * 그래서 캡처는 **의도적 행위**이고(이 스크립트를 사람이 돌린다), 검사는 굳은 픽스처에 한다.
 *
 * 픽스처마다 출처(URL·시각·커밋)를 같이 적는다. 출처 없는 픽스처는 실제 응답이라는 주장을
 * 검증할 수 없다 — `goldenset.test.ts` 가 그 필드의 존재를 강제한다.
 *
 * 실행: npx tsx scripts/capture-goldenset.ts [--base https://...]
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join("docs", "quality", "goldenset");
const TIMEOUT_MS = 60_000;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

/**
 * §6 골든셋. `purpose` 는 **이 케이스로 무엇을 검증하는가**이고, `assertable` 이 false 면
 * 지금 단정할 수 없는 이유를 `blocked_by` 에 적는다 — 빈 칸으로 두면 왜 없는지 잊는다.
 */
interface GoldenCase {
  key: string;
  label: string;
  purpose: string;
  /** 캡처할 엔드포인트(base 상대). */
  path: string;
  assertable: boolean;
  blocked_by?: string;
}

const CASES: GoldenCase[] = [
  {
    key: "bigtec",
    label: "빅텍 (065450)",
    purpose: "소형·조용·재료 없음. 오래된 신호가 픽에서 워치로 강등되는 경로(NO_VISIBLE_REASON 계열)",
    path: "/api/fomo/stock-front?stock=%EB%B9%85%ED%85%8D&naverCode=065450&lite=1",
    assertable: true,
  },
  {
    key: "hanmi-semi",
    label: "한미반도체 (042700)",
    purpose: "외국인+기관 동시. 주체 3분이 실제로 확보되는지(INV-C6 의 실데이터 대조)",
    path: "/api/fomo/stock-front?stock=%ED%95%9C%EB%AF%B8%EB%B0%98%EB%8F%84%EC%B2%B4&naverCode=042700&lite=1",
    assertable: true,
  },
  {
    key: "celltrion",
    label: "셀트리온 (068270)",
    purpose: "대형주. 조용함 게이트에서 제외되는 케이스",
    path: "/api/fomo/stock-front?stock=%EC%85%80%ED%8A%B8%EB%A6%AC%EC%98%A8&naverCode=068270&lite=1",
    assertable: true,
  },
  {
    key: "quiet-picks",
    label: "오늘의 조용한 픽 전량",
    purpose: "픽·워치 선반 전체. 경과일 상한·구성 규칙·선반 사유가 실제 응답에 어떻게 나오는지",
    path: "/api/fomo/quiet-picks",
    assertable: true,
  },
  {
    key: "clbk",
    label: "CLBK (US)",
    purpose: "US 신규 CIK 데이터 결손 — 캔들 이력 부족으로 품질 게이트에 걸리는 케이스",
    path: "/api/fomo/stock-front?stock=CLBK&symbol=CLBK&lite=1",
    assertable: true,
  },
];

/**
 * §6 의 나머지 4종은 **지금 캡처해도 검증할 수 없다.**
 * 구조 라벨(DEEP_DRAWDOWN·QUIET_RANGE·EXTENDED·UNDETERMINED)은 CTX-02 분류기가 내는데
 * `packages/structure/src/params/v1.ts` 의 임계값이 전부 `null` 이라 모든 입력이 UNDETERMINED 로
 * 떨어진다(설계상 의도 — 틀린 라벨보다 라벨 없음이 낫다). 라벨이 하나뿐인 골든셋은
 * 오분류를 잡지 못하므로, 캡처 목록에 넣지 않고 **왜 없는지를 남긴다.**
 */
const PENDING_CASES: Array<{ label: string; blocked_by: string }> = [
  { label: "낙폭 큰 종목 (DEEP_DRAWDOWN)", blocked_by: "CTX-02 §6 임계값 확정 — 현재 전부 UNDETERMINED" },
  { label: "수렴 구간 종목 (QUIET_RANGE)", blocked_by: "CTX-02 §6 임계값 확정" },
  { label: "이미 오른 종목 (EXTENDED, 오분류 금지 대상)", blocked_by: "CTX-02 §6 임계값 확정" },
  { label: "데이터 결손 2종 (UNDETERMINED 폴백)", blocked_by: "CTX-02 분류기 배선 — 폴백을 낼 분류기 자체가 미배선" },
];

async function main(): Promise<void> {
  const base = (flag("--base") ?? process.env.AUDIT_BASE_URL ?? "https://fomo-club-backend.vercel.app").replace(/\/$/, "");
  const commit = execSync("git rev-parse HEAD").toString().trim();
  mkdirSync(OUT_DIR, { recursive: true });

  const manifest: Array<Record<string, unknown>> = [];
  for (const c of CASES) {
    const url = `${base}${c.path}`;
    let status = 0;
    let body: unknown = null;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      status = res.status;
      body = await res.json();
    } catch (error) {
      console.error(`[goldenset] ${c.key} 실패 — ${error instanceof Error ? error.message : error}`);
    }
    // 실패한 캡처를 덮어쓰지 않는다 — 있던 실제 응답을 에러 페이로드로 바꾸면 골든셋이 죽는다.
    if (status !== 200) {
      console.error(`[goldenset] ${c.key} HTTP ${status} — 기존 픽스처를 보존하고 건너뛴다`);
      continue;
    }
    const fixture = {
      provenance: { url, status, captured_at: new Date().toISOString(), commit },
      case: { key: c.key, label: c.label, purpose: c.purpose },
      response: body,
    };
    writeFileSync(join(OUT_DIR, `${c.key}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
    manifest.push({ key: c.key, label: c.label, purpose: c.purpose, status, captured_at: fixture.provenance.captured_at });
    console.log(`[goldenset] ${c.key} ← ${status}`);
  }

  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    `${JSON.stringify({ base, commit, captured: manifest, pending: PENDING_CASES }, null, 2)}\n`
  );
  console.log(`\n[goldenset] ${manifest.length}건 캡처 · 보류 ${PENDING_CASES.length}건 — ${OUT_DIR}`);
}

main().catch((error) => {
  console.error("[goldenset] 실패", error);
  process.exit(1);
});
