import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

// 어드민 경로 전용 보안 헤더
const adminSecurityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Next.js 인라인 스크립트 필요
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const sharedConfig = {
  transpilePackages: ["@trading/shared", "@taro/core"],
  headers: async () => [
    {
      source: "/admin/:path*",
      headers: adminSecurityHeaders,
    },
    {
      source: "/api/admin/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cache-Control", value: "no-store" },
      ],
    },
  ],
  webpack(config) {
    // ESM .js 확장자 → .ts 소스 resolve (tarot-core가 main: "src/index.ts" + .js imports 사용)
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
