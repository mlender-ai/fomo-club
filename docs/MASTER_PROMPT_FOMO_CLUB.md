# 마스터 프롬프트 — FOMO Club (MVP 우선 출시)

> **[보관 문서 — 실행 금지]** 감정 투표 MVP를 만들던 시기의 일회성 구현 프롬프트다. 아래 Phase 명령을 다시 실행하지 않는다. 현재 방향은 `PRODUCT_VISION.md`와 루트 `CLAUDE.md`를 따른다.

| | |
|---|---|
| **목적** | 기존 taro-stock-app 모노레포에 FOMO Club 앱 신설 → MVP 우선 출시 |
| **한 줄 정의** | 투자자들이 "나만 그런 게 아니구나"를 확인하는 공간 |
| **코어밸류** | 우리는 시장을 분석하지 않는다. 시장 참여자의 감정을 시각화한다. |
| **출시 전략** | 타로 앱과 별도 앱으로 스토어 출시 (코드는 모노레포 공유) |

> Claude Code에서 Phase 순서대로 복붙 실행한다.
> Phase 0(에이전트 인지)을 가장 먼저 실행한다.

---

## 확정 사항 (모든 Phase 공통 컨텍스트)

### A. 정직한 숫자 + 무가입 웹

```
원칙: 가짜 숫자를 만들지 않는다. 작아도 진짜 숫자를 보여준다.

웹 (가입 불필요):
  - 누구나 방문 가능
  - 감정 선택 등 인터랙션 자체가 데이터가 됨 (익명 세션 기반)
  - 방문/감정 선택 → 집계 데이터에 즉시 반영
  - 가입은 푸시 알림, 감정 기록 저장 등 부가 기능에만 요구

DAU 기반 표기:
  - "오늘 N명이 같은 감정을 선택했어요" — N은 항상 실제 집계값
  - 사용자 0~소수여도 정직하게 표기 (예: "오늘 32명")
  - FOMO Index는 시장 데이터 기반이라 사용자 수와 무관하게 1일차부터 진짜 숫자 산출

집계 단위:
  - 익명 세션 ID (웹: 쿠키/localStorage, 앱: 디바이스 ID)
  - 같은 세션의 중복 투표는 1일 1회로 제한
```

### B. FOMO Index — 체감 온도계 (금융 지표 아님)

```
정의: 투자자 집단 심리의 체감 온도계. 사람을 측정하는 지표.
범위: 0 ~ 100
목표: 앱을 열었을 때 "오늘 시장 분위기 어떻지?"를 3초 안에 이해

스케일:
  0~20   😴 무관심  — 시장이 조용하다
  21~40  🙂 관망    — 관심은 있지만 적극적이지 않다
  41~60  👀 관심    — 특정 종목/섹터에 관심 집중
  61~80  🔥 FOMO    — 놓치기 싫은 심리 증가, SNS/커뮤니티 급증
  81~100 🚀 광기    — 집단 심리 과열, 시장보다 감정이 앞섬

공식:
  FOMO Index = Market Heat(30%) + Community Heat(30%) + Emotion Heat(30%) + Whale Heat(10%)

  1. Market Heat (0~30): 거래량 급증, 거래대금 증가, 주요 키워드 검색량, ETF 자금 유입
  2. Community Heat (0~30): X/Reddit/Stocktwits 언급량·게시물·댓글 변화율
       Bullish 키워드: To The Moon, All In, Full Position, Diamond Hands, YOLO
       Bearish 키워드: 청산, 손절, 망했다, 물렸다
  3. Emotion Heat (0~30): FOMO Club 사용자 감정 투표 (FOMO/탐욕 비중↑ → 상승, 공포/후회↑ → 하락)
  4. Whale Heat (0~10): 대형 청산 위기, ETF 대규모 유입, BTC 신고가, 섹터 급등, Short Squeeze

홈 표시:
  FOMO INDEX 74 🔥 / 현재 상태 FOMO / 전일 대비 +8 / 30일 평균 대비 +17
  + AI Summary (오늘 시장 감정 1~2문장 요약)
  + Daily Insights (롤링 배너, 🚨 형식)

향후 확장 인덱스 (지금 구현 X, 설계만 인지):
  Regret Index(후회) / Panic Index(공포) / Copium Index(자기위안) /
  Diamond Hands Index(존버) / YOLO Index(과잉확신)
```

### C. 모노레포 구조

```
taro-stock-app/
├── apps/
│   ├── web/              ← 기존 API + 어드민 (공유)
│   ├── tarot-mobile/     ← 타로 앱 (병행 개발)
│   ├── fomo-club/        ← 🆕 FOMO Club 모바일 (Expo)
│   └── fomo-web/         ← 🆕 FOMO Club 웹 (무가입 방문용, Next.js)
├── packages/
│   ├── shared/           ← 시장 데이터, 타입 (공유)
│   ├── tarot-core/       ← 타로 로직
│   └── fomo-core/        ← 🆕 FOMO Index 계산, 감정 집계 로직
├── prisma/               ← 스키마 확장 (감정/인덱스 테이블)
└── scripts/              ← FOMO Index 일일 산출 파이프라인 추가
```

### D. 두 제품의 관계

```
FOMO Club (감정 입력 장치)  →  감정 데이터 수집  →  tarot-core (해석 엔진)
FOMO Magazine (SNS) → 유입 → FOMO Club → 데이터 → 타로 엔진 → 유료 해석
fomo-core의 감정 집계 데이터는 향후 타로 앱 해석 정확도의 재료가 된다.
```

---

# Phase 0: 전 에이전트 인지 업데이트

```
아래 문서 작업을 전부 실행. 묻지 말고 진행.

## 1. docs/FOMO_CLUB.md 신규 생성

아래 내용으로:

---
# FOMO Club

## 한 줄 정의
투자자들이 "나만 그런 게 아니구나"를 확인하는 공간.

## 코어밸류
우리는 시장을 분석하지 않는다. 시장 참여자의 감정을 시각화한다.
사람들은 미래를 알고 싶어하지 않는다. 자신이 느끼는 감정이 정상인지 확인받고 싶어한다.

## 제품 관계
- FOMO Club = 감정 입력 장치 / 타로 엔진 = 해석 장치
- 모노레포 내 별도 앱. 스토어에는 독립 출시. 코드/인프라는 공유.
- fomo-core의 감정 집계는 향후 tarot-core 해석의 재료가 된다.

## 정직한 숫자 원칙
- 가짜 숫자 금지. 작아도 실제 집계값만 표기.
- 웹은 무가입 방문 가능. 감정 선택 등 인터랙션이 곧 데이터.
- 가입은 푸시/기록 저장 등 부가 기능에만 요구.
- FOMO Index는 시장 데이터 기반이라 사용자 수와 무관하게 진짜 숫자 산출.

## FOMO Index
- 투자자 집단 심리의 체감 온도계 (금융 지표 아님).
- 0~100. Market Heat 30 + Community Heat 30 + Emotion Heat 30 + Whale Heat 10.
- 상세는 docs/FOMO_INDEX.md 참조.

## MVP 범위
- 화면 3개: 로그인(선택) / 홈(핵심 경험 전부) / 설정
- 홈: FOMO Index + 오늘의 감정 투표 + 집단 통계 + Market Pulse 배너
- 커뮤니티는 초기 미포함. 집단 감정 수치로 대체.
- Phase 2에서 익명 감정 피드 추가 예정 (지금 구현 X).
---

## 2. docs/FOMO_INDEX.md 신규 생성

[확정 사항 B의 FOMO Index 전체 내용을 마크다운으로 정리하여 생성]

## 3. CLAUDE.md — "코드 작성 원칙" 하단에 추가

### FOMO Club
docs/FOMO_CLUB.md, docs/FOMO_INDEX.md 참조. 모노레포 내 별도 앱(apps/fomo-club, apps/fomo-web).
- 정직한 숫자 원칙: 가짜 데이터 금지, 실제 집계값만.
- 웹은 무가입 방문 가능 (익명 세션 기반 집계).
- FOMO Index는 fomo-core에서 산출. 체감 온도계이지 금융 지표가 아니다.
- MVP는 홈 화면 하나에 핵심 경험 집중. 커뮤니티/감정피드는 후속.

## 4. MEMORY.md — 진행 상황 최상단에 추가

Phase A (현재 최우선): FOMO Club MVP 출시 — 검증용. 타로 앱보다 먼저 출시.
  트리거: 4주 내 베타 출시 목표. 검증 후 타로 앱 방향 확정.

## 5. AGENTS.md — content-planner 확장 + 신규 에이전트 인지

content-planner 설명에 추가:
  "FOMO Magazine(SNS 채널) 콘텐츠를 감정 집계 데이터 기반으로 자동 기획한다.
   예: '어제 백만원 잃은 사람이 N명이었습니다'. 발행 전 슬랙 검수."

신규 에이전트 1개 정의 추가:
  name: fomo-index-analyst
  description: >
    FOMO Index 산출 로직의 정확성을 검증하고, 4개 Heat 컴포넌트의
    가중치/데이터 소스를 점검한다. 이상치 탐지 및 일일 리포트 생성.
  tools: [Read, Grep, Bash, WebSearch]
  model: sonnet

## 6. 커밋
git add -A && git commit -m "docs: FOMO Club MVP 도입 + FOMO Index 정의 + 전 에이전트 인지" && git push
```

---

# Phase 1: 모노레포 셋업 (fomo-core + 앱 셸)

```
FOMO Club 앱 구조를 셋업해줘.

## 1. packages/fomo-core 생성
- tsconfig + package.json 초기화
- src/index.ts
- src/types.ts: FomoIndex, HeatComponent, EmotionVote, EmotionType("fomo"|"fear"|"regret"|"greed"|"conviction") 타입
- 모노레포 workspaces에 등록

## 2. apps/fomo-club 생성 (모바일)
- Expo SDK 52+, TypeScript, expo-router, NativeWind, zustand
- DESIGN.md 테마 시스템 재사용 (tarot-mobile의 constants/theme 참고)
- app.json: name "FOMO Club", slug "fomo-club", bundleId "com.mlender.fomoclub"
- 탭 없이 단일 스택: index(홈) / settings / login

## 3. apps/fomo-web 생성 (무가입 웹)
- Next.js 14 App Router, TypeScript, Tailwind (DESIGN.md 토큰)
- 무가입 방문 가능한 홈 페이지 (/)
- 익명 세션: localStorage 기반 sessionId 발급
- 모바일 홈과 동일한 핵심 경험 (FOMO Index + 감정 투표 + 통계)

## 4. 검증 + 커밋
npm run lint && npm run typecheck
git add -A && git commit -m "feat: fomo-core + fomo-club + fomo-web 셸 셋업" && git push
```

---

# Phase 2: DB 스키마 + FOMO Index 산출 파이프라인

```
감정 집계 + FOMO Index 인프라를 구축해줘.

## 1. Prisma 스키마 추가

EmotionVote {
  id          String   @id @default(cuid())
  sessionId   String              // 익명 세션 (웹/앱 공통)
  userId      String?             // 가입자만
  emotion     String              // "fomo"|"fear"|"regret"|"greed"|"conviction"
  source      String              // "web"|"mobile"
  votedDate   String              // YYYY-MM-DD (1일 1회 제한용)
  createdAt   DateTime @default(now())
  @@unique([sessionId, votedDate])   // 1일 1회
  @@index([votedDate, emotion])
}

FomoIndexSnapshot {
  id            String   @id @default(cuid())
  date          String   @unique     // YYYY-MM-DD
  score         Int                  // 0~100
  state         String               // "무관심"|"관망"|"관심"|"FOMO"|"광기"
  marketHeat    Int                  // 0~30
  communityHeat Int                  // 0~30
  emotionHeat   Int                  // 0~30
  whaleHeat     Int                  // 0~10
  aiSummary     String
  insights      Json                 // Daily Insights 배너 배열
  prevDayDelta  Int
  avg30Delta    Int
  createdAt     DateTime @default(now())
}

마이그레이션 생성 + 적용.

## 2. fomo-core: FOMO Index 산출 로직

packages/fomo-core/src/index-engine/:
- marketHeat.ts: 시장 데이터(기존 shared 파이프라인) → 0~30
- communityHeat.ts: 소셜 언급량 → 0~30 (초기엔 mock 또는 단순 소스, 확장 가능 구조)
- emotionHeat.ts: 당일 EmotionVote 집계 → 0~30 (FOMO/탐욕↑ 상승, 공포/후회↑ 하락)
- whaleHeat.ts: 이벤트 기반 → 0~10
- calculate.ts: 4개 합산 → score + state 매핑
- summary.ts: AI 요약 생성 (기존 AI 런타임 재사용)

각 Heat는 데이터 소스 미비 시 안전한 기본값 + 폴백. 절대 빈 값/에러 노출 금지.

## 3. 일일 파이프라인 (GitHub Actions)

.github/workflows/fomo-index-pipeline.yml:
- 매일 장 마감 후(KST) + 추가로 주요 시간대 실행
- 시장 데이터 수집 → FOMO Index 산출 → FomoIndexSnapshot 저장
- 기존 research-pipeline.yml 패턴 참고

## 4. 검증 + 커밋
npm run lint && npm run typecheck && npx prisma validate
git add -A && git commit -m "feat: 감정 집계 + FOMO Index 산출 엔진 + 일일 파이프라인" && git push
```

---

# Phase 3: 홈 화면 — 핵심 경험 (웹 + 모바일)

```
FOMO Club의 홈 화면을 완성해줘. 모바일과 웹 공통.

## 1. API 엔드포인트 (apps/web/app/api/fomo/)

GET  /api/fomo/index            → 오늘의 FOMO Index 스냅샷
GET  /api/fomo/emotions/today   → 오늘 감정 투표 집계 (비율 + 총 N명)
POST /api/fomo/emotions/vote    → 감정 투표 (sessionId + emotion), 1일 1회
GET  /api/fomo/pulse            → Market Pulse 배너 데이터

무가입 허용: vote는 sessionId만으로 동작. userId 없어도 OK.

## 2. 홈 화면 구성 (모바일 apps/fomo-club + 웹 apps/fomo-web 동일 경험)

[포모 마스코트 (메인) + FOMO Index 숫자 (보조)]   ← docs/MASCOT.md 기준
- 화면의 주인공은 표정 짓는 포모. 숫자(FOMO Index)는 보조로 작게 깐다.
- 1단계 — 시장의 포모: 진입 직후 포모가 오늘의 FOMO Index를 표정으로 표현
  (5구간 ↔ 5표정 매핑, "오늘의 포모" 라벨 + 그날 지수 색으로 포모를 물들임)
- FOMO Index 숫자/상태/전일·30일 대비/AI Summary는 포모 아래 보조 정보로 배치
- 게이지/온도계 비주얼 (DESIGN.md / 마스코트 색 체계 활용)

[오늘의 감정 투표 + 2단계 전환]
- 질문: "오늘 당신의 감정은?"
- 5개 선택지: FOMO / 공포 / 후회 / 탐욕 / 확신
- 선택 순간 — 2단계 나의 포모로 전환:
  화면이 살짝 전환되며 포모가 내 감정 색으로 잠깐 바뀌고(전환 애니메이션),
  나에게 건네는 멘트를 출력 (예: 시장은 들떴는데 내가 '공포'를 고르면
  "다들 들떠 있어도 너는 무서울 수 있어. 그래도 괜찮아.")
  반응 후 내 감정과 시장 감정을 나란히 정리.
- 선택 후 즉시 집계 결과 표시:
  "오늘 N명이 감정을 선택했어요"
  FOMO 43% / 공포 22% / 후회 18% / 탐욕 11% / 확신 6%
- 핵심 카피: "당신과 같은 감정을 선택한 사람: N명"
- 정직한 숫자: N은 항상 실제값. 0~소수여도 그대로.
- 색 체계: FOMO=빨강 / 공포=파랑 / 후회=보라 / 탐욕=초록 / 확신=노랑.

[Market Pulse 배너]
- 롤링 배너, 🚨 형식
- "오늘 FOMO 지수 80 돌파" / "AI 언급량 +240%" 등

## 3. 무가입 웹 특화
- 첫 방문 시 localStorage에 sessionId 생성
- 감정 선택 → POST vote → 결과 즉시 표시
- "알림 받기 / 내 감정 기록하기" → 가입 유도 (선택)

## 4. 검증 + 커밋
npm run lint && npm run typecheck && npm run test
git add -A && git commit -m "feat: FOMO Club 홈 — FOMO Index + 감정 투표 + Market Pulse (웹/모바일)" && git push
```

---

# Phase 4: 운영 자동화 (슬랙봇 + 푸시 + 마케팅 에이전트)

```
1인 운영을 위한 자동화를 구축해줘.

## 1. 슬랙봇 일일 리포트

매일 아침 슬랙으로 발송 (GitHub Actions + Slack):
  📊 오늘의 FOMO Index: 72 (+8)
  👥 어제 감정 선택: FOMO 43% / 공포 22% / 후회 18% (총 N명)
  📈 신규 가입 X명 / DAU Y명 / 웹 방문 Z명
  🚨 이상 징후: (감정 통계 급변 또는 인덱스 산출 오류 시)

.github/workflows/fomo-daily-slack.yml 생성.

## 2. 푸시 알림

- FOMO Index 임계값 돌파 시 (80 돌파 등) 푸시
- 매일 아침 "오늘의 시장 감정" 푸시
- expo-notifications (기존 인프라 재사용)

## 3. content-planner → FOMO Magazine 자동화

- 매일 감정 집계 데이터를 소재로 SNS 콘텐츠 초안 생성
  예: "어제 'FOMO'를 선택한 사람이 N명이었습니다"
- 인스타/스레드/X/틱톡용 포맷별 초안
- 슬랙으로 검수 요청 → 승인 시 발행 (발행은 수동 또는 후속 자동화)

## 4. fomo-index-analyst 에이전트 가동

- FOMO Index 산출 이상치 탐지
- 4개 Heat 컴포넌트 가중치 점검
- 이상 발견 시 GitHub 이슈 자동 생성 + 슬랙 알림

## 5. 검증 + 커밋
npm run lint && npm run typecheck
git add -A && git commit -m "feat: FOMO Club 운영 자동화 (슬랙봇 + 푸시 + 마케팅 에이전트)" && git push
```

---

# Phase 5: 베타 출시

```
스토어 베타 출시를 준비해줘.

## 1. 출시 필수 작업
- 소셜 로그인 실연동 (Apple 필수 + Google) — 단, 로그인은 선택사항임을 명확히
- 앱 아이콘 + 스플래시 (FOMO Club 브랜드)
- EAS Build 프로필 (preview = 베타 트랙)
- 개인정보처리방침 + 이용약관 (fomo-web에 정적 페이지로 호스팅)
- 면책: "FOMO Index는 금융 지표가 아닌 감정 체감 지표이며, 투자 조언이 아닙니다"

## 2. 무가입 웹 배포
- apps/fomo-web → Vercel 배포
- 도메인 연결 (가입 없이 누구나 FOMO Index 확인 가능)
- SNS 공유용 OG 이미지 (오늘의 FOMO Index 동적 생성)

## 3. store-reviewer 최종 점검
- 앱 카테고리: Entertainment 또는 Lifestyle (금융 아님)
- 감정 데이터 수집 관련 데이터 안전 섹션
- 무가입 사용 가능 여부 명시

## 4. 검증 + 커밋
git add -A && git commit -m "chore: FOMO Club 베타 출시 준비 (스토어 + 웹 배포)" && git push
```

---

# 부록: 출시 우선순위 + 일정

```
1주차: Phase 0(에이전트 인지) + Phase 1(모노레포 셋업)
2주차: Phase 2(DB + FOMO Index 엔진)
3주차: Phase 3(홈 화면 — 웹/모바일)
4주차: Phase 4(운영 자동화) + Phase 5(베타 출시)
→ 4주 내 베타 출시, 검증 시작

✅ MVP 집중: FOMO Index + 감정 투표 + 집단 통계 (홈 하나)
🌐 웹 우선: 무가입 방문으로 빠른 유입 + 정직한 숫자 확보
🔒 후속: 감정 피드(Phase 2 기능), 추가 인덱스(Regret/Panic/Copium 등)
🔗 연결: 검증 후 감정 데이터 → 타로 엔진으로 연계
```
