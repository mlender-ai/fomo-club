import { randomBytes } from "crypto";

/**
 * 서버 시크릿 fail-closed 리졸버 (P0-1).
 *
 * 레포가 public이라 하드코딩 폴백 문자열은 그 자체가 취약점이었다
 * (prod env 누락 시 누구나 토큰/논스 위조 가능). 그래서:
 *  - 프로덕션: env 미설정 또는 32자 미만이면 **호출 시점에 throw**(fail-closed,
 *    어드민 미들웨어와 동일 정책). 모듈 로드가 아니라 호출 시점이라 빌드는 깨지지 않는다.
 *  - dev/test: 공개된 고정 문자열 대신 **프로세스별 랜덤**을 쓴다. 같은 프로세스 안에서는
 *    안정적이라 발급↔검증이 맞고, 재시작 시 바뀌어 토큰이 무효화될 뿐(개발 편의 희생 없음).
 *
 * 결과: 공개 레포 어디에도 위조에 쓸 수 있는 고정 시크릿 문자열이 존재하지 않는다.
 */
const MIN_LENGTH = 32;
const ephemeral = new Map<string, string>();

/**
 * @param envKey      1순위 전용 env 키
 * @param fallbackKeys 미설정 시 순서대로 시도할 기존 prod 시크릿 키
 *   (예: TAROT_API_SECRET 미설정 시 이미 prod에 있는 JWT_SECRET 재사용 →
 *    공개 문자열 없이 prod 무중단. 전용 키를 설정하면 그게 항상 우선).
 */
export function resolveServerSecret(envKey: string, ...fallbackKeys: string[]): string {
  for (const key of [envKey, ...fallbackKeys]) {
    const v = process.env[key];
    if (v && v.length >= MIN_LENGTH) return v;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[security] ${envKey} must be set to a ${MIN_LENGTH}+ character secret in production (fail-closed).`
    );
  }

  // dev/test — 프로세스 수명 동안만 유효한 랜덤. 공개 고정 문자열 절대 사용 안 함.
  let dev = ephemeral.get(envKey);
  if (!dev) {
    dev = randomBytes(32).toString("hex");
    ephemeral.set(envKey, dev);
  }
  return dev;
}
