# taro-stock-app — FOMO Club 모노레포

> **현재 최우선 제품: FOMO Club** — 물려 있고 비교에 시달리는 투자자를 위한 감정 동반자(MLP).
> 기존 "Trading Taro"(증권 타로 해석)에서 리포지셔닝 중이며, 타로 엔진/코드는 해석 백엔드로 **보존**한다.
> 정체성 정본은 [`docs/IDENTITY_AND_MILESTONES.md`](docs/IDENTITY_AND_MILESTONES.md), 에이전트 규칙은 [`CLAUDE.md`](CLAUDE.md).

---

## 모노레포 지도 (현재 살아있는 구조)

| 앱/패키지 | 목적 | 스택 | 상태 | 진입점 |
|---|---|---|---|---|
| **`apps/fomo-web`** | FOMO Club 웹 (무가입 둘러보기) — **주력** | Next.js 14, Tailwind | 라이브 (Vercel) | `app/page.tsx` → splash→gate→home, 탭(오늘/피드/기록) |
| **`apps/web`** | API + 어드민 + 리서치 워크스페이스 | Next.js 14 | 라이브 | `app/api/fomo/*`(FOMO API), `app/api/tarot/*`(타로 API), `app/admin/*` |
| **`packages/fomo-core`** | FOMO Index 산출·마스코트·배너·voices 도메인 로직 | TS (순수함수) | 활성 | `src/index.ts` |
| **`apps/tarot-mobile`** | 타로 네이티브 앱 (RevenueCat·소셜로그인) | Expo / RN | 보존 | `app/` (expo-router) |
| **`apps/fomo-club`** | FOMO Club 네이티브 앱 | Expo / RN, NativeWind | 보류 (토큰 절약) | `app/` |
| `packages/tarot-core` | 타로 프롬프트·해석·안전 로직 | TS | 보존 | `src/index.ts` |
| `packages/shared` | 공용 타입·유틸 | TS | 활성 | `src/index.ts` |
| `apps/api` | 레거시 페이퍼트레이딩(Fastify+worker) | Fastify | **레거시(처분 검토)** | `src/` |

> 워크스페이스: `apps/*`, `packages/*` (npm workspaces).

---

## FOMO Club 한눈에

- **핵심 경험**: 앱을 열면 마스코트 "포모"의 표정이 곧 오늘의 FOMO Index. 감정 5종(FOMO/공포/후회/탐욕/확신) 중 하나를 고르면 포모가 반응하고 담담한 한마디를 건넨다.
- **데이터 원칙**: 정직한 숫자만 — 가짜 데이터 금지. 무가입 익명 세션 집계.
- **마일스톤**: M0 정체성 → M1 사랑스러운 한 순간 → M2 감정 캘린더 → M3 집단 위로(배너) → M4 구조화 한마디 피드. (`docs/IDENTITY_AND_MILESTONES.md`)
- **FOMO Index**: `packages/fomo-core`에서 4개 Heat(market/community/emotion/whale) 가중 산출. 금융 지표가 아닌 **감정 체감 온도계**(투자 조언 아님).

---

## 개발

```bash
npm install                 # 루트에서 1회

# 개발 서버
npm run dev:fomo-web        # FOMO 웹 (포트 3300)
npm run dev:web             # API + 어드민 (포트 3200)
npm run dev:mobile          # 타로 모바일 (expo)
npm run dev:fomo-club       # FOMO 네이티브 (expo)

# 검증 (push 전 필수 — CLAUDE.md)
npm run lint                # = typecheck
npm run typecheck           # 전 워크스페이스
npm run build:web           # API 빌드
npm run test                # vitest (전 패키지)
npx prisma validate         # 스키마 변경 시
```

배포: `main` push → Vercel 자동 배포(`apps/fomo-web`, `apps/web`). DB는 Supabase(`db-push.yml` 수동 dispatch, ADR-003: migrate 대신 db push).

**필수 prod 시크릿**(미설정 시 해당 라우트 fail-closed): `TAROT_API_SECRET`·`REWARD_NONCE_SECRET`(각 32자+), `DATABASE_URL`, `GROQ_API_KEY`. 전체 목록은 `.env.example`.

---

## 문서 위계

```
CLAUDE.md                          ← 에이전트 진입점·행동 규칙 (최상위)
docs/IDENTITY_AND_MILESTONES.md    ← 제품 정체성(North Star, MLP)
docs/FOMO_CLUB.md / FOMO_INDEX.md  ← FOMO 정의·지표
docs/MASCOT.md / DESIGN_FOMO.md    ← 마스코트·디자인 시스템
AGENTS.md                          ← 에이전트 역할·라우팅
docs/M4_EXECUTION_PLAN.md          ← 진행 중 실행 계획
```

타로 관련 **신규** 기능·이슈·PR은 받지 않는다(보존만). FOMO Club이 유일한 신규 개발 대상.
