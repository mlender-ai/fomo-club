# FOMO Club — 개발 도구 현황 (Tooling SSOT)

> 이 문서는 **개발 생산성 도구**의 도입 상태를 한 곳에 모은다. 제품 런타임 동작과는 무관하다.
> 에이전트 행동 규약 본문은 `AGENTS.md`에만 둔다 — 여기엔 도구의 상태·셋업·주의점만 적는다.

## 1. 도구 현황표

| 도구 | 축 | 상태 | 무엇 | 정본/셋업 |
| --- | --- | --- | --- | --- |
| **CodeGraph** | 소스코드 그래프 (개발) | 🟢 도입 (2026-08) | 사전 인덱싱된 코드 지식그래프 MCP. 통독 대신 심볼·호출경로·영향반경을 한 번에 조회 | 이 문서 §2, 규약은 `AGENTS.md` "코드 그래프 우선 규약" |
| **opik** | LLM 관측·평가 (제품) | 🟢 도입 (2026-06) | `callAI()` 단일 seam에 내장된 LLM 호출 추적 + LLM-as-judge 평가 | `docs/DATA_ENGINE_STRATEGY.md` §9.1 |
| **Figma MCP** | 디자인 ↔ 코드 (개발) | 🟢 도입 | 피그마 디자인·토큰을 코드로 왕복 | `docs/FIGMA_WORKFLOW.md` |
| **gstack** | 워크플로우 슬래시 커맨드 (개발) | 🟢 도입 | QA·리뷰·ship 등 스킬 묶음 | `docs/GSTACK_GUIDE.md` |
| **codebase-memory** | 소스코드 그래프 (개발) | 🟡 레거시/로컬 전용 | CodeGraph 도입 전 쓰던 구조 쿼리 MCP(`get_architecture`/`search_graph`/`trace_path`) | `.mcp.json` — 병존, 정리 여부는 광혁 결정 |
| **headroom** | 컨텍스트 압축 (개발) | 🟡 로컬 전용 | 컨텍스트 압축·검색 MCP | `.mcp.json` |
| **graphiti** | **제품 데이터** 시간성 그래프 | 🟡 후보 (지금은 X) | 종목·테마·이벤트의 시점 변화를 그래프로 | `docs/DATA_ENGINE_STRATEGY.md` §9.2 |

**축 구분 주의**: `graphiti`는 *제품이 다루는 데이터*(종목·테마·내러티브의 시간성) 그래프 후보이고, `CodeGraph`는 *우리 소스코드* 그래프다. 이름이 비슷해 섞이기 쉬운데 서로 대체 관계가 아니다.

### `.mcp.json` 이식성

`codebase-memory`·`headroom`은 커맨드가 로컬 절대경로(`/Users/cocteau/...`)라 **광혁 머신 전용**이다. 다른 머신·CI에서는 그 두 서버가 붙지 않는다(치명적이지 않음 — 없으면 안 붙을 뿐).

`codegraph`는 절대경로 대신 **로그인 셸 경유**(`zsh -lc "exec codegraph serve --mcp"`)로 등록했다. 하드코딩된 홈 경로가 없어 머신 간 이식성이 있고, 동시에 아래 함정을 피한다.

> ⚠️ **실측 함정 — `command: "codegraph"` 만으로는 desktop 앱에서 안 뜬다.** Claude Code desktop 앱 프로세스의 PATH는 `/usr/bin:/bin:/usr/sbin:/sbin` 뿐이고, MCP stdio 서버는 그 환경을 그대로 물려받는다. `~/.local/bin`(codegraph 설치 위치)이 없으므로 PATH 기반 등록은 `command not found`로 죽는다. `sh -lc`도 안 된다 — `sh`는 `~/.zprofile`을 읽지 않는다. `zsh`는 최소 PATH에도 있고(`/bin/zsh`) 로그인 모드에서 `~/.zprofile`을 읽으므로 해석에 성공한다. 기존 두 서버가 지금까지 멀쩡했던 건 절대경로였기 때문이다.
>
> 전제: `~/.zprofile`(또는 `~/.zshenv`)에 `export PATH="$HOME/.local/bin:$PATH"` 가 있어야 한다 — §2 셋업에 포함.

`codegraph install` 이 **유저 스코프**에 쓰는 항목(`~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/config.toml` 등)은 bare `codegraph` 라서 같은 함정에 걸린다. 터미널에서 띄우는 에이전트(Codex CLI 등)는 셸 PATH를 물려받아 정상 동작하지만, **desktop 앱은 위와 같이 고쳐야 한다.** `codegraph upgrade`(`--refresh`)가 그 항목을 되돌려 쓸 수 있으니 업그레이드 후 재확인한다.

새 MCP를 추가할 때는 절대경로 하드코딩보다 이 로그인 셸 경유 패턴을 우선한다.

## 2. CodeGraph 셋업 (머신당 1회)

CLI는 각자 로컬에 설치한다. 레포에는 인덱스를 커밋하지 않는다(`.gitignore`에 `.codegraph/`).

```bash
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
```

설치 스크립트는 `~/.local/bin/codegraph` 에 링크만 걸고 **PATH는 건드리지 않는다.** 없으면 추가한다(이게 없으면 MCP도 CLI도 안 잡힌다 — §1 실측 함정 참고).

```bash
grep -q '.local/bin' ~/.zprofile || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile
```

새 터미널을 열고 에이전트를 연결한다(Claude Code·Codex CLI·Antigravity·Cursor·Gemini 자동 감지).

```bash
codegraph install
```

레포 루트에서 인덱싱한다(디렉터리 생성 + 그래프 빌드가 한 단계).

```bash
cd ~/fomo-club && codegraph init
```

확인한다.

```bash
codegraph status
```

설치 후 각 에이전트(Claude Code·Codex·Antigravity)를 **재시작**해야 MCP가 로드된다. 이후 auto-sync가 파일 변경을 2초 디바운스로 따라가므로 재인덱싱을 수동으로 돌릴 일은 없다(필요하면 `codegraph sync`).

### 자동 삽입 섹션은 건드리지 않는다

`codegraph install`은 각 에이전트의 MCP 설정과 진입 파일(`CLAUDE.md`/`AGENTS.md`/`GEMINI.md`)에 **marker-fenced 섹션**을 자동 삽입한다. 그 블록은 `codegraph uninstall`이 되돌릴 수 있어야 하므로 **수동 편집하지 않는다.** 사람이 쓰는 규약은 `AGENTS.md`의 "코드 그래프 우선 규약" 섹션(마커 밖)에만 둔다.

### 텔레메트리

익명 사용 통계 수집이 기본으로 켜져 있다(코드·경로·심볼명·쿼리·IP는 보내지 않는다고 문서화됨). 원치 않으면 끈다.

```bash
codegraph telemetry off
```

`CODEGRAPH_TELEMETRY=0` 또는 `DO_NOT_TRACK=1` 환경변수도 같은 효과다.

### 자주 쓰는 커맨드

| 목적 | 커맨드 |
| --- | --- |
| 기능 구조 한 번에 파악 | `codegraph explore "<query>"` (MCP: `codegraph_explore`) |
| 변경 영향반경 | `codegraph impact <symbol>` |
| 호출부/피호출부 | `codegraph callers <symbol>` / `codegraph callees <symbol>` |
| 변경에 영향받는 테스트 | `git diff --name-only \| codegraph affected --stdin --quiet` |
| 인덱스 상태 | `codegraph status` |

MCP로 기본 노출되는 툴은 `codegraph_explore` **하나뿐**이다(blast-radius 요약·관계 맵이 그 응답에 인라인으로 포함된다). `impact`·`node`·`callers` 등을 MCP 툴로 따로 노출하려면 `CODEGRAPH_MCP_TOOLS=explore,impact,node,callers` 를 설정한다. 아니면 위 CLI를 쓴다.

## 3. 도구 추가 원칙

- 도구는 **조회·검증**용이다. 자율 실행(자율 기획 cron 등)은 `AGENTS.md` 블랙리스트 그대로 금지다.
- 도구 도입 PR은 제품 코드·동작을 건드리지 않는다. 문서·설정 전용으로 낸다.
- 도입/보류 상태가 바뀌면 이 표를 갱신한다. 규약 본문은 `AGENTS.md`, 데이터 엔진 판단은 `docs/DATA_ENGINE_STRATEGY.md`가 정본이다.
