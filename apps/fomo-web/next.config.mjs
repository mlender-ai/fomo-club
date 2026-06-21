/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 베이스라인 보안 헤더 (P3-2) — 전역 적용.
// 정적 CSP 안전 지침은 즉시 강제하고, 외부 SDK 관련 전체 정책은 Report-Only로 호환성을 관찰한다.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://t1.kakaocdn.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://fomo-club-backend.vercel.app https://kauth.kakao.com https://kapi.kakao.com",
      "frame-src https://kauth.kakao.com https://accounts.kakao.com",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: monorepoRoot,
  // @fomo/core는 빌드 산출물이 아닌 TS 소스(src/index.ts)를 제공 → 트랜스파일 대상에 포함
  transpilePackages: ["@fomo/core"],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
