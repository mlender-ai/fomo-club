import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 임시 진단 라우트 — Vercel 런타임의 DATABASE_URL 상태 + 배포 최신성 확인(비밀 비노출). 확인 후 제거.
const BUILD_MARKER = "diag-keys-3";

export async function GET() {
  const raw = process.env.DATABASE_URL ?? "";
  // 런타임에 존재하는 DB/URL 관련 환경변수 "이름만" 덤프 (값 비노출 — 이름 오타/다른 변수명 진단)
  const dbRelatedKeys = Object.keys(process.env).filter((k) =>
    /data|postg|prisma|^db|_db|url|supabase|pooler/i.test(k)
  );
  const info: Record<string, unknown> = {
    buildMarker: BUILD_MARKER,
    dbRelatedKeys,
    totalEnvKeys: Object.keys(process.env).length,
    hasEnv: raw.length > 0,
    length: raw.length,
    startsWithPostgres: raw.startsWith("postgresql://") || raw.startsWith("postgres://"),
    hasBrackets: /[\[\]]/.test(raw),
    hasWhitespace: /\s/.test(raw),
  };
  try {
    if (raw) {
      const u = new URL(raw);
      info.scheme = u.protocol;
      info.username = u.username;
      info.passwordLength = (u.password || "").length;
      info.host = u.hostname;
      info.port = u.port;
      info.db = u.pathname;
    }
  } catch (e) {
    info.parseError = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
