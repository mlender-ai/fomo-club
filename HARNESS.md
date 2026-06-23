# 품질 게이트 (Quality Gates)

> 모든 코드 변경은 이 게이트를 순서대로 통과해야 한다.
> 앞 게이트를 통과하지 못하면 뒷 게이트를 실행하지 않는다.

---

## Gate 1: 코드 레벨 (매 commit)

```bash
npm run lint           # ESLint
npm run typecheck      # TypeScript strict mode
npm run test           # Jest 유닛 테스트
```

**실패 시**: 즉시 수정. commit 금지.

---

## Gate 2: 빌드 레벨 (매 push)

```bash
npm run build:web                                  # Next.js API 서버 빌드
cd apps/tarot-mobile && npx expo export --platform all  # Expo 번들
npx prisma validate                                # DB 스키마 (변경 시)
npx prisma generate                                # Prisma 클라이언트 (변경 시)
```

**실패 시**: build-error-resolver 호출. Expo 관련이면 rn-specialist 추가.

---

## Gate 3: 보안 레벨 (기능 완료 시)

```
security-reviewer 에이전트 실행
```

| 결과 | 대응 |
|---|---|
| CRITICAL | push 차단, 즉시 수정 |
| HIGH | PR에 코멘트, 수정 후 재리뷰 |
| MEDIUM | 다음 스프린트에 수정 |
| LOW | 선택적 개선 |

---

## Gate 4: 규제 레벨 (사용자 노출 텍스트 변경 시)

```
regulation-reviewer 에이전트 실행
```

| 결과 | 대응 |
|---|---|
| BLOCKED | 머지 차단. 예외 없이 수정 후 재검사 |
| RISK | 수정 권장 코멘트 |
| CLEAN | 통과 |

**대상 파일**:
- `packages/tarot-core/prompts/**`
- `packages/tarot-core/fallback/**`
- `apps/tarot-mobile/` 내 하드코딩 문구
- 푸시 알림 텍스트

---

## Gate 5: 스토어 레벨 (릴리즈 전)

```
store-reviewer 에이전트 실행
```

**하나라도 미충족 시 릴리즈 차단.**

iOS:
- □ 애플 로그인 포함
- □ ATT 팝업 구현
- □ 면책 고지 노출
- □ Apple IAP 사용
- □ 개인정보처리방침 URL

Android:
- □ 타겟 API 레벨
- □ 데이터 안전 섹션
- □ 광고 선언

공통:
- □ 앱 설명에 "투자 조언 아님"
- □ 스크린샷 준비

---

## Gate 6: SSOT 정합성 (사용자 노출 경험 머지/출시 전 — FOMO Club)

```
PRODUCT_VISION 정합성 + 투자조언 금칙어 + 데이터 정직성 점검
```

코드가 작동·빌드·규제를 통과하는지를 **넘어서** 묻는다:
**"이것은 PRODUCT_VISION v5의 발견 척추와 맞는가? 사실·출처·시점을 정직하게 드러내는가? 투자 조언이나 예측으로 오해되지 않는가?"**
(정체성 정본: `docs/PRODUCT_VISION.md`)

| 결과 | 대응 |
|---|---|
| PASS | 통과 (SSOT 정합 + 정직한 사실 + 금칙어 없음) |
| CAUTION | 정체성·카피·출처 표기가 흐림 — 보강 후 재검토 |
| BLOCKED | 매수/매도/예측 신호, 감정 진정·마스코트 회귀, 가짜 데이터가 섞임 — 머지 보류 |

**대상**: 종목 카드, depth 상세, 정렬·필터, TA 사실 문장, 💎·포모 점수 표현, 사용자 노출 카피.
**Gate 4(규제)와 구분**: regulation-reviewer=면책/금칙어 *차단*, Gate 6=PRODUCT_VISION 정합성·데이터 정직성 확인.

---

## 게이트 통과 순서

```
Gate 1 (코드) → Gate 2 (빌드) → Gate 3 (보안) → Gate 4 (규제) → Gate 5 (스토어)
                                                  └→ Gate 6 (SSOT 정합성, 사용자 노출 변경 시)
```

일상 개발: Gate 1-2 반복
기능 완료: Gate 1-4 전체
사용자 노출 경험(종목 카드/depth/카피) 변경: + Gate 6 (SSOT 정합성)
릴리즈: Gate 1-6 전체
