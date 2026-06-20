# FOMO Club

> **현재 최우선 제품: FOMO Club** — 스와이프로 투자 취향을 학습해 테마·종목 정보를 쉽게 매칭하는 피드.
> 해자는 **취향 매칭 × 쉬운 번역**이며, 판단과 결정은 사용자 몫이다.
> 제품 정본은 [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md), 에이전트 규칙은 [`CLAUDE.md`](CLAUDE.md).

---

## 모노레포 지도 (현재 살아있는 구조)

| 앱/패키지 | 목적 | 스택 | 상태 | 진입점 |
|---|---|---|---|---|
| **`apps/fomo-web`** | FOMO Club 취향 카드 피드 — **주력** | Next.js 14, Tailwind | 라이브 (Vercel) | `app/page.tsx` → 카드/히스토리, 테마·종목 뎁스 |
| **`apps/web`** | FOMO API 백엔드 + 운영·리서치 API | Next.js 14 | 라이브 | `app/api/fomo/*`, `app/api/research/*` |
| **`packages/fomo-core`** | 키워드·종목 카드, 이해·응축, 점수 도메인 로직 | TS (순수함수) | 활성 | `src/index.ts` |
| **`apps/fomo-club`** | FOMO Club 네이티브 앱 | Expo / RN, NativeWind | 보류 (토큰 절약) | `app/` |
| `packages/shared` | 공용 타입·유틸 | TS | 활성 | `src/index.ts` |
| `apps/api` | 레거시 페이퍼트레이딩(Fastify+worker) | Fastify | **레거시(처분 검토)** | `src/` |

> 워크스페이스: `apps/*`, `packages/*` (npm workspaces).

---

## FOMO Club 한눈에

- **핵심 경험**: 오늘의 테마·종목 카드를 넘기고, 관심 신호와 상세 열람을 바탕으로 점점 개인화된 피드를 만든다.
- **데이터 원칙**: 실제 출처와 confidence를 함께 제공하고, 근거가 없으면 임의로 채우지 않는다.
- **제품 단계**: 카드 공급 엔진과 이해 레이어를 고도화한 뒤 취향 기반 재정렬을 얹는다.
- **역할 경계**: 제품은 매칭과 쉬운 번역을 담당하며 매수·매도 판단은 대신하지 않는다.

---

## 개발

```bash
npm install                 # 루트에서 1회

# 개발 서버
npm run dev:fomo-web        # FOMO 웹 (포트 3300)
npm run dev:web             # FOMO API 백엔드 (포트 3200)
npm run dev:fomo-club       # FOMO 네이티브 (expo)

# 검증 (push 전 필수 — CLAUDE.md)
npm run lint                # = typecheck
npm run typecheck           # 전 워크스페이스
npm run build:web           # API 빌드
npm run test                # vitest (전 패키지)
npx prisma validate         # 스키마 변경 시
```

배포: `main` push → Vercel 자동 배포(`apps/fomo-web`, `apps/web`). DB는 Supabase(`db-push.yml` 수동 dispatch, ADR-003: migrate 대신 db push).

**필수 prod 시크릿**(미설정 시 해당 라우트 fail-closed): `DATABASE_URL`, `GROQ_API_KEY`. 전체 목록은 `.env.example`.

---

## 문서 위계

```
CLAUDE.md                          ← 에이전트 진입점·행동 규칙 (최상위)
docs/PRODUCT_VISION.md             ← 향하는 곳: 취향 매칭 × 쉬운 번역
docs/DATA_ENGINE_STRATEGY.md       ← 카드 공급·이해 엔진 전략
docs/AGENT_REDESIGN.md             ← 에이전트 운영 모델
AGENTS.md                          ← 에이전트 역할·라우팅
```

과거 Trading Taro 문서는 `docs/legacy/`에서 기록으로만 보존한다. FOMO Club이 유일한 신규 개발 대상이다.
