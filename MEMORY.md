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

### ADR-005: 크레딧 시스템 — **폐기 (타로 시대 결정)**
- 날짜: 2026-05-16 · 폐기 등재: 2026-08-17
- 원 결정: insert-only 원장 (`CreditLedger`)
- 폐기 사유: 타로 뽑기 크레딧 과금 노선이 사라졌다. FOMO Club v5 에 크레딧 개념이 없다.
- 잔재: `prisma/schema.prisma` 에 `TarotCreditLedger` 외 `Tarot*` 모델 10종이 남아 있다.
  **스키마 정리는 별건**이며 아직 하지 않았다 — 지우려면 마이그레이션이 필요하다.
- 살아남은 원칙: append-only 원장은 **판단 원장**(`appendJudgmentLedger`)에서 계승된다.

---

## 진행 상황

**현재 Phase**: 발견 척추 구축 — PRODUCT_VISION v5 기준

### 완료
- 모노레포 구조 확립 (apps/fomo-web, apps/web, packages/fomo-core, packages/shared)
- Vercel 배포 자동화 (fomo-web -> prj_dfwSKviFgdUg7MocHAqiBEPmaxcV, fomo-club-backend -> prj_B68x...)
- Prisma 스키마 + Supabase 연동
- packages/shared 공용 헬퍼 (staleness.ts, swrPolicy.ts, tabScrollPositions.ts, historyFormatting.ts)
- 테스트 케이스 **2129건 / 212 파일** (vitest, 2026-08-17 실측)
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
- 감정 투표·기록·캘린더 — `packages/fomo-core/src/features.ts` flag 숨김 (코드·DB 보존, 정체성 아님)
- 푸시 알림 일체 — 발견 척추 완성 후
- BM 확정 — 발굴 성적표 데이터 확인 후
- ~~사주팔자 통합~~ — **폐기**(타로 시대 노선). 보류가 아니라 노선 자체가 없다.

### 배포 메모
- apps/web (백엔드): Vercel Git 통합 자동 배포 (main push). 정규 도메인
  `fomo-club-backend.vercel.app` 은 **프로젝트 도메인으로 등록돼 있어 별칭이 자동으로 따라 움직인다.**
- apps/fomo-web: Vercel Git 통합 자동 배포 (main push). 단 정규 도메인
  `fomo-web-mlender-ais-projects.vercel.app` 은 **그냥 별칭이라 자동배포가 옮기지 않는다**(2026-08-17 실측).
  `rebake-on-git-deploy.yml` 의 `align-web-alias` 잡이 머지마다 다시 붙인다.
  근본 처방(프로젝트 도메인 등록)은 Vercel 설정이라 **사람 몫** — `docs/STATUS.md` 등재.
- 배포가 화면에 닿았는지는 **`npm run verify:production`** 으로 확인한다. 배포 READY 는 증거가 아니다.
- `fomo-web-liart.vercel.app` 은 Vercel 자동 생성 도메인이고 **정규 도메인이 아니다.** 404 가 정상.
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
6. 활성 워크스페이스 패키지 스코프는 `@fomo/*` 로 통일돼 있다. 타로 시대 기록은 `docs/legacy/` 에서만 보존한다.
7. 기능 비대화 금지 — 한 번에 하나씩, 좁은 범위를 끝낸다. (구 문구의 "타로+감정+사주" 열거와
   "사랑스러움 maximum" 은 삭제했다: 사주·마스코트·러블리 노선은 전부 폐기됐다.)
```

---

## 알려진 기술 부채

```
(2026-08-17 실측으로 두 항목 삭제 — 가리키는 대상이 레포에 없다.)
  · 구 1 "AdMob 프로덕션 ID 미입력": `apps/fomo-club/app.json` 의 `extra` 는 `apiBaseUrl` 하나뿐이다.
    adMob 필드가 애초에 없다. 광고 BM 노선 자체가 사라졌다.
  · 구 2 "트래킹 백엔드 console.log 수준 — /api/tarot/track": 그 라우트가 없다(`apps/web/app/api/tarot/` 부재).

현행 기술 부채는 **`docs/STATUS.md` §5 「알려진 결함」**에 있다. 이 파일은 그것을 복제하지 않는다.
```

---

## 2026-05-27 사이클 회고 (CEO Brief #212 우선순위 1-8)

> ⚠️ **이 섹션은 타로 시대 기록이다.** 아래 PR·파일 상당수가 지금 레포에 없다.
> 역사로만 읽고, 경로를 현행으로 믿지 말 것. 살아남은 것은 `packages/shared/src/` 헬퍼 4종이다.

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

#### 모바일 컴포넌트 · Backend API — **전부 삭제됨 (2026-08-17 실측)**

이 회고가 지목한 파일 넷은 레포에 **없다**:
`apps/tarot-mobile/components/ticker/{TickerCardHistory,CompactHeader}.tsx` ·
`apps/web/lib/tarot/market.ts` · `apps/web/app/api/tarot/quote/route.ts`
(`apps/tarot-mobile/` · `apps/web/lib/tarot/` · `apps/web/app/api/tarot/` 세 디렉터리 자체가 부재).

타로 시대 산출물이며 피봇에서 제거됐다. **경로를 따라가지 말 것** — 없는 파일을 찾아 헤매게 된다.

### 새 패턴/아키텍처

1. **stale-while-revalidate 정책 일원화** — stockStore의 fetchQuote/fetchChart/fetchFinancials 셋 다 `decideSwrAction()` 호출. 향후 새 fetch 추가 시도 이 패턴 따라.
2. **컴포넌트 vs 순수 로직 분리** — 모바일 컴포넌트에서 시간 포매팅·스크롤 위치 계산·SWR 결정 같은 비-UI 로직은 `packages/shared/src/` 로 분리. vitest로 검증.
3. **결측치 헤더 패턴** — Yahoo Finance 같은 외부 API의 부분 결측을 `X-Data-Completeness` 헤더로 클라이언트에 명시. 클라이언트는 null을 안전하게 렌더.
4. ~~종목 정체성 → 심리 언어 번역 (v2.1.0 프롬프트)~~ — **타로 해석 프롬프트 노선. 폐기.**
   현행 문안 규율은 `docs/PRODUCT_VISION.md` 와 투자조언 금칙어 게이트다.
5. ~~종목 상세 sticky 패턴 (`stickyHeaderIndices`)~~ — **삭제된 `apps/tarot-mobile` 의 패턴.** 현행 아님.

### 보류 영역 추가

- **푸시 알림 관련 일체** (2026-05-27 사용자 직접 지시) — 푸시 카피·시간·빈도·페어링·A/B 모두 보류 카테고리. Marketer 가이드(`.github/workflows/idea-proposal.yml` — **2026-06 자율 루프 정지로 휴면**) + `AGENT_NORTH_STAR.md`(동결) 반영 완료. 사유: 콘텐츠 품질·종목 데이터 정확성·종목 상세 UX 강화가 먼저.

### 누적 메트릭
- 테스트 케이스 172개 (2026-05-27 당시 수치. **현재 2129건** — 위 「진행 상황」 참조)
- 신규 공유 헬퍼 4개
- 신규 모바일 컴포넌트 2개
- 빌드 검증 모두 통과 (lint/test/build:web)
