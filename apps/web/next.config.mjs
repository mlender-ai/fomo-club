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

export default function nextConfig(phase) {
  return {
    ...sharedConfig,
    // Keep dev and production build artifacts separate.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next-build",
  };
}
