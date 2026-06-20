# 🔮 Trading Taro — 개발 체크리스트

> **용도**: 병렬 개발 시 작업 추적용. 다른 에이전트와 충돌 없이 작업 배분.
> **규칙**: 작업 시작 전 이 파일에서 상태를 확인하고, 완료 시 체크 표시.
> **상태**: ⬜ 미착수 | 🔄 진행중 | ✅ 완료 | 🚫 블로킹 | 👤 다른에이전트

---

## Phase 1: 기반 인프라 (신규 구축) — ✅ 완료 (다른 에이전트)

### 1-1. `packages/tarot-core/` 생성 ✅
- ✅ `src/types.ts` — TarotCardId, TarotCardMeta, MarketSnapshot, DrawRequest 등
- ✅ `src/cards.ts` — 22장 메이저 아르카나 카드 데이터 (TAROT_CARDS, ACTIVE_CARDS)
- ✅ `src/draw.ts` — drawCards(), DRAW_COST (시장 상태별 역방향 확률 조정)
- ✅ `src/cache.ts` — buildCacheKey(), getCacheTtlMs(), isCacheExpired()
- ✅ `src/prompts/interpret-v1.0.0.ts` — buildInterpretationPrompt(), PROMPT_VERSION
- ✅ `src/safety/forbidden.ts` — checkSafety(), sanitizeInterpretation(), REQUIRED_DISCLAIMER
- ✅ `src/fallback/templates.ts` — getFallbackInterpretation() (5개 카드+범용 폴백)
- ✅ `src/index.ts` — 모든 모듈 re-export

### 1-2. `apps/tarot-mobile/` 생성 ✅
- ✅ Expo 프로젝트 초기화 (app.json)
- ✅ expo-router 파일 기반 라우팅 (`app/_layout.tsx`, `app/(tabs)/`)
- ✅ NativeWind (Tailwind for RN) 설정 (`tailwind.config.js`, `global.css`)
- ✅ zustand 스토어 (`lib/store.ts`)
- ✅ API 클라이언트 (`lib/api.ts`)
- ✅ 탭 네비게이션: 홈 / 기록 / 프로필
- ✅ 디자인 토큰 (`constants/colors.ts`)

### 1-3. Prisma 스키마 확장 ✅
- ✅ `TarotCard` — 카드 메타 (name, keywords, meanings, imageUrl, toneGuide, status)
- ✅ `User` 확장 — authProvider, membershipStatus, pushToken, disclaimer
- ✅ `TarotCreditLedger` — insert-only 크레딧 원장
- ✅ `TarotDrawHistory` — 뽑기 기록 (idempotencyKey 포함)
- ✅ `TarotDrawHistoryCard` — 뽑기-카드 조인 (orientation, slot, position)
- ✅ `TarotFavorite` — 관심 종목 즐겨찾기
- ✅ `TarotFeedback` — 만족도 피드백
- ✅ `TarotReport` — 부적절 콘텐츠 신고
- ✅ `TarotPromptVersion` — 프롬프트 버전 관리

---

## Phase 2: 핵심 기능 — 🔄 진행중

### 2-1. 종목/섹터 검색 + 카드 뽑기 + AI 해석 🔴 — 🔄 현재 작업
> 기능명세서 §1 + §3

#### API 엔드포인트
- ⬜ `POST /api/tarot/draw` — 카드 뽑기 (idempotency key, 크레딧 차감, AI 해석, 3단 폴백)
- ⬜ `GET /api/tarot/cards` — 카드 목록 조회
- ⬜ `GET /api/tarot/history` — 뽑기 기록 조회
- ⬜ `GET /api/tarot/credit/balance` — 크레딧 잔액 조회
- ⬜ `GET /api/ticker/search?q=` — 종목 검색 (US+KR, 자동완성)
- ⬜ `GET /api/ticker/[ticker]/quote` — 실시간 시세 (기존 researchLive.ts 래핑)

#### AI 해석 서비스 (서버 사이드)
- ⬜ `interpret()` 함수 — 3단 폴백 체인 구현:
  - ⬜ 1차: LLM 실시간 호출 (기존 AI_API_URL 체계 사용)
  - ⬜ 2차: 캐시 히트 (buildCacheKey + isCacheExpired 활용)
  - ⬜ 3차: getFallbackInterpretation() 호출
- ⬜ 금칙어 후처리 — checkSafety() → BLOCKED이면 sanitize 후 재생성
- ⬜ 중복 요청 방지 — idempotencyKey 기반 (DB unique constraint 활용)

#### 시장 데이터 연동
- ⬜ 기존 Yahoo Finance 커넥터 API 래핑 (`researchLive.ts`)
- ⬜ MarketSnapshot 변환 함수 (researchLive 데이터 → tarot-core MarketSnapshot)
- ⬜ KRX 커넥터 추가 (Yahoo Finance `XXXXX.KS`/`XXXXX.KQ` 심볼 지원)

#### 모바일 앱 화면
- ⬜ 홈 화면 — 종목 검색 바 + 최근 검색어 + 카드 뽑기 진입
- ⬜ 검색 화면 — 자동완성 결과, 종목 기본 정보 (현재가, 등락)
- ⬜ 카드 뽑기 화면 — 1장/3장 선택, 뽑기 버튼 (크레딧 표시)
- ⬜ 카드 뒤집기 애니메이션 — `react-native-reanimated` 3D flip
- ⬜ 해석 결과 화면 — headline + summary + detail + 면책 고지

### 2-2. 소셜 로그인 + 크레딧 잔고 🔴
> 기능명세서 §4

- ⬜ Apple 로그인 (`expo-apple-authentication`) — iOS 필수
- ⬜ Google 로그인 (`expo-auth-session`)
- ⬜ API: `POST /api/auth/login` — 토큰 검증 + JWT 발급
- ⬜ API: `POST /api/auth/logout` — 토큰 폐기
- ⬜ SecureStore에 JWT 저장
- ⬜ 크레딧 잔액 조회 (SUM 기반) + 사용 내역
- ⬜ 회원가입 보너스 크레딧 자동 지급

---

## Phase 3: 수익 모델

### 3-1. 광고 (AdMob) + 리워드 + IAP 🔴
> 기능명세서 §5

- ⬜ AdMob 배너 광고 연동 (`react-native-google-mobile-ads`)
- ⬜ 리워드 광고 — 시청 완료 시 크레딧 지급
- ⬜ 리워드 콜백 서버 사이드 검증 (SSV)
- ⬜ 인앱 결제 (`react-native-iap`) — 크레딧 상품
- ⬜ 서버 영수증 검증 (Apple/Google)
- ⬜ ATT 팝업 구현 (iOS)
- ⬜ 광고 Unit ID 환경변수 관리

---

## Phase 4: 부가 기능

### 4-1. 뽑기 기록/분석 ✅ — `feature/admin-panel` 브랜치
> 기능명세서 §2

- ✅ API: `GET /api/tarot/history` — 목록 (페이지네이션, 필터, 정렬)
- ✅ API: `GET /api/tarot/history/[id]` — 상세 (카드메타 + 피드백)
- ✅ API: `GET /api/tarot/analytics` — 개인 분석 (Top5 카드/종목, 소스분포, 7일활동)
- ✅ 기록 목록 화면 (FlatList, 무한스크롤, 풀투리프레시)
- ✅ 기록 상세 화면 (카드 + 해석 전문 + 면책 + 메타)
- ✅ 필터/정렬 (스프레드 타입, 최신/오래된순)
- ✅ 개인 성향 요약 (자주 나온 카드, 자주 선택한 종목, 7일 활동 차트)
- ✅ `lib/historyStore.ts` — zustand 스토어 (목록+상세+분석+필터)

### 4-2. 온보딩/면책 고지 ✅
> 기능명세서 §7

- ✅ 최초 실행 온보딩 화면 (3슬라이드 + 면책 고지 슬라이드, 수평 스와이프)
- ✅ 면책 고지 문구 + 동의 흐름 (체크박스 → 동의 버튼)
- ✅ 동의 이력 저장 (버전 + 타임스탬프, `POST /api/tarot/disclaimer`)
- ✅ 동의 상태 조회 (`GET /api/tarot/disclaimer`)
- ✅ `lib/onboardingStore.ts` — zustand 스토어 (동의 상태, 버전 관리)

### 4-3. 관심 종목 + 푸시 알림 ✅
> 기능명세서 §8

- ✅ API: `GET/POST/DELETE /api/tarot/favorites` — 즐겨찾기 CRUD (upsert)
- ✅ API: `PATCH /api/tarot/favorites/[id]` — 알림 토글
- ✅ API: `POST/DELETE /api/tarot/push` — 푸시 토큰 등록/해제
- ✅ 즐겨찾기 화면 (목록, 알림 토글 Switch, 삭제 확인)
- ✅ `lib/favoritesStore.ts` — 낙관적 업데이트 + 롤백
- ✅ `lib/notifications.ts` — Expo 푸시 등록, 권한 요청, 딥링크 처리
- ✅ `expo-notifications`, `expo-device` 의존성 추가

---

## Phase 5: 어드민/운영 — 🔄 진행중

### 5-1. 웹 어드민 (apps/web 확장) ✅ — `feature/admin-panel` 브랜치
> 기능명세서 §9

- ✅ `/admin` 대시보드 — 핵심 지표 (카드수, 뽑기수, 사용자, 활성 프롬프트, 소스 분포)
- ✅ `/admin/cards` — 22장 카드 CRUD (인라인 수정, 활성/비활성 토글, 필터)
- ✅ `/admin/prompts` — 프롬프트 버전 생성, 활성화/롤백, 내용 조회
- ✅ `/admin/monitoring` — 호출량(24h/7d), 캐시적중률, LLM비용추정, 크레딧흐름, 만족도, 폴백이력
- ✅ API: `PATCH/GET /api/admin/cards/[id]`
- ✅ API: `GET/POST /api/admin/prompts`
- ✅ API: `POST /api/admin/prompts/[id]/activate`
- ✅ `apps/web/lib/prisma.ts` — Prisma 싱글턴
- ✅ `apps/web/lib/admin-auth.ts` — DASHBOARD_PASSWORD 인증 가드
- ✅ 다크 테마 어드민 CSS (700+ lines)

### 5-2. AI 콘텐츠 생성 파이프라인 🔴
> 기능명세서 §11

- ⬜ 초안 생성 → 금칙어 검사 → 운영자 검수 → 배포
- ⬜ 승인 워크플로우

### 5-3. AI 에이전트 기반 자동 개발 루프 🟡
> 기능명세서 §12

- ⬜ CTO/PM/PO 에이전트 역할/정책
- ⬜ 백로그 자동 생성 + 우선순위
- ⬜ 릴리즈 게이트 (법무/QA/보안)

---

## Phase 1 완료 코드 요약 (Phase 2 작업 시 참조)

### 사용 가능한 tarot-core 함수들
```typescript
// 카드 뽑기
drawCards(spread: TarotSpreadType, condition: MarketCondition): DrawnCard[]
DRAW_COST: { single: 1, "three-card": 3 }

// 프롬프트 생성
buildInterpretationPrompt(market: MarketSnapshot, cards: DrawnCard[]): string

// 캐시
buildCacheKey(ticker, spread, cards, condition): string
isCacheExpired(cachedAt, condition): boolean

// 안전장치
checkSafety(text): { result: "CLEAN"|"RISK"|"BLOCKED", matchedTerms }
sanitizeInterpretation(text): string
REQUIRED_DISCLAIMER: string

// 폴백
getFallbackInterpretation(cardId, orientation): { headline, summary, detail }
```

### Prisma 모델 사용법
```typescript
// 크레딧 잔액 = SUM(amount)
await prisma.tarotCreditLedger.aggregate({
  where: { userId },
  _sum: { amount: true }
});

// 중복 뽑기 방지 = idempotencyKey unique
await prisma.tarotDrawHistory.create({
  data: { ...draw, idempotencyKey }
});
```

---

## 작업 배분 가이드

### 충돌 방지 규칙
```
1. 동시에 같은 파일을 수정하지 않는다
2. 작업 시작 전 이 체크리스트에서 상태를 확인한다
3. packages/shared/ 타입 변경은 한 에이전트만 담당
4. Prisma 스키마 변경은 한 에이전트만 담당 (마이그레이션 충돌 방지)
5. 완료 시 git push 후 이 파일 업데이트
```

### 현재 Phase 2-1 작업 범위
```
apps/web/app/api/tarot/    ← API 엔드포인트 (신규)
apps/web/lib/tarot/        ← AI 해석 서비스 (신규)
apps/tarot-mobile/app/     ← 모바일 화면 (확장)
apps/tarot-mobile/lib/     ← 모바일 로직 (확장)
```
