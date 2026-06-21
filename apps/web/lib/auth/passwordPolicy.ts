/** bcrypt는 UTF-8 문자열의 첫 72바이트만 사용하므로 초과 입력을 명시적으로 거부한다. */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export function exceedsBcryptPasswordLimit(password: string): boolean {
  return Buffer.byteLength(password, "utf8") > BCRYPT_MAX_PASSWORD_BYTES;
}
