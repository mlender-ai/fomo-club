import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_token";
const ALGORITHM = "HS256";
const SESSION_DURATION = "8h";

// JWT_SECRET는 반드시 256bit (32byte) 이상
function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export interface AdminJwtPayload extends JWTPayload {
  role: "admin";
  // jti: 세션 무효화 비교용 (jose가 자동 포함)
}

export async function signAdminToken(): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

export async function verifyAdminToken(
  token: string
): Promise<AdminJwtPayload | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
    });

    // role 검증
    if (payload.role !== "admin") return null;

    // 전역 세션 무효화 타임스탬프 확인 (비밀번호 변경 시 기존 세션 일괄 만료)
    const invalidatedBefore = await getSessionInvalidatedBefore();
    if (invalidatedBefore && payload.iat && payload.iat < invalidatedBefore) {
      return null;
    }

    return payload as AdminJwtPayload;
  } catch {
    return null;
  }
}

// DB에서 세션 무효화 기준 시각 조회 (없으면 null)
async function getSessionInvalidatedBefore(): Promise<number | null> {
  try {
    const { prisma } = await import("./prisma");
    const config = await prisma.adminSessionConfig.findUnique({
      where: { id: "singleton" },
    });
    if (!config) return null;
    return Math.floor(config.invalidatedBefore.getTime() / 1000);
  } catch {
    return null;
  }
}

// 현재 요청의 쿠키에서 토큰 검증 (Server Component용)
export async function getAdminSession(): Promise<AdminJwtPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAdminToken(token);
}

export { COOKIE_NAME };
