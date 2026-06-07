# Trading Taro — 증권 시장 타로 해석 앱

## 사용자 (최광혁)

- Trading Taro 1인 개발자 겸 프로덕트 오너
- Next.js, TypeScript, React Native, Prisma에 익숙한 풀스택 개발자
- 여러 세션/기기에서 병렬로 작업함 → 토큰 효율 중요

## 프로젝트 컨텍스트

- **레포**: `mlender-ai/taro-stock-app`
- **제품**: 증권 시장의 기술적 지표를 AI가 분석하여 타로 카드 형식으로 해석을 제공하는 네이티브 앱
- **리포지셔닝 (현재 최우선)**: 본 프로젝트는 **FOMO CLUB**으로 리포지셔닝 중이다(MVP 우선 출시). 타로 엔진/코드는 모노레포 내 보존하며 해석 백엔드로 후속 연계한다. 레포 디렉토리·패키지 리네이밍(@trading/*, @taro/*, tarot-mobile 등)은 출시 전후 별도 정리 라운드로 연기한다. 정의/지표/마스코트는 `docs/FOMO_CLUB.md`, `docs/FOMO_INDEX.md`, `docs/MASCOT.md` 참조.
- **🚫 타로 신규 작업 거부 (확정 — 모든 세션·에이전트 준수)**: 앞으로 **FOMO Club이 최우선이자 유일한 제품 개발 대상**이다. 타로(tarot-core 프롬프트/해석, tarot-mobile 화면·UX, Signal Engine 등) 관련 **신규 기능·개선·이슈·PR은 거부**한다. 기존 타로 코드는 보존만 하며 손대지 않는다. 에이전트 카운슬(github-actions)이 타로 관련 제안을 올리면 구현하지 말고 조용히 close(not_planned). FOMO Club과 직접 연계되는 해석 백엔드 작업만 예외적으로 후속 라운드에서 검토한다.
- **모노레포 구조**: `apps/web` (API + 어드민), `apps/api` (Fastify 백엔드/워커), `apps/tarot-mobile` (React Native), `packages/shared` (공용 타입), `packages/tarot-core` (비즈니스 로직). FOMO Club 신설 예정: `apps/fomo-club`, `apps/fomo-web`, `packages/fomo-core`.
- **기능명세서**: `docs/기능명세서.md` 참조

---

## 행동 규칙 (모든 모델, 모든 세션, 모든 기기에서 반드시 준수)

### 대화 스타일

- 한국어로 대화. 간결하게. 핵심만.
- 불필요한 인사, 요약 반복, 확인 질문 금지.
- "~할까요?", "~해도 될까요?" 묻지 말 것 — 크리티컬하지 않으면 바로 실행.
- 작업 끝나면 장황하게 설명하지 말 것. 변경사항은 diff로 보임.

### 자율 실행 원칙

- git commit, push, pull, rebase → 묻지 말고 실행.
- 파일 생성/수정/삭제 → 묻지 말고 실행.
- GitHub API (이슈 close, comment, PR) → 묻지 말고 실행.
- 코드 변경 완료 → 즉시 commit + push. "커밋할까요?" 같은 질문 금지.
- **크리티컬 예외만 확인**: 프로덕션 DB 삭제, force push to main, 비밀키 노출, 되돌릴 수 없는 대량 삭제, Prisma migration.

### 토큰 효율 (필수 — 1인 개발, 토큰이 곧 런웨이)

- **세션을 짧게**: 한 페이즈 끝나면 `/compact` 또는 새 세션 시작. 긴 대화는 매 턴 전체 히스토리를 재전송 → 가장 큰 비용. 연속성은 MEMORY/메모리 파일이 보장.
- **서브에이전트 남발 금지**: Explore/Plan/general 에이전트는 매번 풀 컨텍스트를 포크한다(비쌈). 파일 위치를 알거나 1~3개만 보면 되면 **직접 Read/Grep**. 진짜 광범위 탐색일 때만 1개.
- **타깃 읽기**: 큰 파일은 offset/limit로 필요한 부분만. 같은 파일 반복 전체 읽기 금지.
- **스크린샷 절제**: preview_screenshot 이미지는 토큰이 크다. 변경 확인에 꼭 필요할 때 1장만.
- **MCP 정리**: 작업에 안 쓰는 MCP 서버는 끈다(스키마/도구목록이 매 턴 실림). FOMO 웹 개발엔 supabase·vercel·Claude_Preview면 충분.

### 코드 작성 원칙

```
1. 새 코드 작성 전, packages/shared/의 기존 타입과 유틸을 반드시 검색한다.
2. 기존 함수가 있으면 import하여 확장한다. 중복 구현 금지.
3. 기존 패턴(네이밍, 폴더 구조, export 방식)을 따른다.
4. 새 환경변수 추가 시 .env.example에도 반영한다.
5. AI 호출은 AI_API_URL / AI_API_KEY / AI_MODEL 환경변수 체계를 사용한다.
6. catch 블록에 최소한 console.warn 또는 에러 상태 set. 빈 catch {} 금지.
7. react-native-svg 사용 시 lib/svg.ts 래퍼 import. 새 SVG 컴포넌트 추가 시 svg.ts에도 추가.
```

### 제품 정체성 (North Star — MLP)

FOMO Club은 MVP가 아니라 **MLP(Minimum Lovable Product)**다. 정체성 정본: `docs/IDENTITY_AND_MILESTONES.md` (모든 화면·기능 결정의 최상위 기준).

- **시금석(모든 결정)**: *"내가 물렸던 그날 밤, 진짜 열고 싶었던 앱 — 그날 밤의 내가 이걸 보고 조금 덜 외로웠을까?"*
- **톤 3원칙**: ①담담한 솔직함(가짜긍정 "곧 반등" ❌ / 거침 "존버 가즈아" ❌ / 사실 인정 + 혼자 아님 ⭕) ②형태가 곧 윤리(자유 텍스트 날것 ❌ / 규칙·형태로 담기 ⭕) ③깊이 있는 단순함(인디게임 만듦새).
- **love mark는 nice-to-have가 아니라 의도적 우선순위**(포모의 한마디, 전환 애니메이션, 캘린더의 만족감 등). 일정이 빠듯해도 자르지 않는다.
- **제품에 대한 FOMO 경계**: 기능 비대화(타로+감정+사주+피드 다 넣기)는 금물. 좁은 범위 안에서 사랑스러움만 maximum. 한 번에 하나씩.
- 머지/출시 전 **Lovable 게이트**(HARNESS Gate 6, lovable-reviewer)를 통과해야 한다.

### FOMO Club

docs/FOMO_CLUB.md, docs/FOMO_INDEX.md 참조. 모노레포 내 별도 앱(apps/fomo-club, apps/fomo-web)으로 신설한다.

- **정직한 숫자 원칙**: 가짜 데이터 금지, 실제 집계값만. 사용자 0~소수여도 그대로 표기.
- **무가입 웹**: apps/fomo-web은 가입 없이 방문 가능 (익명 세션 기반 집계). 가입은 푸시/기록 저장 등 부가 기능에만 요구.
- **FOMO Index**: packages/fomo-core에서 산출. 체감 온도계이지 금융 지표가 아니다(투자 조언 아님).
- **MVP**: 홈 화면 하나에 핵심 경험 집중. 커뮤니티/감정피드는 후속.
- **스타일링**: apps/fomo-club은 **NativeWind** 사용(마스터 프롬프트 확정). 기존 tarot-mobile은 raw StyleSheet + constants/theme.ts 유지 — 두 앱의 스타일 패턴 공존을 허용한다.

### FOMO Club 마스코트 (포모)

docs/MASCOT.md 참조. 포모는 FOMO Club의 마스코트이자 살아있는 지표다.

- 포모의 표정이 곧 FOMO Index다. 홈 화면의 주인공은 숫자가 아니라 표정 짓는 포모.
- 두 단계 감정 변화는 필수 구현: ①시장의 포모(진입 직후, FOMO Index 표현) → ②나의 포모(감정 선택 후 반응).
- 화면 설계 시 이 두 상태와 전환(애니메이션 + 멘트)을 반드시 포함한다.
- 디자인: 검은 얼굴 + 흰 눈, 얼굴 중심. 배경 검정, 감정 색은 포인트로만. 화면 밀도는 기리고처럼 비운다.
- 색 체계: FOMO=빨강 / 공포=파랑 / 후회=보라 / 탐욕=초록 / 확신=노랑.
- **디자인 시스템 정본**: `docs/DESIGN_FOMO.md` (DESIGN.md 표준). 토큰 단일 소스(DTCG): `design/tokens.json`. Figma 연결/왕복: `docs/FIGMA_WORKFLOW.md`. 앱별 포인터: `apps/fomo-web/DESIGN.md`, `apps/fomo-club/DESIGN.md`. 색·토큰 하드코딩 금지 — 토큰 참조.

### 향후 피처 대비 설계 원칙 (사주팔자 통합)

docs/사주팔자_투자체질_기획서.md 에 정의된 사주팔자 피처는 **구현하지 않되, 설계에 반영**한다.

- 프롬프트 빌더: 파라미터를 확장 가능한 구조로 설계 (optional context 객체)
- 해석 결과 타입: 확장 가능한 인터페이스 사용 (`[key: string]: unknown` 허용)
- User 모델: 사주 필드를 직접 넣지 않음 (별도 SajuProfile 테이블로 분리 예정)
- 데일리 카드: "공통 해석 + 개인 레이어" 분리 가능한 구조
- 해석 결과 UI: 기본 해석 블록 아래에 추가 블록이 들어갈 수 있는 구조
- 종목 데이터: sector 필드 항상 포함

사주 관련 코드를 작성하거나 DB 스키마를 추가하는 것은 금지.

### 배포 전 필수 검증 (절대 스킵 금지)

push 전에 아래를 **반드시** 순서대로 통과:

```bash
npm run lint && npm run typecheck   # 1. 린트 + 타입
npm run build:web                    # 2. API 서버 빌드
npm run test                         # 3. 테스트
npx prisma validate                  # 4. DB 스키마 (변경 시)
```

하나라도 실패하면 push하지 않고 즉시 수정한다.

### 참조 파일 로드 순서

```
CLAUDE.md          ← 지금 이 파일 (진입점)
  → docs/IDENTITY_AND_MILESTONES.md ← 제품 정체성(North Star, MLP) — 최상위 기준
  → GSTACK.md      ← 기술 스택 참조
  → AGENTS.md      ← 에이전트 역할 정의 + 라우팅
  → SKILLS.md      ← 도메인 전문 스킬
  → ORCHESTRATION.md ← 멀티 에이전트 협업 규칙
  → HARNESS.md     ← 품질 게이트
  → MEMORY.md      ← 컨텍스트 지속
  → AGENT_BIBLE.md ← 불변 원칙
```

---

## gstack 연동

gstack 스킬(`~/.claude/skills/gstack/`)이 설치되어 있다. 아래 슬래시 커맨드를 적극 활용한다.

### 주요 커맨드
- `/plan-eng-review` — 기능 구현 전 아키텍처/설계 리뷰
- `/plan-ceo-review` — 제품 방향성 리뷰
- `/plan-design-review` — UI/UX 디자인 리뷰
- `/review` — 코드 완성 후 프로덕션 버그 탐지 리뷰
- `/qa` — 실제 브라우저/앱에서 QA 실행
- `/ship` — PR 생성 + 릴리즈
- `/retro` — 작업 완료 후 회고 + MEMORY.md 업데이트
- `/careful` — 위험한 변경 전 안전 모드 활성화
- `/freeze` — 아키텍처 확정 후 변경 잠금
- `/browse` — 웹 브라우징 (모든 웹 브라우징에 이 커맨드 사용)

### 워크플로우 규칙
- 새 기능 시작 전: `/plan-eng-review` 먼저 실행
- 코드 완성 후: `/review` 실행
- PR 올리기 전: `/ship` 으로 최종 점검
- 작업 끝나면: `/retro` 로 회고 + 메모리 업데이트
- Prisma 스키마 변경, 인증/결제 관련 코드: `/careful` 선행
- **5개 이상 파일 변경하는 PR 완료 후: 반드시 `/retro` 실행** (project_taro.md에 새 파일/패턴/아키텍처 기록, 다른 세션이 알아야 할 정보 업데이트)
- **대규모 기능(10+ 파일)은 Phase별로 나눠서 커밋**. 각 Phase 커밋 후 시뮬레이터에서 동작 확인. 전체 완료 후 하나의 PR로 통합.

---

## tarot-mobile 전용 규칙

### Expo Go 개발 환경 제약 (반드시 준수)

Expo Go는 **사전 빌드된 네이티브 바이너리** 위에서 JS만 실행한다. 아래 모듈은 **Expo Go에서 절대 직접 import 금지**:

| 모듈 | 이유 | 대응책 |
|------|------|--------|
| `react-native-google-mobile-ads` | TurboModule 네이티브 바이너리 없음 | `try { require(...) } catch {}` 패턴 사용 |
| `react-native-purchases` | RevenueCat 네이티브 SDK | 동일 |
| `react-native-reanimated` (babel plugin) | `react-native-worklets` 의존 | `babel.config.js`에서 `reanimated: false` |

### push 전 필수 검증 (tarot-mobile)

**절대 스킵 금지.** 아래 스크립트가 통과해야만 commit+push:

```bash
cd apps/tarot-mobile && bash scripts/verify-bundle.sh
```

5개 체크 항목:
1. React 버전 격리 (앱 19.x, 루트 18.x 충돌 차단)
2. babel-preset-expo 경로 존재
3. metro.config.js blockList 존재
4. app.json에 reanimated plugin 없음
5. 실제 iOS 번들링 에러 0

이 스크립트를 통과하지 않으면 **Expo Go에서 크래시** 발생.

### 모바일 화면 변경 시 런타임 QA (새 화면 추가 / 기존 화면 수정 시)

빌드 검증 통과 후, **새 화면이나 UI 변경이 있으면 시뮬레이터에서 반드시 확인**:

```bash
cd apps/tarot-mobile && npx expo start --ios
```

- 변경된 화면으로 직접 네비게이션하여 렌더링 확인
- API 호출이 있으면 dev server 로그에서 200 응답 확인
- 빈 데이터/에러 상태에서 크래시 없음 확인
- SVG 차트, 애니메이션 등 시각적 요소가 의도대로 표시되는지 확인

### 모노레포 React 격리 원리

- npm workspaces hoisting → root `node_modules`에 올라가는 패키지가 root React 18 참조
- `metro.config.js` blockList로 root `react`/`react-native` 완전 차단
- `extraNodeModules`로 모든 import를 앱 로컬 React 19로 강제 redirect
- `babel.config.js`는 `expo/node_modules/babel-preset-expo` 절대경로 사용 (root `@babel/core`가 앱 로컬 preset을 못 찾는 문제 방지)
