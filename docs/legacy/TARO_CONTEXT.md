# Trading Taro — 프로젝트 피벗 컨텍스트 (v2)

> 기능명세서 v2 반영. `mlender-ai/taro-stock-app` 전체 레포 분석 + 기능명세서 통합.

---

## 제품 한줄 정의

**증권 시장의 기술적 지표를 AI가 분석하여 타로 카드 형식으로 해석을 제공하는 네이티브 앱**

- 목표: 투자 불안감 감소, 심리적 안정감, 재미와 호기심 충족
- 타겟: 20대 후반~40대 초반 개인 투자자 (감성적 접근 + 운세 콘텐츠 관심)
- 디바이스: iOS / Android 네이티브 앱 (App Store + Google Play)

---

## 베이스 레포

**소스**: `github.com/mlender-ai/auto-trading-bot` → `taro-stock-app`으로 피벗

### 재활용 vs 신규

| 구분 | 레이어 | 위치 |
|---|---|---|
| ✅ 재활용 | 시장 데이터 수집 | `packages/shared/researchLive.ts` |
| ✅ 재활용 | 데이터 타입 | `packages/shared/research.ts` |
| ✅ 재활용 | AI 런타임 | `AI_API_URL` / `AI_API_KEY` / `AI_MODEL` |
| ✅ 재활용 | 수집 파이프라인 | `scripts/research-pipeline.ts` |
| ✅ 재활용 | 스냅샷 캐싱 | `generated/research/` + 3단 폴백 |
| ✅ 재활용 | CI/CD | `.github/workflows/` |
| ✅ 재활용 | DB 스키마 | `prisma/` (확장) |
| 🆕 신규 | 타로 카드 시스템 | `packages/tarot-core/` |
| 🆕 신규 | 해석 프롬프트 엔진 | `packages/tarot-core/prompts/` |
| 🆕 신규 | 금칙어 안전장치 | `packages/tarot-core/safety/` |
| 🆕 신규 | 폴백 해석 | `packages/tarot-core/fallback/` |
| 🆕 신규 | 크레딧/결제 | `packages/tarot-core/` + API |
| 🆕 신규 | 네이티브 앱 | `apps/tarot-mobile/` |

---

## 모노레포 구조 (확장 후)

```
taro-stock-app/
├── apps/
│   ├── web/                 ← Next.js 14 (API Routes + 어드민)
│   ├── api/                 ← Fastify worker (레거시, 참고용)
│   └── tarot-mobile/        ← 🆕 React Native (Expo SDK 52+)
├── packages/
│   ├── shared/              ← 공용 타입 확장 (타로 타입 추가)
│   └── tarot-core/          ← 🆕 비즈니스 로직
│       ├── prompts/         ← LLM 프롬프트 (버전 관리)
│       ├── safety/          ← 금칙어 + 후처리 필터
│       └── fallback/        ← 프리빌트 해석 텍스트
├── prisma/                  ← 스키마 확장 (TarotCard, CreditLedger, DrawHistory 등)
├── scripts/                 ← 데이터 파이프라인 확장
├── generated/               ← 스냅샷 데이터
└── docs/                    ← 기능명세서, 로드맵
```

---

## 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| 모바일 | React Native + Expo SDK 52+ | EAS Build |
| 상태 관리 | zustand | Redux 금지 |
| 애니메이션 | react-native-reanimated 3 | 카드 뒤집기 60fps |
| 네비게이션 | expo-router | 파일 기반 |
| 스타일링 | NativeWind 또는 StyleSheet | |
| API | Next.js API Routes | 기존 apps/web 확장 |
| DB | PostgreSQL + Prisma | Railway 또는 Supabase |
| AI | Claude / OpenAI 호환 | AI_API_URL 환경변수 |
| 인증 | expo-auth-session + expo-apple-authentication | 서버 토큰 검증 |
| 결제 | react-native-iap | 서버 영수증 검증 |
| 광고 | react-native-google-mobile-ads | AdMob |
| 푸시 | expo-notifications | FCM/APNs |
| 테스트 | Jest + Detox | |
| 배포 | EAS Submit + Vercel | |

---

## 디자인 시스템 (DESIGN.md)

**테마**: 다크 미스티컬 터미널

### 핵심 토큰
| 이름 | 값 | 역할 |
|---|---|---|
| Ebony Canvas | `#121212` | 기본 배경 |
| Steel Surface | `#2e2e2` | 카드/모달 |
| Carbon Border | `#393939` | 보더 |
| Whiteout | `#fafafa` | 주 텍스트 |
| **Taro Essence** | `#3ecf8e` | 핵심 악센트 |
| Arcane CTA | `#006239` | CTA 버튼 |

### 폰트
- Circular (400/500) — 모든 UI 텍스트
- Source Code Pro — 코드/데이터 전용

### 핵심 규칙
- 그림자 ✕ → 배경색 변화로 엘리베이션
- `pipeline`, `provider`, `runtime`, `JSON` → 사용자 UI 노출 금지
- 빈 화면 절대 금지 → AI 실패해도 폴백

---

## 12대 기능 영역 요약

| # | 기능 | 우선순위 | Phase |
|---|---|---|---|
| 1 | 타로 카드 뽑기 & AI 해석 | 🔴 | 2 |
| 2 | 뽑기 기록 & 개인 분석 | 🟡 | 2~3 |
| 3 | 시장 데이터 + LLM 에이전트 | 🔴 | 2 |
| 4 | 사용자 인증 & 계정 | 🔴 | 3 |
| 5 | 수익 모델 (광고+결제) | 🔴 | 4 |
| 6 | UI/UX (타로 테마) | 🟡 | 2 |
| 7 | 온보딩 & 면책 고지 | 🔴 | 3 |
| 8 | 알림 & 관심 종목 | 🟡 | 3~4 |
| 9 | 운영/어드민 | 🟡 | 3~4 |
| 10 | 사용자 피드백/신고 | 🟡 | 3 |
| 11 | AI 콘텐츠 제작 파이프라인 | 🔴 | 2~3 |
| 12 | AI 에이전트 제품 자동화 | 🟡 | 4~5 |

---

## AI 폴백 정책 (불변 원칙)

```
1차: LLM 실시간 호출 (시장 데이터 + 카드 메타 → 해석)
2차: 캐시 히트 (동일 시장상태 + 카드 조합 해시)
3차: 프리빌트 템플릿 (카드별 범용 해석)
→ 사용자에게 빈 화면/에러 노출 절대 금지
→ 폴백 여부는 서버 로그에만 기록
```

---

## 금칙어 카테고리 (regulation-reviewer)

| 카테고리 | 예시 | 대응 |
|---|---|---|
| 투자 추천 | "매수", "매도", "사세요" | 차단 |
| 수익 보장 | "수익률 보장", "반드시 오릅니다" | 차단 |
| 확정적 예측 | "내일 반등합니다", "100% 하락" | 차단 |
| 공포 조장 | "폭락 임박", "지금 안 팔면 끝" | 차단 |

---

## 현재 Phase 위치

```
Phase 1 ✅ : 기반 인프라 (tarot-core, tarot-mobile, Prisma 스키마)
Phase 2 🔄 : 핵심 기능 (검색+카드뽑기+AI해석 / 소셜로그인+크레딧)
Phase 3 ⬜ : 수익 모델 (AdMob + 리워드 + IAP)
Phase 4 ⬜ : 부가 기능 (기록, 온보딩, 알림)
Phase 5 ⬜ : 어드민/운영 (웹 어드민, 콘텐츠 파이프라인, 자동화)
```

---

## 파일 인덱스

| 파일 | 용도 |
|---|---|
| `TARO_CONTEXT.md` | 이 파일 — 전체 컨텍스트 |
| `TARO_DEV_CHECKLIST.md` | 개발 체크리스트 (병렬 작업 추적) |
| `CLAUDE.md` | 에이전트 진입점 (레포 내) |
| `DESIGN.md` | 디자인 시스템 (레포 내) |
| `AGENTS.md` | 11개 에이전트 역할 (레포 내) |
| `AGENT_BIBLE.md` | 불변 원칙 (레포 내) |
