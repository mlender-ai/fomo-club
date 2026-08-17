# 기술 스택 참조

> 이 파일은 프로젝트 기술 스택 참조 문서이다. Garry Tan의 gstack 도구(`~/.claude/skills/gstack/`)와는 별개이며, gstack 슬래시 커맨드 사용법은 CLAUDE.md를 참조한다.

## 모노레포 구조

```
trading-taro/
├── apps/
│   ├── web/                 ← Next.js 14 (App Router) — API Routes + 어드민 웹
│   └── tarot-mobile/        ← React Native (Expo SDK 52+) — 네이티브 앱
├── packages/
│   ├── shared/              ← 공용 타입, 라이브 데이터 셰이핑, 유틸
│   └── tarot-core/          ← 타로 비즈니스 로직 (카드, 해석 엔진, 크레딧, 안전장치)
│       ├── prompts/         ← LLM 프롬프트 템플릿 (버전 관리)
│       ├── safety/          ← 금칙어 목록, 후처리 필터
│       └── fallback/        ← AI 실패 시 프리빌트 해석 텍스트
├── prisma/                  ← DB 스키마
├── scripts/                 ← 데이터 파이프라인, 자동화 스크립트
├── generated/               ← 스냅샷 데이터
├── docs/                    ← 기능명세서, 로드맵, 배포 문서
└── .github/workflows/       ← CI/CD
```

## 기술 스택 상세

| 레이어 | 기술 | 비고 |
|---|---|---|
| **모바일 앱** | React Native + Expo (SDK 52+) | EAS Build, expo-router |
| **상태 관리** | zustand | Redux 사용 금지 |
| **애니메이션** | react-native-reanimated 3 | 카드 뒤집기 등 |
| **네비게이션** | expo-router | 파일 기반 라우팅 |
| **스타일링** | NativeWind (Tailwind for RN) | 또는 StyleSheet |
| **API 서버** | Next.js API Routes (apps/web) | |
| **DB** | PostgreSQL + Prisma | Railway 또는 Supabase |
| **AI** | Claude / OpenAI 호환 | AI_API_URL 환경변수 체계 |
| **인증** | expo-auth-session + expo-apple-authentication | 서버 토큰 검증 |
| **결제** | react-native-iap | 서버 영수증 검증 |
| **광고** | react-native-google-mobile-ads | AdMob |
| **푸시** | expo-notifications | Expo Push + FCM/APNs |
| **테스트** | Jest (유닛) + Detox (E2E 모바일) | Playwright는 웹 어드민용 |
| **CI/CD** | GitHub Actions + EAS Build | |
| **배포** | Vercel (API) + EAS Submit (스토어) | |

## 환경변수

```bash
# === AI ===
AI_API_URL=
AI_API_KEY=
AI_MODEL=
AI_TEMPERATURE=

# === DB ===
DATABASE_URL=

# === 어드민 ===
DASHBOARD_PASSWORD=

# === 모바일↔API ===
TAROT_API_SECRET=

# === 광고 ===
ADMOB_BANNER_ID_IOS=
ADMOB_BANNER_ID_ANDROID=
ADMOB_REWARDED_ID_IOS=
ADMOB_REWARDED_ID_ANDROID=

# === 결제 ===
APPLE_SHARED_SECRET=
GOOGLE_SERVICE_ACCOUNT_KEY=

# === 푸시 ===
EXPO_PUSH_ACCESS_TOKEN=
```

## 시장 데이터 소스

| 소스 | 용도 | 비고 |
|---|---|---|
| Yahoo Finance RSS | 뉴스 헤드라인 | 비공식 API, 안정성 모니터링 필요 |
| Yahoo Finance Chart API | 시세/캔들 데이터 | US + KR (.KS/.KQ) |
| KRX 커넥터 (추가 예정) | 코스피/코스닥 실시간 | API 후보 평가 필요 |

## 데이터 흐름

```
[시장 데이터 소스] → [수집 파이프라인 (scripts/)] → [스냅샷 저장 (generated/)]
                                                            ↓
[사용자 카드 뽑기] → [API (apps/web)] → [타로 해석 엔진 (packages/tarot-core/)]
                                              ↓
                                     [LLM 호출 → 캐시 → 폴백]
                                              ↓
                                     [해석 텍스트 반환 → 모바일 앱 표시]
```
