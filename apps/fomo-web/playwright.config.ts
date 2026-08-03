import { defineConfig, devices } from "@playwright/test";

/**
 * `apps/fomo-web` 렌더 스모크 (WO-SUB-04 Q3).
 *
 * **왜 이 앱에 따로 필요한가**: `auto-qa-web.yml` 의 경로 필터가 `apps/web/**` ·
 * `packages/shared/**` 뿐이라 **사용자 화면 앱에는 렌더 수준 CI 검증이 전혀 없었다.**
 * 실제로 WO-SUB-04 첫 프리뷰에서 "미분류 칸에 빈 상자가 남는" 결함이 나왔는데
 * 빌드·타입체크·유닛테스트는 전부 통과한 상태였다 — 서버를 띄워 렌더해보고서야 잡혔다.
 * 완료 조건 2(빈 박스로 남지 않을 것)를 게이트로 지키려면 이 잡이 있어야 한다.
 *
 * 포트는 `apps/web`(3200)과 겹치지 않게 3201 을 쓴다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3201",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // production build 로 테스트 — dev overlay 가 없는 실제 사용자 환경이어야 한다.
    command: "npx next start -p 3201",
    url: "http://127.0.0.1:3201",
    reuseExistingServer: !process.env["CI"],
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
