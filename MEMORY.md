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
Phase 6 (대기): 사주팔자 투자 체질 통합 — docs/사주팔자_투자체질_기획서.md 참조
  트리거 조건: 스토어 출시 완료 + DAU 100+ + 사용자 피드백에서 개인화 니즈 관측
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
6. 사주팔자 피처는 기획 완료 상태이나 구현 보류 중. 현재 모든 설계는 이 피처를 나중에 수용할 수 있도록 확장 가능하게 만들되, 사주 관련 코드/스키마를 선행 추가하지 않는다.
```

---

## 알려진 기술 부채

```
1. AdMob 프로덕션 ID 미입력 — app.json extra의 adMobBanner/Rewarded 4개 필드 비어 있음
2. 트래킹 백엔드 console.log 수준 — /api/tarot/track이 서버 로그만 기록, PostHog/Amplitude 연동 시 교체 가능
```

---

## 2026-05-27 사이클 회고 (CEO Brief #212 우선순위 1-8)

### 머지된 PR
- #213 `feat(quote): 결측치 명시 + dataAt + 캐싱 TTL 분기 + 데이터 완전성 헤더`
- #214 `feat(stock-store): per-symbol 캐시 + stale-while-revalidate`
- #215 `feat(prompt-v2.1): 종목 정체성 심리 신호로 통합`
- #216 `feat(ticker): 종목 상세에 "이 종목 카드 히스토리" 섹션 추가`
- #217 `feat(ticker): sticky 헤더 + 탭별 스크롤 보존 + 압축 헤더 토글`
- #218 `feat(ticker): 헤더 등락 알약 배지 + RangeBar 라벨 위계 정리`
- #219 `test(quote+swr): API 회귀 6개 + SWR 정책 결정 로직 10개`
- 직접 main push (f231bc4) — Marketer 푸시 deny + 가이드 갱신

### 신규 핵심 파일 (다른 세션이 알아야 할 위치)

#### 공유 헬퍼 (`packages/shared/src/`)
- `staleness.ts` — `classifyFreshness(isoDate, now, freshTtl, staleTtl)` → "fresh"/"stale"/"expired"
- `swrPolicy.ts` — `decideSwrAction({cachedDataAt, force, now, freshTtl, staleTtl})` → "skip"/"background-revalidate"/"fetch-blocking"
- `tabScrollPositions.ts` — `planTabSwitch(prev, next, positions, currentY)` + `shouldShowCompactHeader(scrollY, threshold)`
- `historyFormatting.ts` — `formatTimeAgo(iso, now)` + `formatCardLabel(cards)`

→ 모바일/웹 양쪽에서 import해서 사용. 모바일 컴포넌트에서 직접 fetch/시간 계산하지 말고 이 헬퍼 통해서 작업하면 vitest로 회귀 봉쇄됨.

#### 모바일 컴포넌트 (`apps/tarot-mobile/components/ticker/`)
- `TickerCardHistory.tsx` — 종목별 카드 히스토리 (빈 상태 시 숨김). `/api/tarot/history?ticker=X` 호출.
- `CompactHeader.tsx` — sticky 영역 안에 등장하는 압축 헤더 (이름 + 가격 + 등락 알약)

#### Backend API
- `apps/web/lib/tarot/market.ts` — chart API + `meta.shortName` → `name`, 1년 closes로 `fiftyTwoWeekPosition` 계산
- `apps/web/app/api/tarot/quote/route.ts` — `marketState=REGULAR` 30s TTL / else 5min TTL, `X-Cache` MISS/HIT 헤더, `X-Data-Completeness` 결측 필드 명시

### 새 패턴/아키텍처

1. **stale-while-revalidate 정책 일원화** — stockStore의 fetchQuote/fetchChart/fetchFinancials 셋 다 `decideSwrAction()` 호출. 향후 새 fetch 추가 시도 이 패턴 따라.
2. **컴포넌트 vs 순수 로직 분리** — 모바일 컴포넌트에서 시간 포매팅·스크롤 위치 계산·SWR 결정 같은 비-UI 로직은 `packages/shared/src/` 로 분리. vitest로 검증.
3. **결측치 헤더 패턴** — Yahoo Finance 같은 외부 API의 부분 결측을 `X-Data-Completeness` 헤더로 클라이언트에 명시. 클라이언트는 null을 안전하게 렌더.
4. **종목 정체성 → 심리 언어 번역** — `MarketSnapshot.name/sector/marketCap/fiftyTwoWeekPosition` 옵션 필드. v2.1.0 프롬프트의 `translateIdentity/translateMarketCap/translateRangePosition` 함수가 숫자 → 심리 언어 변환. **숫자 자체는 절대 프롬프트 노출 X**.
5. **종목 상세 sticky 패턴** — `ScrollView stickyHeaderIndices={[2]}`, 큰 헤더는 일반 스크롤 / 압축 헤더+탭바는 sticky. `react-native-reanimated` 미사용 (Expo Go 호환).

### 보류 영역 추가

- **푸시 알림 관련 일체** (2026-05-27 사용자 직접 지시) — 푸시 카피·시간·빈도·페어링·A/B 모두 보류 카테고리. Marketer 가이드(`.github/workflows/idea-proposal.yml`) + `AGENT_NORTH_STAR.md` Out of Scope 반영 완료. 사유: 콘텐츠 품질·종목 데이터 정확성·종목 상세 UX 강화가 먼저.

### 누적 메트릭
- 테스트 케이스 **172개** (이번 사이클에서 +16)
- 신규 공유 헬퍼 4개
- 신규 모바일 컴포넌트 2개
- 빌드 검증 모두 통과 (lint/test/build:web)
