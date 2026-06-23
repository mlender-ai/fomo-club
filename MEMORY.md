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

**현재 Phase**: 발견 척추 구축 — PRODUCT_VISION v5 기준

### 완료
- 모노레포 구조 확립 (apps/fomo-web, apps/web, packages/fomo-core, packages/shared)
- Vercel 배포 자동화 (fomo-web -> prj_dfwSKviFgdUg7MocHAqiBEPmaxcV, fomo-club-backend -> prj_B68x...)
- Prisma 스키마 + Supabase 연동
- packages/shared 공용 헬퍼 (staleness.ts, swrPolicy.ts, tabScrollPositions.ts, historyFormatting.ts)
- 테스트 케이스 172개 (vitest)
- .claude/hooks/protect-secrets.sh — PreToolUse Hook으로 시크릿 파일 자동 차단

### 진행 중
- 발견 척추 Step 1: 포모 점수가 박힌 종목 카드 스와이프 (apps/fomo-web)

### 다음 순서 (PRODUCT_VISION §11 빌드 순서 기준)
1. 종목 카드 스와이프 (포모 점수 + 💎 배지 + 사실 한 줄) ← **지금 여기**
2. depth 상세 (사실·출처·시점·양면)
3. 정렬·필터 (쏠림순·💎순)
4. TA 카드 안 사실 한 줄
5. 개인화 (스와이프 → 취향 유사도)
6. 발굴 성적표 (♥·💎 그 후 사실)
7. 콘텐츠 표면 (브리핑·뉴스)
8. BM 실험

### 보류 확정 항목
- apps/fomo-club (React Native 네이티브 앱) — 웹 MVP 검증 후
- 감정 투표·기록·캘린더 — features.ts flag 숨김 (코드·DB 보존, 정체성 아님)
- 푸시 알림 일체 — 발견 척추 완성 후
- BM 확정 — 발굴 성적표 데이터 확인 후
- 사주팔자 통합 — 트리거 조건 미충족

### 배포 메모
- apps/fomo-web: Vercel Git 통합 자동 배포 (main push)
- apps/web (백엔드): Vercel Git 통합 자동 배포 (main push)
- `.github/workflows/deploy-fomo-web.yml` — 현재 레포에 없음. 배포 워크플로우 변경은 이번 정리 범위에서 제외.
- DB: Supabase, `.github/workflows/db-push.yml` 수동 dispatch

### 신규 핵심 파일 위치
- `packages/shared/src/staleness.ts` — freshness 분류
- `packages/shared/src/swrPolicy.ts` — SWR 정책 결정
- `packages/shared/src/tabScrollPositions.ts` — 탭 스크롤 위치
- `packages/shared/src/historyFormatting.ts` — 시간·카드 포맷

---

## 알려진 제약 사항

```
1. Yahoo Finance 데이터 소스는 비공식 API → 안정성 리스크, 모니터링 필요
2. KRX 데이터 소스 아직 미확정 (API 후보 평가 필요)
3. AI rate-limit 시 rule-based 폴백 필요 → 카드별 프리빌트 해석 사전 준비
4. 1인 개발이므로 병렬 세션 토큰 효율 중시
5. 금융 규제 — 면책 문구 없이 스토어 심사 통과 불가
6. 사주팔자 피처는 기획 완료 상태이나 구현 보류 중. 현재 모든 설계는 이 피처를 나중에 수용할 수 있도록 확장 가능하게 만들되, 사주 관련 코드/스키마를 선행 추가하지 않는다.
7. 포모의 구체적 형태와 픽셀 수준 표정 묘사는 미확정. 검은 얼굴+흰 눈+얼굴 중심 원칙만 확정. 세부 조형은 시각 작업 단계에서 결정하며, 그 전까지 플레이스홀더로 진행한다.
8. FOMO Club 리포지셔닝에 맞춰 활성 워크스페이스의 패키지 스코프를 `@fomo/*`로 통일했다. 타로 관련 역사 기록은 제품 기능과 혼동되지 않도록 아카이브 문맥에서만 보존한다.
9. 제품에 대한 FOMO 경계(정체성 §6) — 기능 비대화 금지(타로+감정+사주+피드 다 넣기 ❌). 좁은 범위 안에서 사랑스러움만 maximum. 한 번에 하나씩, 작게 끝내고 뿌듯하게.
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
