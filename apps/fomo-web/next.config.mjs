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
      // PWA — 서비스워커(sw.js)·매니페스트 self 허용.
      "worker-src 'self'",
      "manifest-src 'self'",
      // `upgrade-insecure-requests` 는 여기 두지 않는다. Report-Only 정책에서는 명세상
      // **무시되며**, 브라우저가 전 페이지 콘솔에 경고를 남긴다. 관찰이 목적인 헤더에
      // 관찰 자체가 불가능한 지시어를 넣는 셈이라 값이 0이다.
      // 실효도 없다 — Vercel 은 HTTPS 로만 서빙하고 위 정책에 http: 출처가 하나도 없다.
      // 이 Report-Only 정책을 강제(enforce)로 승격할 때, 그때 강제 헤더에 의도적으로 넣는다.
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
