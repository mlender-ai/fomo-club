# 도메인 전문 스킬 정의

> 각 스킬은 특정 도메인 작업이 트리거될 때 관련 에이전트를 조합하여 실행한다.

---

## S1. 타로 카드 시스템 설계

```
트리거: "카드 메타데이터", "카드 시스템", "스프레드"
담당: planner + prompt-engineer
```

- 메이저 아르카나 22장 메타데이터 구조 설계
- 카드별 키워드, 정방향/역방향 의미, 톤 파라미터
- 1장/3장 스프레드 로직
- 시장 상태별 카드 출현 확률 가중치

---

## S2. 시장 데이터 파이프라인

```
트리거: "데이터 수집", "KRX", "파이프라인", "Yahoo Finance"
담당: planner → 구현 에이전트
```

- DataSourceConnector 인터페이스 정의
- Yahoo Finance 커넥터 (뉴스 RSS + 시세 Chart API)
- KRX 커넥터 추가 (동일 인터페이스)
- GitHub Actions 스케줄 수집 (KST 09:00, 15:30 기준)
- 스냅샷 캐싱 (live → stored → published 3단 폴백)

---

## S3. 크레딧/결제 시스템

```
트리거: "크레딧", "결제", "인앱 구매", "리워드"
담당: planner + security-reviewer
```

- Prisma `CreditLedger` 모델 (insert-only 원장)
- 서버 사이드 영수증 검증 (Apple/Google)
- 리워드 광고 SSV (Server-Side Verification)
- 원자적 트랜잭션 보장
- 잔액 = SUM(amount), UPDATE/DELETE 금지

---

## S4. 금융 규제 준수

```
트리거: "면책", "금칙어", "규제", "투자 조언"
담당: regulation-reviewer + store-reviewer
```

- 금칙어 JSON 관리 (`packages/tarot-core/safety/forbidden-terms.json`)
- LLM 출력 후처리 필터
- 면책 문구 버전 관리
- 스토어 심사 대응 문구

---

## S5. 네이티브 앱 스토어 출시

```
트리거: "스토어", "EAS", "빌드", "심사", "출시"
담당: store-reviewer + rn-specialist
```

- EAS Build 프로필 설정 (dev/preview/prod)
- 스크린샷 및 앱 설명 준비
- ATT / 데이터 안전 섹션
- TestFlight / 내부 테스트 배포
- 애플 로그인 필수 포함

---

## S6. AI 해석 엔진

```
트리거: "해석 생성", "LLM", "프롬프트", "폴백"
담당: prompt-engineer + regulation-reviewer
```

- AI 호출 → 캐시 히트 → 프리빌트 템플릿 3단 폴백
- 프롬프트 버전 관리
- 금칙어 자동 검사 (매 응답)
- 토큰 사용량 모니터링
- 사용자에게 빈 화면 절대 노출 금지
