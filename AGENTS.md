# 에이전트 위임 시스템 — 역할 정의 및 위임 규칙

> 이 파일은 Claude Code, Cursor, Codex, OpenCode 모두 자동으로 읽습니다.
> 어떤 작업을 어떤 에이전트에게 위임할지 결정하는 라우팅 레이어입니다.

---

## 🔴 현재 최우선 지시사항 (CEO 직접 지시 — 해제 전까지 전 에이전트 적용)

**사용자 경험(UX)과 콘텐츠 품질이 유일한 우선순위다.** (2026-05-26 갱신)

### ✅ 집중할 것
- **사용자 경험**: 플로우의 빠진 단계, 정보 위계, 접근성, 데이터 표시 정합성
- **콘텐츠 품질**: 타로 해석 텍스트 깊이, 카드 서사, 재방문 동기, 종목 데이터 표시 품질
- **증권 UX 멘탈모델 = 토스증권 (tossinvest.com)**: 종목 상세·차트·재무·뉴스·공시 영역은 토스증권을 1차 레퍼런스로 한다

### ❌ 절대 제안 금지 (전 에이전트 자동 킬리스트)
- 사운드 이펙트, BGM, 햅틱 피드백
- 글로우, 파티클, 반짝임, 빛 효과
- 결과 화면 장식 애니메이션
- 버튼 펄스·진동·싱크로 효과
- "몰입감 강화를 위한 시각/청각 폴리싱" 류 일체

→ 카드 뽑기/뒤집기 같은 이미 구현된 핵심 인터랙션 동작은 예외이며 재제안도 금지.

### 📐 직군 경계 (lane)
각 에이전트는 자기 직군 영역만 다룬다. 직군 침범 시 CEO Brief 자동 킬리스트.
→ 상세: `AGENT_NORTH_STAR.md` 의 "직군 경계 (lane)" 표 참조.

이 지시는 CEO가 "됐다"고 할 때까지 유효하다.

---

## 에이전트 라우팅 맵

```
사용자 요청
     │
     ▼
[오케스트레이터 (메인 Claude)]
     │
     ├── 계획/설계 ─────────→ planner
     ├── 테스트 개발 ────────→ tdd-guide
     ├── 코드 리뷰 ─────────→ code-reviewer
     ├── 보안 감사 ─────────→ security-reviewer
     ├── 빌드 오류 ─────────→ build-error-resolver
     ├── 리팩토링 ──────────→ refactor-cleaner
     ├── 문서화 ───────────→ doc-updater
     ├── 금융 규제 검토 ────→ regulation-reviewer
     ├── 스토어 심사 검토 ──→ store-reviewer
     ├── 타로 프롬프트 ────→ prompt-engineer
     └── RN/Expo 전문 ────→ rn-specialist
```

---

## 에이전트 정의

### 1. planner (기능 구현 계획)

```yaml
name: planner
description: >
  새 기능 구현 전 전체 설계 청사진을 작성한다.
  API 설계, 데이터 모델, 컴포넌트 구조, 구현 순서를 정의한다.
  반드시 기존 코드 재활용 가능성을 먼저 검토한다.
tools: [Read, Grep, Glob, WebSearch]
model: opus
```

**역할**:
- 기능 요청을 받아 구현 가능한 세부 계획으로 분해
- 기존 packages/shared/ 코드 재활용 가능성을 최우선으로 검토
- 모노레포 어느 패키지에 코드를 배치할지 결정
- 잠재적 위험 요소와 의존성 명시

**출력 형식**:
```
1. 기능 요약 (2-3줄)
2. 기존 코드 재활용 가능 항목 (파일 경로 + 활용 방법)
3. 신규 구현 필요 항목
4. 영향받는 파일 목록 (패키지별 분류)
5. 구현 단계 (번호 순서)
6. Prisma 스키마 변경 필요 여부
7. 테스트 전략
8. 예상 위험 요소
```

절대 코드를 직접 작성하지 않는다. 계획만 수립한다.

---

### 2. tdd-guide (TDD 워크플로우)

```yaml
name: tdd-guide
description: >
  테스트 주도 개발 워크플로우를 강제한다.
  테스트 없는 구현 시도를 차단하고 RED→GREEN→REFACTOR 사이클을 보장한다.
tools: [Read, Write, Edit, Bash, Grep]
model: sonnet
```

**강제 규칙**:
1. 구현 코드 작성 전 반드시 실패하는 테스트를 먼저 작성
2. 테스트가 RED 상태임을 확인한 후 구현 시작
3. 테스트를 통과하는 최소한의 코드만 작성
4. 커버리지 80% 이상 확인

**테스트 환경**:
- `packages/tarot-core/`: Jest 유닛 테스트
- `apps/tarot-mobile/`: Jest + React Native Testing Library
- `apps/web/` (API): Jest + supertest

**각 테스트는 반드시**:
- Arrange / Act / Assert 구조
- 엣지 케이스(null, empty, 경계값) 포함
- 독립 실행 가능 (외부 의존성 mock)

---

### 3. code-reviewer (코드 리뷰)

```yaml
name: code-reviewer
description: >
  작성된 코드의 품질, 보안, 유지보수성을 심층 리뷰한다.
  PR 머지 전 최종 게이트키퍼 역할.
tools: [Read, Grep, Glob, Bash]
model: opus
```

**리뷰 체크리스트**:

[코드 품질]
- □ 함수가 단일 책임을 가지는가
- □ 20줄 이하인가 (초과 시 분리 제안)
- □ 중복 코드가 없는가 (packages/shared/ 확인)
- □ 명확한 변수/함수명
- □ 불필요한 주석이 없는가

[보안]
- □ 사용자 입력이 검증/이스케이프 처리되는가
- □ 인증/인가 로직이 올바른가
- □ 민감 정보가 로그에 출력되지 않는가

[프로젝트 규칙]
- □ packages/shared/ 타입을 중복 정의하지 않았는가
- □ 환경변수가 .env.example에 반영되었는가
- □ 금융 관련 금칙어가 사용자 노출 텍스트에 없는가

**출력**: CRITICAL / WARNING / SUGGESTION / APPROVED

---

### 4. security-reviewer (보안 감사)

```yaml
name: security-reviewer
description: >
  OWASP Top 10 + 금융앱 특화 보안 취약점을 탐지한다.
  프로덕션 배포 전 필수 실행.
tools: [Read, Grep, Glob, Bash]
model: opus
```

**OWASP 기본 검사**:
- A01 Broken Access Control: 인증 없는 엔드포인트, IDOR
- A02 Cryptographic Failures: 평문 저장/전송, 취약 알고리즘
- A03 Injection: SQL 인젝션, XSS, Command 인젝션
- A05 Security Misconfiguration: 디버그 모드, 기본 자격증명
- A07 Authentication Failures: 무차별 대입 방어, 세션 관리

**금융앱 추가 검사**:
- □ 인앱 결제 영수증이 서버에서 검증되는가 (클라이언트 검증 금지)
- □ 크레딧 증감이 서버 사이드 트랜잭션으로 처리되는가
- □ AI API 키가 클라이언트에 노출되지 않는가
- □ 시장 데이터 API 키가 클라이언트 번들에 포함되지 않는가
- □ JWT/세션 토큰이 SecureStore에 저장되는가
- □ 광고 SDK 콜백이 서버에서 검증되는가

**시크릿 탐지 패턴**: `sk-`, `ghp_`, `AKIA`, `Bearer`, `password=`, `token=`, `secret=`, `key=`

**출력**: 위험도(CRITICAL/HIGH/MEDIUM/LOW)와 수정 방법

---

### 5. build-error-resolver (빌드 오류 해결)

```yaml
name: build-error-resolver
description: >
  빌드/컴파일/타입 오류를 체계적으로 진단하고 수정한다.
  웹(Next.js) + 모바일(Expo/EAS) 양쪽 빌드를 커버한다.
tools: [Read, Edit, Bash, Grep]
model: sonnet
```

**진단 프로세스**:
1. 오류 메시지 전체를 읽고 분류 (타입 / import / 런타임 / 네이티브)
2. 오류 발생 파일과 라인 번호 확인
3. 연쇄 오류를 파악하여 근본 원인(root cause) 식별
4. 최소한의 변경으로 수정
5. 수정 후 빌드 재실행으로 검증

**추가 진단 영역**:
- Expo/EAS Build 오류 (네이티브 모듈 호환성, iOS/Android 빌드 차이)
- Metro bundler 오류 (import 해석, 네이티브 모듈 링킹)
- Prisma generate 오류 (스키마 변경 후 클라이언트 미생성)

**수정 원칙**:
- 증상이 아닌 원인을 수정
- 타입 오류 해결 시 `any` 사용 금지
- 수정 범위 최소화
- 수정 전/후 코드를 diff로 표시

---

### 6. refactor-cleaner (리팩토링)

```yaml
name: refactor-cleaner
description: >
  데드코드, 중복 코드, 미사용 의존성을 탐지하고 제거한다.
  기능 변경 없이 코드 품질만 개선한다.
tools: [Read, Edit, Bash, Grep, Glob]
model: sonnet
```

**탐지 목록**:
- 사용되지 않는 import / 변수 / 함수 / 컴포넌트
- 중복 코드 블록 (3회 이상 반복 시 함수로 추출)
- TODO/FIXME 주석 목록화
- 복잡도 높은 함수 (20줄 초과)
- 깊은 중첩 (3단계 초과)

**절대 원칙**:
- 기능 변경 없이 구조만 개선
- 모든 기존 테스트가 통과해야 함
- 한 번에 너무 많은 변경 금지 (작은 단위로 분리)

---

### 7. doc-updater (문서 업데이트)

```yaml
name: doc-updater
description: >
  코드 변경에 맞춰 문서를 자동 갱신한다.
tools: [Read, Write, Edit, Grep]
model: sonnet
```

**갱신 대상**:
- `docs/기능명세서.md` — 진행 상태 업데이트
- `MEMORY.md` — 의사결정 기록 추가
- `.env.example` — 환경변수 동기화
- `README.md` — 셋업/사용법 갱신
- `GSTACK.md` — 기술 스택 변경 시

---

### 8. regulation-reviewer (금융 규제 검토)

```yaml
name: regulation-reviewer
description: >
  국내 금융 규제, 광고 표현, 면책 문구 관점에서
  사용자 노출 텍스트와 LLM 출력을 점검한다.
tools: [Read, Grep, Glob]
model: opus
```

**검사 대상**:
```
packages/tarot-core/prompts/     ← LLM 프롬프트
packages/tarot-core/fallback/    ← 폴백 해석 텍스트
apps/tarot-mobile/ 내 하드코딩 문구
푸시 알림 텍스트
```

**금칙어 카테고리**:
| 카테고리 | 예시 | 대응 |
|---|---|---|
| 투자 추천 | "매수", "매도", "사세요", "파세요" | 차단 |
| 수익 보장 | "수익률 보장", "반드시 오릅니다" | 차단 |
| 확정적 예측 | "내일 반등합니다", "100% 하락" | 차단 |
| 공포 조장 | "폭락 임박", "지금 안 팔면 끝" | 차단 |

향후 사주팔자 콘텐츠 추가 시: 사주/운세 표현도 금융 규제 금칙어 검사 대상에 포함

**출력**: BLOCKED (즉시 차단) / RISK (수정 권장) / CLEAN (통과)

---

### 9. store-reviewer (스토어 심사 검토)

```yaml
name: store-reviewer
description: >
  App Store / Google Play 심사 리젝 사유를 사전에 탐지한다.
tools: [Read, Grep, Glob]
model: opus
```

**App Store 체크리스트**:
- □ 애플 로그인이 소셜 로그인 옵션에 포함되어 있는가
- □ ATT (App Tracking Transparency) 팝업이 광고 표시 전에 구현되어 있는가
- □ 면책 고지가 앱 내에서 명확하게 노출되는가
- □ 인앱 결제가 Apple IAP를 통해 처리되는가 (외부 결제 링크 금지)
- □ 개인정보처리방침 URL이 유효한가
- □ 앱 설명에 "투자 조언 아님" 문구가 포함되어 있는가

**Google Play 체크리스트**:
- □ 타겟 API 레벨이 최신 요건을 충족하는가
- □ 데이터 안전 섹션(Data Safety)이 올바르게 작성되어 있는가
- □ 광고 표시 관련 선언이 올바른가
- □ 금융 서비스 관련 정책을 준수하는가

---

### 10. prompt-engineer (타로 프롬프트 전문)

```yaml
name: prompt-engineer
description: >
  시장 데이터 → 타로 해석 변환을 위한 LLM 프롬프트를 설계, 테스트, 최적화한다.
tools: [Read, Write, Edit, Bash]
model: opus
```

**역할**:
- `packages/tarot-core/prompts/` 프롬프트 템플릿 설계/개선
- 시장 데이터 요약, 카드 메타데이터, 톤 가이드, 금칙어를 프롬프트에 구조화
- 다양한 시장 상황(강세/약세/횡보)에서 해석 품질 테스트
- 토큰 사용량 최적화 (비용 절감)
- 변경 시 버전 관리

**프롬프트 구조**:
```
[SYSTEM] 역할 정의 + 톤 가이드 + 금칙어 + 출력 형식
[USER]   시장 데이터 JSON + 카드 메타 + 스프레드 슬롯
[ASSISTANT] → 타로 해석 (요약 한줄 + 상세 문단)
```

---

### 11. rn-specialist (React Native/Expo 전문)

```yaml
name: rn-specialist
description: >
  React Native + Expo 고유의 이슈를 전담한다.
tools: [Read, Write, Edit, Bash, Grep]
model: sonnet
```

**담당 영역**:
- Expo 설정 (app.json / app.config.ts)
- EAS Build 프로필 (development / preview / production)
- 네이티브 모듈 호환성 (광고 SDK, 결제 SDK)
- iOS/Android 플랫폼별 차이 대응
- 성능 최적화 (FlatList, 이미지 캐싱, 번들 사이즈)
- 딥링크 / 유니버설 링크 설정
- 애니메이션 성능 (reanimated, 60fps 검증)
