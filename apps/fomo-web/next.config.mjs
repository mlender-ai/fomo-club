/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 베이스라인 보안 헤더 (P3-2) — 전역 적용. 앱을 깨지 않는 무해한 것만:
// 클릭재킹(XFO)·MIME 스니핑(nosniff)·리퍼러 유출·미사용 브라우저 API 차단.
// CSP는 라이브 카카오 SDK/팝업 흐름을 깰 위험이 있어 별도 검증 라운드로 보류.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: monorepoRoot,
  // @fomo/core는 빌드 산출물이 아닌 TS 소스(src/index.ts)를 제공 → 트랜스파일 대상에 포함
  transpilePackages: ["@fomo/core"],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
