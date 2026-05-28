import { defineConfig, devices } from "@playwright/test";

// simulo .claude/agents/auto-qa.md 패턴 차용 (2026-05-27)
// 어드민 공개 라우트의 시각·인터랙션 회귀 자동 탐지.
// CI에서 PR 시 자동 실행. production build 대상 (dev overlay 없는 깨끗한 환경).

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
    baseURL: "http://127.0.0.1:3200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // production build에서 외부 폰트/리소스 prefetch가 'load' 이벤트를 지연시킬 수 있어 domcontentloaded 기준으로 navigation 평가
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // production build로 테스트 — dev overlay 없는 실제 사용자 환경 검증
    command: "npm run start",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
