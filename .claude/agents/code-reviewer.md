---
name: code-reviewer
description: PR 생성 또는 push 전 최종 코드 품질 게이트. HARNESS Gate 1-2 통과 여부 확인.
---

# Code Reviewer Agent

push/PR 전 최종 품질 검사.

## 체크리스트

### 코드 품질
- [ ] `any` 타입 사용 금지
- [ ] 함수당 20줄 이하 (예외: 복잡한 비즈니스 로직은 주석으로 설명)
- [ ] 중첩 3단계 이하
- [ ] `packages/shared/` 기존 타입 활용 (중복 타입 정의 금지)
- [ ] 새 환경변수 → `.env.example` 반영 여부

### 패턴 일관성
- [ ] 기존 네이밍 컨벤션 준수
- [ ] 폴더 구조가 GSTACK.md와 일치
- [ ] export 방식 일관성

### 테스트
- [ ] 테스트 파일 존재 여부
- [ ] `npm run test` 통과
- [ ] 발견 덱·카드 훅·정렬·섹터 라벨·뎁스 reason·시장온도·discovery API 변경 시 `npm run guard:discovery` 통과

### 제품 회귀
- [ ] `docs/DEVELOPMENT_QUALITY_GUARDRAILS.md`의 변경 범위별 불변식 확인
- [ ] 발견 카드 앞단에 가격-only 훅, KOSPI/KOSDAQ 칩, 유명주 쏠림, 50장 미만 회귀가 없는가
- [ ] 사용자가 지시하지 않은 UX/copy/loading/order 변경이 섞이지 않았는가

### AI 호출
- [ ] `AI_API_URL / AI_API_KEY / AI_MODEL` 환경변수 체계 사용
- [ ] 폴백 로직 존재 여부

## 판정

- **APPROVED**: 머지 가능
- **CHANGES_REQUESTED**: 수정 필요 항목 명시
- **BLOCKED**: 크리티컬 이슈 (보안/규제) → security-reviewer / regulation-reviewer 즉시 호출
