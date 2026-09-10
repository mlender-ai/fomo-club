/**
 * 발견 카드 카피 안전성 — 미번역 영문+한글조사 잔여물 등 오염 카피 판정.
 * **서버(daily-30 표준 게이트)와 클라(fomo-web 2차 필터)가 공유하는 단일 원본.**
 * 서버가 이 패턴으로 후보를 거르면 탈락분은 다음 quietScore 후보가 채워 30장이 유지되고,
 * 클라에는 오염 카드가 도달하지 않는다(클라 필터는 방어 2선).
 *
 * 주의: 조사 뒤에 한글이 이어지면 그건 조사가 아니라 고유명사 음절이다
 * (예: "SK이터닉스"의 SK+이터닉스, "SK이노베이션", "LG이노텍") — 부정 후방탐색으로 오탐을 막는다.
 * 2~3자 대문자 시장 약어(IPO·AI·ETF 등)는 정상 한국어 문장에 자주 쓰이므로 조사 결합을 허용한다.
 * 이 오탐이 정상 30장 덱을 통째로 무효 처리해 홈 카드 로딩이 멈춘 적이 있다(회귀 테스트로 고정).
 */
export const UNSAFE_DISCOVERY_COPY_PATTERN =
  /\b(?:[Ii][Tt][Ss]|[Tt][Hh][Ee]|[Ww][Ii][Tt][Hh]|[Aa][Nn][Dd])\b\s+[A-Za-z]|(?:[A-Z]{4,}|[A-Za-z]*[a-z][A-Za-z]*)\s*(?:와|과|의|가|이|은|는|을|를|에|에서|로|으로)(?![가-힣])|SHPH\s*,\s*ILLR|설명하긴\s*이른데|아직\s*공개된\s*계기/;

/** 카드 카피 안전성 — 오염 카피면 false. 정상 종목명(SK이터닉스 등)은 통과. */
export function isDiscoveryCopySafe(text: string): boolean {
  return !UNSAFE_DISCOVERY_COPY_PATTERN.test(text);
}
