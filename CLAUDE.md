# Trading Taro — 증권 시장 타로 해석 앱

## 사용자 (최광혁)

- Trading Taro 1인 개발자 겸 프로덕트 오너
- Next.js, TypeScript, React Native, Prisma에 익숙한 풀스택 개발자
- 여러 세션/기기에서 병렬로 작업함 → 토큰 효율 중요

## 프로젝트 컨텍스트

- **레포**: `mlender-ai/trading-taro`
- **제품**: 증권 시장의 기술적 지표를 AI가 분석하여 타로 카드 형식으로 해석을 제공하는 네이티브 앱
- **모노레포 구조**: `apps/web` (API + 어드민), `apps/tarot-mobile` (React Native), `packages/shared` (공용 타입), `packages/tarot-core` (비즈니스 로직)
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

### 코드 작성 원칙

```
1. 새 코드 작성 전, packages/shared/의 기존 타입과 유틸을 반드시 검색한다.
2. 기존 함수가 있으면 import하여 확장한다. 중복 구현 금지.
3. 기존 패턴(네이밍, 폴더 구조, export 방식)을 따른다.
4. 새 환경변수 추가 시 .env.example에도 반영한다.
5. AI 호출은 AI_API_URL / AI_API_KEY / AI_MODEL 환경변수 체계를 사용한다.
```

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
