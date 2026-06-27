# FOMO Club — 투자 판단력을 기르는 정보 피드

## 사용자 (최광혁)

- FOMO Club 1인 개발자 겸 프로덕트 오너
- Next.js, TypeScript, React Native, Prisma에 익숙한 풀스택 개발자
- 여러 세션/기기에서 병렬로 작업함 → 토큰 효율 중요

## 프로젝트 컨텍스트

- **레포**: `mlender-ai/fomo-club`
- **제품 — 정체성(PRODUCT_VISION v5 확정)**: **주식시장의 틴더 — 캐주얼 투자 발견 앱.** **두 표면, 한 엔진** — ① 발견(종목 카드 스와이프, 제품의 심장·종목 전용) ② 콘텐츠(뉴스·브리핑 읽기, 별도 표면). 둘 다 같은 **주목 엔진(포모 점수 + 💎 조기 발견)** 으로 돈다. 한 줄: **"머니터링은 종목을 분석해주고, FOMO Club은 너를 안다."** 분석 앱과 다른 게임(분석 아닌 **발견·취향**). 판단·결정은 유저 몫.
- **제품 — 핵심 규율**: 발견 표면은 **종목 카드 전용**(테마·매크로·이벤트는 콘텐츠 표면 또는 카드 안 사실 한 줄). 포모 점수·TA는 **발견의 연료**지 독립 진열 상품 아님(랭킹·차트 진열 금지). 💎는 수급 선행 **사실까지만**(예측·매수신호 금지). 매칭은 "네가 멈춰보던 패턴과 닮음" 취향 유사도까지만("사도 되는 자리" 금지). BM 확정 보류 + **발굴 성적표** 먼저.
- **제품 — 연료(데이터 엔진)**: 발견 카드의 사실을 공급하는 **파편 투자정보 응축 엔진**(키워드 카드 + 이해 레이어 — 원문 grounded 강세/약세·워딩, 수급). 수집→이해→재가공→응축. 엔진과 발견 표면은 같은 엔진의 두 면.
- **⚠️ 폐기 프레이밍(쓰지 마라)**: 감정 컨트롤·진정·위로·"물러나라"·"안 사도 돼"·감정 진단·마스코트 주인공·7종 카드 한 피드 — 현재 정체성 아님. 우리는 취향대로 발견하게 하고 어려운 걸 쉽게 번역한다.
- **정체성 정본(SSOT)**: `docs/PRODUCT_VISION.md` 가 **최상위 정본**(주식시장의 틴더 v5 — 두 표면·한 엔진). 충돌 시 이 문서가 이긴다. 나머지는 그에 정합:
  - `docs/PRODUCT_VISION.md` — **제품 정체성 정본(SSOT)**: 두 표면(발견 스와이프 + 콘텐츠 읽기)·한 엔진(포모 점수 + 💎)
  - `docs/PRODUCT_TRUTH.md` — 제품 정의·폐기물(VISION 에 정합)
  - `docs/DATA_ENGINE_STRATEGY.md` — 데이터 엔진(수집→이해→재가공→응축, 발견 카드의 연료), tier, 머지정책
  - `docs/KEYWORD_ENGINE_SPEC.md` — 발견 엔진 스펙(종목 카드·포모 점수·💎)
  - `docs/AGENT_REDESIGN.md` — 에이전트 재설계 정본
- **🚫 타로 신규 작업 거부 (확정 — 모든 세션·에이전트 준수)**: **FOMO Club이 유일한 제품 개발 대상**이다. 타로(tarot-core 프롬프트/해석, tarot-mobile 화면·UX, Signal Engine 등) 관련 **신규 기능·개선·이슈·PR은 거부**한다. 기존 타로 코드는 **보존만**(삭제 금지) 하며 손대지 않는다. 에이전트가 타로 관련 제안을 올리면 구현하지 말고 조용히 close(not_planned).
- **감정 기능(기록/캘린더/투표)**: flag로 숨김 상태(`packages/fomo-core/src/features.ts` — 삭제 금지, 복원 가능). **현재 정체성이 아님** — 데이터 엔진 피벗으로 강등됨.
- **모노레포 구조**: `apps/fomo-web` (웹 MVP), `apps/fomo-club` (React Native 네이티브 앱, 보류), `apps/web` (백엔드), `apps/api` (Fastify 백엔드/워커), `packages/fomo-core` (FOMO Club 도메인 로직), `packages/shared` (공용 타입·헬퍼).

## 루트 디렉토리 설명

| 디렉토리 | 용도 |
|---------|------|
| `generated/` | 에이전트·리서치·성과 측정 산출물. 직접 편집보다 생성 스크립트 갱신 우선. |
| `constraints/` | 에이전트 행동 제약 규칙 파일. 변경 시 광혁 확인 필요. |
| `knowledge/` | 도메인 지식 참조 자료와 일일 지식 스냅샷. |
| `design/` | 디자인 토큰 (`tokens.json`). 색·토큰 하드코딩 대신 이 파일 참조. |
| `docs/legacy/` | 폐기된 구 정체성 문서. 정체성 근거로 참조 금지. |

---

## 행동 규칙 (모든 모델, 모든 세션, 모든 기기에서 반드시 준수)

### 대화 스타일

- 한국어로 대화. 간결하게. 핵심만.
- GitHub PR 제목·본문·코멘트는 한국어로 작성. 코드 식별자·명령어·고유명사만 필요한 경우 영어 유지.
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

#### 게으름 사다리 (코드 쓰기 전 — ponytail, 전 LLM 공통)

"가장 좋은 코드는 안 짠 코드." 새 코드 쓰기 전 위에서부터 순서대로 자문하고, 멈추는 첫 칸에서 멈춘다 (영향 코드·실제 실행 흐름을 먼저 읽은 **뒤**에 적용 — 분석 생략 금지):

```
1. 이게 존재할 필요가 있나?   → 없다: 만들지 마라 (YAGNI)
2. 이미 이 코드베이스에 있나? → 재사용, 다시 짜지 마라 (특히 packages/shared)
3. 표준 라이브러리로 되나?    → 쓴다
4. 네이티브 플랫폼 기능인가?  → 쓴다
5. 이미 깔린 의존성으로 되나? → 쓴다
6. 한 줄이면 되나?            → 한 줄
7. 그제서야: 동작하는 최소 구현
```

코드가 작은 건 "골프"가 아니라 **필요만큼만** 짰기 때문이다. **단, 게으르되 부주의하진 않는다** — trust-boundary 검증·데이터 손실 처리·보안·접근성은 **절대 잘라내지 않는다**(투자 데이터 앱이라 특히). 우리 정체성("깊이 있는 단순함·기능 비대화 금물")과 같은 방향.

### 제품 정체성 (현재 방향)

정체성 정본은 **`docs/PRODUCT_VISION.md`**(주식시장의 틴더 v5 — 두 표면·한 엔진). `PRODUCT_TRUTH` / `DATA_ENGINE_STRATEGY` / `KEYWORD_ENGINE_SPEC` / `AGENT_REDESIGN` 는 그에 정합. 모든 화면·기능 결정의 최상위 기준이며, 충돌 시 VISION 이 이긴다.

- **핵심**: 종목을 스와이프로 **발견**하게 하고(심장), 어려운 걸 쉽게 번역해 *스스로 판단*하게 한다. 대리 분석·대리 결정·위로가 아니라 **발견·취향 매칭·판단 재료** 제공. 발견 표면은 종목 카드 전용, 포모 점수·TA는 연료(진열 금지), 💎는 사실까지만.
- **톤**: 담담한 사실 제공. 위로/감정 진정 톤("곧 반등"·과잉 위로) ❌, 거침("존버 가즈아") ❌, 단정·투자 조언 ❌.
- **형태가 곧 윤리**: 자유 텍스트 날것 ❌ / 규칙·형태로 담기 ⭕. 강세/약세·워딩은 원문 grounded(지어내기 금지).
- **깊이 있는 단순함**: 인디게임 만듦새. 기능 비대화 금물 — 좁은 범위, 한 번에 하나씩.
- **머지 기준**: CI(typecheck/test/build) + 불변 테스트 + 광혁 검수. (구 Lovable 게이트 / HARNESS Gate 6 / lovable-reviewer 는 폐기 — `docs/AGENT_REDESIGN.md`.)

### FOMO Club 데이터 엔진

`docs/DATA_ENGINE_STRATEGY.md` 참조. 수집→이해→재가공→응축이 제품의 심장. 앱: `apps/fomo-web`, `apps/fomo-club`.

- **정직한 숫자 원칙**: 가짜 데이터 금지, 실제 집계값만. 사용자 0~소수여도 그대로 표기. 데이터 부족 시 confidence 정직 노출(가짜 응축 금지).
- **무가입 웹**: apps/fomo-web은 가입 없이 방문 가능 (익명 세션 기반). 가입은 푸시/기록 저장 등 부가 기능에만 요구.
- **FOMO Index**: fear&greed 식 **보조 지표**(쏠림/관심도). 투자 조언 아니며, 강세/약세 판단 재료 중 하나다. (구 "감정 체감 온도계" 프레이밍은 폐기.)
- **출처 tier 정직 표기**: 공식 데이터/뉴스/커뮤니티 종류를 라벨로 구분 — 섞지 않는다.
- **스타일링**: apps/fomo-web·fomo-club은 **NativeWind**. tarot-mobile은 raw StyleSheet + constants/theme.ts 유지 — 공존 허용. 색·토큰 하드코딩 금지(`design/tokens.json` 참조).

### ⚠️ [폐기 2026-06-16] 구 정체성 — 마스코트·감정 온도계·MLP

아래는 키워드 카드·데이터 엔진 피벗 **이전**의 정체성이다. **현재 기준이 아님(히스토리 보존 — 가역적).** 새 작업·에이전트는 위 SSOT를 따르고, 아래를 정체성으로 되살리지 마라.

- 마스코트 "포모"(표정 = FOMO Index, 2단계 감정 변화, "홈의 주인공은 표정 짓는 포모") — **부활 금지**.
- FOMO Index = 감정 체감 온도계 프레이밍 — 보조 지표로 강등.
- MLP / Lovable 시금석("그날 밤 덜 외로웠을까", love mark 우선) — 판단력 피드로 대체.
- 감정 탭 피드·감정 기록·캘린더 중심 — flag로 숨김(features.ts), 정체성 아님.
- 참조 docs(`docs/legacy/FOMO_CLUB.md` / `docs/legacy/FOMO_INDEX.md` / `docs/legacy/MASCOT.md` / `docs/legacy/IDENTITY_AND_MILESTONES.md` / `docs/legacy/PIVOT_FEED_FIRST.md` / `docs/legacy/DESIGN_FOMO.md`): 히스토리 보존용, 현재 기준 아님(삭제는 보류).

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

### 발견 덱/카드 품질 게이트 (회귀 방지)

발견 덱·카드 훅·카드 정렬·섹터 라벨·뎁스 reason·시장온도·`/api/fomo/discovery`를 건드리면 `docs/DEVELOPMENT_QUALITY_GUARDRAILS.md`를 따르고 아래를 추가로 통과해야 한다.

```bash
npm run guard:discovery
```

이 게이트는 50장 유지, 앞단 가격-only 훅 금지, KOSPI/KOSDAQ 칩 금지, 앞단 유명주 회귀 금지, 금칙어 노출 금지를 검사한다. 실패하면 제품 회귀로 보고 테스트를 약화하지 말고 원인을 고친다.

### 참조 파일 로드 순서

```
CLAUDE.md          ← 지금 이 파일 (진입점)
  → docs/PRODUCT_TRUTH.md / PRODUCT_VISION.md ← 제품 정의·비전(SSOT) — 최상위 기준
  → docs/DEVELOPMENT_QUALITY_GUARDRAILS.md ← 발견 덱/카드/뎁스 회귀 방지
  → docs/DATA_ENGINE_STRATEGY.md ← 데이터 엔진(수집→이해→재가공→응축) + 머지정책
  → docs/AGENT_REDESIGN.md ← 에이전트 재설계 정본
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
