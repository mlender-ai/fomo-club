/**
 * 섹터 신뢰 게이트 (DS-05 §4) — **틀린 섹터를 보여주느니 안 보여주는 게 낫다.**
 *
 * ## 무엇이 문제였나
 *
 * 발행 엔진이 섹터 자리에 **오늘의 테마 라벨**을 넣었다(`themeLabel` 1순위). 그 결과
 *   한화투자증권(증권사) → `코인` · On Holding(스포츠화) → `화학`
 * 섹터가 틀리면 사용자는 나머지 전부를 못 믿는다.
 *
 * 서버는 고쳤지만(`apps/web/lib/quiet-pick.ts#companyIdentity`) **payload 는 하루 한 번 구워진다.**
 * 다음 배치까지 화면에는 테마 라벨이 그대로 내려온다 → 읽는 쪽에서 거른다.
 *
 * ## 무엇을 거르나
 *
 * 1. **테마·거시 라벨** — 회사의 업종이 될 수 없는 말(코인·환율·금리·유가…).
 * 2. **폴백 라벨** — `기타 업종`·`미국주식` 처럼 아무 정보가 없는 값.
 * 3. 형태 이상 — 비었거나 20자를 넘는 값.
 *
 * 통과하지 못하면 `undefined` → 화면은 섹터 줄을 그리지 않는다. 시총·거래 규모만으로도
 * 회사 규모는 전달된다.
 */

/**
 * 회사 업종이 될 수 없는 라벨 — 자산군·거시·상품·이벤트.
 *
 * 이 목록은 **차단 목록이지 허용 목록이 아니다.** 새 테마가 생기면 여기 없을 수 있다.
 * 근본 해결은 서버가 테마를 섹터로 쓰지 않는 것이고, 그건 이미 고쳤다 — 이건 배치 시차 방어다.
 */
const THEME_LABELS = [
  "코인",
  "비트코인",
  "가상자산",
  "암호화폐",
  "환율",
  "금리",
  "유가",
  "국채",
  "채권",
  "지수",
  "원자재",
  "금값",
  "달러",
  "엔화",
  "위안화",
  "인플레이션",
  "실적시즌",
  "테마",
  "급등주",
  "관세",
] as const;

/** 아무 정보가 없는 폴백 — 섹터 자리를 채우려고 만든 말이다. */
const EMPTY_LABELS = ["기타 업종", "기타", "미국주식", "국내주식", "해외주식", "주식", "미분류", "N/A", "-"] as const;

/** 섹터 라벨의 최대 길이 — 그보다 길면 섹터가 아니라 문장이다. */
const MAX_LENGTH = 20;

export function isTrustedSector(value: string | undefined | null): boolean {
  const sector = value?.trim();
  if (!sector || sector.length > MAX_LENGTH) return false;
  if (EMPTY_LABELS.some((label) => label === sector)) return false;
  // 테마 라벨은 부분 일치로 막는다 — `코인 관련`, `환율 수혜` 같은 변형이 온다.
  if (THEME_LABELS.some((label) => sector.includes(label))) return false;
  return true;
}

/** 신뢰할 수 있는 섹터만 돌려준다. 아니면 `undefined` — 화면이 줄을 만들지 않는다. */
export function trustedSector(value: string | undefined | null): string | undefined {
  return isTrustedSector(value) ? value!.trim() : undefined;
}
