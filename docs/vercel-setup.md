# Vercel Git 연동 설정 (1회성)

`apps/web`(Next.js API + 어드민)을 Vercel에 1회 import 하면, 이후 `main` push마다 Vercel이 자동으로 빌드/배포합니다.

GitHub Actions 배포 워크플로우는 **불필요** — 제거됨.

---

## 1단계 — 프로젝트 Import

1. https://vercel.com/new 접속 (또는 https://vercel.com/dashboard → **Add New** → **Project**)
2. **Import Git Repository** 섹션에서 `mlender-ai/taro-stock-app` 옆 **Import** 클릭
   - 처음이면 **Install Vercel GitHub App** → 레포 선택 → **Install**

## 2단계 — 프로젝트 설정

import 화면에서 아래대로 입력:

| 항목 | 값 |
|------|-----|
| **Project Name** | `taro-stock-web` (또는 원하는 이름) |
| **Framework Preset** | `Next.js` (자동 감지됨) |
| **Root Directory** | `apps/web` ← **반드시 클릭해서 선택** |
| **Build and Output Settings** | 그대로 둠 (apps/web/vercel.json 이 읽힘) |
| **Environment Variables** | 3단계 참조 |

> **Root Directory 옆 Edit 클릭 → apps → web 선택 → Continue**

## 3단계 — 환경변수 입력

**Environment Variables** 섹션에서 **Key + Value** 입력 → **Add** 반복:

| Key | Value 출처 |
|-----|-----------|
| `SLACK_BOT_TOKEN` | Slack App → OAuth & Permissions → Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack App → Basic Information → Signing Secret |
| `GITHUB_PAT` | 본인 GitHub Fine-grained PAT |
| `GITHUB_REPO` | `mlender-ai/taro-stock-app` |
| `AI_API_URL` | `https://models.github.ai/inference/chat/completions` |
| `AI_API_KEY` | GitHub PAT (Models 읽기 권한) |
| `AI_MODEL` | `openai/gpt-4.1` |
| `JWT_SECRET` | 아무 랜덤 문자열 |
| `DATABASE_URL` | 사용 시 (현재는 임시 빈 값 OK) |

## 4단계 — Deploy

**Deploy** 버튼 클릭. 첫 빌드 2~4분 소요.

완료되면 도메인 표시: `https://taro-stock-web.vercel.app`

---

## 5단계 — Slack App URL 등록

Slack App 매니페스트는 `docs/slack-app-manifest.yml` 사용:

1. https://api.slack.com/apps → 만든 앱 클릭
2. 좌측 **App Manifest** → 매니페스트 붙여넣고 `{DOMAIN}` → `taro-stock-web.vercel.app` 치환
3. **Save Changes** → Slack이 URL 검증
4. **Install App** → **Reinstall to Workspace** → **Allow**

또는 수동:
- **Slash Commands** → `/taro` Request URL: `https://taro-stock-web.vercel.app/api/slack/commands`
- **Event Subscriptions** → Request URL: `https://taro-stock-web.vercel.app/api/slack/events`
- **OAuth & Permissions** → Scopes: `chat:write`, `app_mentions:read`, `commands`

---

## 트러블슈팅

**빌드 실패 — `Cannot find module '@fomo/shared'`**
→ Root Directory가 `apps/web`인지 재확인. `vercel.json`의 `installCommand`(`cd ../.. && npm ci`)가 모노레포 루트에서 설치하도록 처리.

**빌드 실패 — `Next.js detected but no .next directory`**
→ `next.config.mjs`에서 `distDir: ".next-build"` 사용 중. `vercel.json`의 `outputDirectory: ".next-build"`가 이를 반영. 만약 다른 값이면 자동 감지 실패.

**Slack `/taro help` 응답 없음**
→ Vercel Dashboard → 프로젝트 → **Logs** 탭에서 `/api/slack/commands` 호출 로그 확인. `Invalid signature` 면 `SLACK_SIGNING_SECRET` 재확인.

**Slack `@bot` 멘션 응답 없음**
→ Event Subscriptions의 Request URL이 **Verified** 상태인지 확인. 아니면 도메인 오타.
