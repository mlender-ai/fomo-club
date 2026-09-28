# RUNBOOK — 24시간 가동

지시서: `docs/wo/OPS-01-24h.md` · 기준 2026-09-29.

**지금(09-29 01:00 KST):** FCE `~/fce` · launchd 감시 루프 · launchd 러너 하나 · 사이드카 없음 · 전원 연결 · 절전 끔. **재부팅 시험만 남았다**(개발 중이라 미룸).
**완료는 가동으로 판정한다** — 재부팅 뒤에도 알아서 살아나야 완료다.

## 한눈에

```bash
scripts/ops/check-24h.sh
```

읽기만 한다. 절전 · FCE 위치 · FCE 감시 루프 · 8875/8876 · 러너 · 겹친 러너 · 사이트 동기화 점을 ✅/❌ 로 보여 주고,
❌ 옆에 할 일을 적는다.

## 무엇이 돌고 있어야 하나

| 무엇 | launchd 라벨 | 띄우는 것 | 로그 |
|---|---|---|---|
| FCE 감시 루프 → 백엔드 8875 · 화면 8876 | `com.fomo.fce.supervisor` | `~/fce/scripts/local/supervisor.sh` (FCE 것) | `~/fce/logs/supervisor.log` · `backend.log` · `frontend.log` |
| LAB 러너 → 정규 도메인 업로드 | `com.fomo.lab.runner` | `scripts/lab/runner.ts` | `/tmp/lab-runner.log` |

둘 다 `RunAtLoad`(로그인하면 뜬다) · `KeepAlive`(죽으면 30초 뒤 다시 뜬다).
러너 로그 줄은 `[시각 p프로세스번호]` — 러너가 둘이면 번호가 둘 보인다(한 개여야 한다).

## 처음 한 번 (OPS-01)

| # | 누가 | 무엇 | 명령 |
|---|---|---|---|
| 1 | 🧑 | 전원 연결 시 절전 끔 · 어댑터 · 뚜껑 열어 둠 · macOS 자동 업데이트 설치 끔 | `sudo pmset -c sleep 0 disksleep 0 powernap 0` · `sudo pmset -c displaysleep 10` |
| 2 | 🧑 | FCE 를 `~/fce` 로 옮기고 launchd 로 올림 | `scripts/ops/fce-relocate.sh` |
| 3 | 🧑 | 러너 launchd (진짜 토큰 — Vercel → 백엔드 프로젝트 → Settings → Environment Variables → `LAB_INGEST_TOKEN`) | `LAB_INGEST_TOKEN='복사한_값' scripts/lab/launchd/install.sh` |
| 4 | 🤖 | 새 러너 `fce ✅` 두 번 연속 확인 → 옛 세션 러너 · 사이드카 종료 | — |
| 5 | 🧑 | 재시동 → 로그인만 → 10분 → `scripts/ops/check-24h.sh` | — |

### FCE 를 왜 옮기나 (A 결정 · 2026-09-29)

`~/Documents` 는 macOS 보호 폴더(TCC)라 launchd 로 뜬 프로세스는 못 읽는다(`Operation not permitted`).
FCE 자신도 그래서 launchd 대신 nohup 감시 루프를 썼다(`supervisor.sh` 머리 주석) — 재부팅하면 죽었다.

- **B(node · python 에 전체 디스크 접근)를 안 고른 이유** — 권한이 넓고 OS 업데이트 때 풀린다
- **옮겨도 되는 근거** — FCE 는 경로를 전부 상대로 쓴다. 절대 경로(`/Users/cocteau/Documents/…`)를 찾으면
  코드 · 설정에는 없고 `.claude/` 권한 문자열 · worktree 포인터(`git worktree repair` 로 고친다) · `dashboard/.next` 빌드 산출물뿐.
  `run-frontend.sh` 의 절대 경로는 nvm node 자리라 무관
- **FCE 코드는 한 줄도 안 고쳤다.** LAB 쪽은 `scripts/lab/fce-home.ts` 가 `FCE_HOME` → `~/fce` → 옛 자리 순서로 찾는다 —
  옮긴 뒤 러너를 다시 올릴 필요가 없다

`fce-relocate.sh` 는 FCE 자신의 `stop-supervisor.sh` 로 멈추고 → `mv`(같은 디스크라 DB 5GB 도 즉시) →
worktree 경로 → launchd 등록 → 8875 `/health` 를 90초 기다린다. 하나라도 실패하면 거기서 멈춘다.
8876 이 안 뜨면 `cd ~/fce/dashboard && npm run build`.

## 멈췄을 때

```bash
scripts/ops/check-24h.sh                                   # 무엇이 멈췄나
launchctl list | grep -iE 'fce|lab'                        # 살아 있나 (가운데 숫자가 0 이 아니면 마지막 종료 코드)
tail -50 /tmp/lab-runner.log                               # 러너
tail -50 ~/fce/logs/supervisor.log ~/fce/logs/backend.log  # FCE
launchctl kickstart -k gui/$(id -u)/com.fomo.lab.runner       # 러너 다시 올리기 (토큰은 plist 에 이미 있다)
launchctl kickstart -k gui/$(id -u)/com.fomo.fce.supervisor   # FCE 다시 올리기 (백엔드 · 화면 같이)
pmset -g custom                                            # 절전 설정 풀렸나 (AC Power 의 sleep · disksleep 0)
```

| 증상 | 원인 · 할 일 |
|---|---|
| 헤더 점이 주황 · 빨강 | 러너가 20분 넘게 못 올렸다 → 러너 로그의 ❌ 줄 |
| `fce ❌ … timeout (수천 초)` | 맥이 잤다(시각이 건너뛴다) → 절전 · 전원 |
| `fce ❌ … Operation not permitted` | FCE 가 아직 `~/Documents` → `fce-relocate.sh` |
| `LAB 업로드 401` | 토큰이 틀렸다 → `install.sh` 를 진짜 토큰으로 다시 |
| `ByteString … 8230` | 토큰 자리에 `…` 이 들어갔다(09-27) → 같음 |
| 러너 번호가 둘 | launchd 밖 러너가 또 떴다 → `check-24h.sh` 가 번호를 준다 · 그것만 끈다 |
| FCE 운영 값 바꾸기 | `scripts/ops/launchd/fce.env` 에 `KEY=VALUE` → `install-fce.sh` (launchd 환경변수 · FCE `.env` 보다 우선 · 비밀 금지) |
| 주식 시세가 안 들어온다 · `authentication_failed` | `curl -s localhost:8875/api/system/toss/auth-diagnosis` — `403 IP address not allowed` 면 토스 OpenAPI 허용 IP 에 지금 공인 IP 추가 |
| FCE 를 잠깐 멈춰야 할 때 | `launchctl bootout gui/$(id -u)/com.fomo.fce.supervisor` (다시: `install-fce.sh`). **`stop-supervisor.sh` 만 쓰면 launchd 가 30초 뒤 다시 띄운다** |

## 하지 말 것

- 토큰 · 키를 에이전트에게 주지 않는다 · 명령에 자리표시를 남기지 않는다
- FCE 코드를 고치지 않는다 (경로 설정은 예외)
- 새 러너 `fce ✅` 확인 전에 옛 러너를 끄지 않는다
- 폴리마켓을 VPN · 해외 서버로 우회하지 않는다
