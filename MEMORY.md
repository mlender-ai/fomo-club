# 컨텍스트 지속 시스템

> 기술 의사결정, 진행 상황, 알려진 제약을 기록한다.
> 에이전트는 작업 시작 시 이 파일을 읽어 컨텍스트를 복원한다.
> 새로운 결정이 발생하면 즉시 이 파일에 추가한다.

---

## 기술 의사결정 기록 (ADR)

### ADR-001: 모바일 프레임워크
- 날짜: 2026-05-16
- 결정: React Native + Expo (SDK 52+)
- 이유: 1인 개발, iOS/Android 동시 지원, EAS Build로 네이티브 빌드 자동화
- 대안: Flutter (Dart 학습 비용), Swift+Kotlin (2배 개발량)
- 상태: 확정

### ADR-002: 상태 관리
- 날짜: 2026-05-16
- 결정: zustand
- 이유: 경량, TypeScript 지원 우수, 러닝커브 최소
- 대안: jotai (atomic), Redux (과도)
- 상태: 확정

### ADR-003: DB
- 날짜: 2026-05-16
- 결정: PostgreSQL + Prisma
- 이유: 타입 안전 ORM, 마이그레이션 관리, 모노레포 호환
- 상태: 확정

### ADR-004: AI 런타임
- 날짜: 2026-05-16
- 결정: AI_API_URL / AI_API_KEY / AI_MODEL 환경변수 체계
- 이유: 프로바이더 교체 가능 (Claude, OpenAI, GitHub Models 등)
- 상태: 확정

### ADR-005: 크레딧 시스템
- 날짜: 2026-05-16
- 결정: insert-only 원장 (CreditLedger)
- 이유: 정합성 보장, 감사 추적 가능, 잔액 = SUM(amount)
- 상태: 확정

---

## 진행 상황

```
Phase 1 ✅: 기반 인프라 (tarot-core, tarot-mobile 기본 구조, Prisma 스키마 65개 모델)
Phase 2 ✅: 핵심 기능 (카드 뽑기 API + AI 3단폴백 + 소셜 로그인 + 크레딧 시스템)
Phase 3 ✅: 결제/광고 (RevenueCat IAP, AdMob 배너/리워드, 리워드 서버 검증)
Phase 4 ✅: 부가 기능 (기록, 온보딩/면책고지, 푸시알림 토큰, 컬렉션, 즐겨찾기)
Phase 5 ✅: 어드민/운영 (카드 CRUD, 프롬프트 관리, 모니터링 대시보드)
현재 상태: 스토어 제출 준비 단계
```

### 2026-05-18 완료 항목 (PR #46)
- `POST /api/tarot/feedback` — 별점 피드백 API (upsert)
- `POST /api/tarot/report` — 신고 API
- result/index.tsx — 별점 UI + 신고 모달
- history/analytics.tsx — MOCK → 실제 /api/tarot/analytics 연결
- adIds.ts — app.json extra + Constants 방식으로 AdMob ID 주입 방식 전환

### 2026-05-18 완료 항목 (2차)
- `packages/tarot-core` vitest 31개 테스트 (forbidden, draw, cache)
- `prompts/interpret-v1.1.0.ts` — 한국어 최적화 + SINGLE/THREE_CARD 서사 분기
- `POST /api/tarot/track` — 이벤트 로깅 엔드포인트
- `tracking.ts` — `initTracking` + `trackEvent` + `TarotEvent` 타입
- `_layout.tsx` — 앱 진입 시 트래킹 초기화
- `draw.tsx` — draw_started/completed/failed 이벤트 연결
- `result/index.tsx` — feedback_submitted/report_submitted 이벤트
- `analytics.tsx` — analytics_viewed 이벤트

### 남은 항목
- [ ] AdMob 프로덕션 ID 실제 값 입력 — app.json extra의 adMobBanner/Rewarded 4개 필드에 Google AdMob 콘솔에서 발급한 ID 입력 필요 (개발자 직접 처리)

---

## 알려진 제약 사항

```
1. Yahoo Finance 데이터 소스는 비공식 API → 안정성 리스크, 모니터링 필요
2. KRX 데이터 소스 아직 미확정 (API 후보 평가 필요)
3. AI rate-limit 시 rule-based 폴백 필요 → 카드별 프리빌트 해석 사전 준비
4. 1인 개발이므로 병렬 세션 토큰 효율 중시
5. 금융 규제 — 면책 문구 없이 스토어 심사 통과 불가
```

---

## 알려진 기술 부채

```
1. AdMob 프로덕션 ID 미입력 — app.json extra의 adMobBanner/Rewarded 4개 필드 비어 있음
2. 트래킹 백엔드 console.log 수준 — /api/tarot/track이 서버 로그만 기록, PostHog/Amplitude 연동 시 교체 가능
```
