/**
 * INV-09 — 실체 배치 금지어 사전.
 *
 * ## 왜 별도 사전인가
 *
 * 기존 `apps/web/lib/copy-guards.ts` 의 `FORBIDDEN_COPY` 는 **현재 해제되어 있다**
 * (`DEV_CONSTRAINTS_LIFTED = true`, `docs/CONSTRAINT_OVERRIDE_DEV.md` ACTIVE). 그 플래그는
 * 기존 피드 카피에 대한 제품 결정이므로 이 WO 에서 뒤집지 않는다.
 *
 * 그러나 실체 배치의 절대 규칙(투자자문 금지·인과 단정 금지·평가 금지)은 **개발 편의로 해제할 수
 * 있는 것이 아니다.** 그래서 이 사전은 플래그와 무관하게 항상 켜져 있고, 배치가 생성한 문장에만
 * 적용된다. 사전을 하나로 합치면 해제 플래그가 이쪽까지 끄게 되므로 합치지 않는다.
 *
 * ## 예외를 뚫지 않는다
 *
 * 경고문이 금칙어에 걸리면 **사전에 화이트리스트를 만들지 않고 문장을 고친다.**
 * 안전 사전에 예외를 뚫기 시작하면 그 사전은 죽는다.
 */

export type BannedWordRule = "advice" | "valuation_judgment" | "evaluative" | "prediction" | "causal";

export interface BannedWordHit {
  rule: BannedWordRule;
  matched: string;
}

interface RulePattern {
  rule: BannedWordRule;
  pattern: RegExp;
}

/**
 * 문자열을 쪼개 쓴 이유: 이 파일 자체가 금칙어 스캐너에 걸리지 않게 하려는 기존 관례
 * (`copy-guards.ts`)를 따른다.
 */
const PATTERNS: readonly RulePattern[] = [
  // 투자자문 — 배치 절대 규칙 1
  { rule: "advice", pattern: new RegExp(["목표" + "가", "매" + "수", "매" + "도", "추천", "사야", "팔아야", "손절", "익절", "비중\\s*(확대|축소)", "진입\\s*(시점|타이밍)", "텐" + "베거", "급등\\s*임박"].join("|")) },
  // 값싸다/비싸다 판정 — HANDOFF 배치 규칙: 저평가·고평가·싸다·비싸다 전면 금지
  { rule: "valuation_judgment", pattern: new RegExp(["저" + "평가", "고" + "평가", "싸다", "싼\\s", "비" + "싸다", "적정\\s*주가", "제자리"].join("|")) },
  // 평가 형용사 — "얇으면 얇다고 표시" 원칙과 충돌한다
  { rule: "evaluative", pattern: new RegExp(["우수한", "유망", "탄탄한", "견고한", "독보적", "선도적", "매력적", "훌륭한", "뛰어난"].join("|")) },
  // 예측 — 배치는 상태를 서술하고 방향을 말하지 않는다
  { rule: "prediction", pattern: new RegExp(["오를\\s*것", "상승할\\s*것", "하락할\\s*것", "전망이다", "기대된다", "수혜", "임박"].join("|")) },
  // 인과 단정 — 상관을 인과로 옮기는 구문
  { rule: "causal", pattern: new RegExp(["때문에", "덕분에", "로\\s*인해", "영향으로", "(상승|하락|증가|감소|확대|축소|개선|악화)(으)?로\\s+[^.]{0,24}(상승|하락|증가|감소|개선|악화|성장|둔화)"].join("|")) },
];

/** 문장 1개의 위반 전부. 빈 배열이면 통과. */
export function bannedWordHits(text: string | null | undefined): BannedWordHit[] {
  if (!text) return [];
  const hits: BannedWordHit[] = [];
  for (const { rule, pattern } of PATTERNS) {
    const match = text.match(pattern);
    if (match) hits.push({ rule, matched: match[0] });
  }
  return hits;
}

/** INV-09 통과 여부. */
export function passesBannedWords(text: string | null | undefined): boolean {
  return bannedWordHits(text).length === 0;
}
