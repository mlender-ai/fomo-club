import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const sharedConfig = {
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@fomo/shared", "@fomo/core"],
  // opik(LLM 관측)는 nunjucks/chokidar/fsevents(네이티브) 의존 → 번들 금지, 런타임 require.
  // ai-client.ts 가 동적 import("opik") 로만 사용(OPIK_* 설정 시). 미설정 시 fail-open.
  serverExternalPackages: ["opik"],
  webpack(config) {
    // ESM .js 확장자 → .ts 소스 resolve (@fomo/core 등이 main: "src/index.ts" + .js imports 사용)
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ...config.resolve.extensionAlias,
    };
    return config;
  },
};

/**
 * 옛 경로 (UI-03 PART B) — **404 로 두지 않는다.**
 *
 * 이 경로들은 북마크·텔레그램 메시지·문서에 박혀 있다. 지우기만 하면 그 링크가 전부
 * 죽는다. 새 자리로 보낸다.
 *
 * `permanent: false`(307) 다. 영구(308)로 하면 브라우저가 기억해버려서, 나중에 이 경로를
 * 다시 쓰고 싶을 때 이미 방문한 사람은 못 돌아온다.
 */
const LEGACY_REDIRECTS = [
  // 전광판은 트랙 표였다 — 전략 탭이 그 자리다
  { source: "/live", destination: "/strategies" },
  // 데이터 상태는 헤더로 옮겼다
  { source: "/data", destination: "/" },
  // 1차 백테스트 보관함 — 판정은 연구 04 에 있다
  { source: "/backtest", destination: "/research/04" },
  // LAB-BRIDGE 때 이름
  { source: "/whale", destination: "/whales" },
  { source: "/trades", destination: "/journal" },
  // 폐기된 랩 전략의 상세 — 판정이 연구 04 에 있다
  { source: "/strategy/:id", destination: "/research/04" },
].map((r) => ({ ...r, permanent: false }));

export default function nextConfig(phase) {
  return {
    ...sharedConfig,
    async redirects() {
      return LEGACY_REDIRECTS;
    },
    // Keep dev and production build artifacts separate.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next-build",
  };
}
