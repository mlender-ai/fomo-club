# Taro Agent Bot — Slack 설정 가이드

## 개요

Taro Agent Bot은 Slack에서 자율 파이프라인을 제어하는 봇입니다.
- **Slash Command** (`/taro`) — 파이프라인 제어 (implement, status, merge 등)
- **Mention** (`@Taro Agent Bot`) — GPT-4o 기반 자유 대화 + 커맨드

---

## 1단계 — Slack App 생성

1. https://api.slack.com/apps 접속
2. **Create New App** → **From scratch** 선택
3. App Name: `Taro Agent Bot`
4. Workspace: 사용할 워크스페이스 선택
5. **Create App** 클릭

---

## 2단계 — Bot 권한 설정

1. 좌측 메뉴 **OAuth & Permissions** 클릭
2. **Scopes** → **Bot Token Scopes** 에서 추가:
   - `chat:write` — 메시지 전송
   - `app_mentions:read` — 멘션 감지
   - `commands` — Slash Command
   - `chat:write.customize` — **직군 에이전트별 발화자 이름/아이콘 표시**(CTO/PM/Security).
     없어도 동작하지만(본문 헤더로 누가 답했는지는 항상 표시), 이 스코프가 있어야
     메시지 발신자 이름까지 "CTO Agent" 등으로 바뀐다. 추가 후 **Reinstall App** 필요.

---

## 3단계 — Slash Command 등록

1. 좌측 메뉴 **Slash Commands** 클릭
2. **Create New Command** 클릭
3. 입력:
   - **Command**: `/taro`
   - **Request URL**: `https://{VERCEL_DOMAIN}/api/slack/commands`
   - **Short Description**: `Taro Agent 파이프라인 제어`
   - **Usage Hint**: `[implement|status|council|approve|merge|help] [args]`
4. **Save** 클릭

> `{VERCEL_DOMAIN}`은 Vercel 배포 도메인으로 교체 (예: `taro-stock-app.vercel.app`)

---

## 4단계 — Event Subscriptions

1. 좌측 메뉴 **Event Subscriptions** 클릭
2. **Enable Events** 토글 ON
3. **Request URL** 입력: `https://{VERCEL_DOMAIN}/api/slack/events`
   - Slack이 자동으로 URL verification 요청을 보냄 (코드에서 `url_verification` 처리됨)
   - **Verified** 표시 확인
4. **Subscribe to bot events** 에서 추가:
   - `app_mention`
5. **Save Changes** 클릭

---

## 5단계 — Incoming Webhooks (알림용)

1. 좌측 메뉴 **Incoming Webhooks** 클릭
2. **Activate Incoming Webhooks** 토글 ON
3. 하단 **Add New Webhook to Workspace** 클릭
4. 알림 받을 채널 선택 (예: `#taro-agent`)
5. **Allow** 클릭
6. 생성된 **Webhook URL** 복사 (`https://hooks.slack.com/services/...`)

---

## 6단계 — 환경변수 설정

### Vercel 환경변수

Vercel Dashboard → Settings → Environment Variables 에서 추가:

| 변수 | 값 | 출처 |
|------|-----|------|
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack App → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | | Slack App → Basic Information → Signing Secret |
| `GITHUB_PAT` | `github_pat_...` | GitHub → Settings → Developer Settings → Fine-grained PAT |
| `GITHUB_REPO` | `mlender-ai/taro-stock-app` | |
| `AI_API_URL` | `https://models.github.ai/inference/chat/completions` | GitHub Models |
| `AI_API_KEY` | GitHub Token (models 읽기 권한) | |
| `AI_MODEL` | `openai/gpt-4.1` | 원하는 모델 |

### GitHub Repository Variables

GitHub → Settings → Secrets and variables → Actions → Variables 에서 추가:

| 변수 | 값 | 용도 |
|------|-----|------|
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` | GitHub Actions → Slack 알림 |

### GitHub PAT 필요 권한

Fine-grained Personal Access Token:
- **Repository access**: `mlender-ai/taro-stock-app`
- **Permissions**:
  - Contents: Read and write
  - Issues: Read and write
  - Pull requests: Read and write
  - Actions: Read and write (워크플로우 트리거용)
  - Metadata: Read

---

## 7단계 — 앱 설치 + 채널 초대

1. Slack App 페이지 → **Install App** → **Install to Workspace**
2. 권한 승인 → **Allow**
3. Slack에서 봇을 사용할 채널로 이동
4. `/invite @Taro Agent Bot` 입력하여 봇 초대

---

## 8단계 — 테스트

### Slash Command 테스트

```
/taro help
```
→ 커맨드 목록이 표시되면 성공

```
/taro status
```
→ 오픈 PR, CEO Brief, auto-implement 실행 상태 표시

### Agent Chat 테스트 (멘션)

```
@Taro Agent Bot 현재 파이프라인 상태 알려줘
```
→ GPT-4o가 컨텍스트 기반으로 답변

```
@Taro Agent Bot 다음에 뭐 구현해야 해?
```
→ CEO Brief 기반 추천

### 파이프라인 제어 테스트

```
/taro implement 2026-05-25
```
→ auto-implement 워크플로우 트리거

---

## 커맨드 전체 목록

| 커맨드 | 설명 |
|--------|------|
| `/taro implement {YYYY-MM-DD}` | CEO Brief 기반 자동 구현 트리거 |
| `/taro council` | Daily Agent Council 수동 실행 |
| `/taro status` | 오픈 PR + CEO Brief + 실행 상태 요약 |
| `/taro approve {이슈#}` | 이슈에 `implement-approved` 라벨 추가 |
| `/taro merge {PR#}` | PR squash 머지 |
| `/taro help` | 도움말 |

멘션 (`@Taro Agent Bot {질문}`) 은 자유 대화로 처리됩니다.

---

## 아키텍처

```
Slack User
  ├── /taro {command}  →  POST /api/slack/commands  →  dispatchCommand()
  ├── @bot {command}   →  POST /api/slack/events    →  dispatchCommand()
  └── @bot {질문}      →  POST /api/slack/events    →  handleAgentChat() → GPT-4o

GitHub Actions
  ├── auto-implement → CI → auto-merge (dispatch chain)
  ├── slack-notify → Webhook → Slack 채널
  └── autonomy-report → 주간 리포트 → Slack 채널
```

---

## 트러블슈팅

### `/taro` 커맨드가 응답 없음
- Vercel 배포 확인 (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` 설정 여부)
- Request URL이 정확한지 확인: `https://{도메인}/api/slack/commands`

### `@bot` 멘션이 응답 없음
- Event Subscriptions → Request URL verified 상태 확인
- `app_mention` 이벤트 구독 확인
- 봇이 채널에 초대되었는지 확인

### Agent Chat이 에러 반환
- `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` 환경변수 확인
- GitHub Models API 접근 가능 여부 확인

### GitHub Actions 알림이 안 옴
- GitHub repo Variables에 `SLACK_WEBHOOK_URL` 설정 확인
- Webhook URL이 유효한지 확인 (Slack App → Incoming Webhooks)
