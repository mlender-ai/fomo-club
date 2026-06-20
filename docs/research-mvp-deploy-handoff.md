# Research MVP Deploy Handoff

이 문서는 현재 제품 상태를 기준으로, 배포를 위해 사용자에게 어떤 정보가 필요한지 빠르게 정리한 체크리스트입니다.

현재 홈 화면 MVP는 다음 구조입니다.

- 웹 UI: `apps/web`
- 데이터 생성: GitHub Actions + `generated/research/latest.json`
- 뉴스/티커 분석 로직: `packages/shared`
- 메일 뉴스레터: GitHub Actions + `scripts/research-newsletter.ts`

핵심 포인트:

- 지금 리서치 MVP만 배포할 경우, `Vercel + GitHub Actions`만으로 먼저 운영 가능합니다.
- `Railway`는 현재 paper-trading API나 별도 worker를 계속 살릴 때 필요합니다.
- 따라서 MVP 첫 배포는 `Vercel 우선`, `Railway 선택`이 가장 단순합니다.

## 1. 지금 실제 데이터가 들어오는지

현재 실제 데이터는 일부 맞습니다.

- 뉴스 소스: Yahoo Finance RSS
- 티커 가격 데이터: Yahoo Finance Chart API
- 기사 이미지: 원문 페이지의 `og:image` 또는 `twitter:image` 추출
- 파이프라인 산출물: GitHub Actions가 `generated/research/latest.json`과 `latest.md`로 저장

주의할 점:

- 네트워크 요청 실패 시에는 curated fallback 데이터로 내려갑니다.
- 즉 "항상 100% 실데이터만"은 아니고, `실데이터 우선 + 실패 시 fallback` 구조입니다.
- 현재 프론트는 published snapshot을 우선 읽기 때문에, GitHub Actions가 정상 실행되면 최신 실제 데이터가 반영됩니다.

## 2. 배포 옵션

### 옵션 A. MVP 최소 배포

구성:

- Vercel: 웹 앱 배포
- GitHub Actions: 뉴스/시황/회의/뉴스레터 snapshot 생성

이 옵션이면 가능한 것:

- 뉴스 탭
- 티커 분석 탭
- 에이전트 회의 탭
- GitHub Actions 기반 snapshot 갱신
- 이메일 뉴스레터 발송

이 옵션이면 아직 없는 것:

- 별도 Railway API 기반 paper-trading 백엔드 운영
- 별도 worker 프로세스 운영

권장:

- 지금은 이 옵션으로 먼저 올리는 게 맞습니다.

### 옵션 B. 전체 스택 배포

구성:

- Vercel: 웹
- Railway: API
- Railway: worker
- GitHub Actions: 연구 파이프라인 + 뉴스레터

권장 시점:

- paper-trading 기능까지 같이 운영할 때
- 백엔드 상태 API와 worker heartbeat를 운영 환경에서 계속 유지할 때

## 3. 내가 먼저 받아야 하는 정보

### A. Vercel만 먼저 올릴 경우

아래 정보만 주시면 됩니다.

1. Vercel 프로젝트 연결 여부
- 이 GitHub repo `mlender-ai/fomo-club`를 이미 Vercel에 import 했는지
- 아직 안 했으면 "아직 안 함"이라고만 말해주시면 됩니다

2. 배포 도메인
- Vercel 기본 도메인을 쓸지
- 커스텀 도메인을 붙일지
- 붙일 경우 실제 도메인 이름

3. 웹 로그인 비밀번호
- `DASHBOARD_PASSWORD`로 쓸 값

4. 공개 snapshot URL 유지 여부
- 기본값 그대로 사용해도 되는지
- 기본값: `https://raw.githubusercontent.com/mlender-ai/fomo-club/main/generated/research/latest.json`

5. 뉴스레터 발송 설정
- 받을 이메일: 이미 `NEWSLETTER_TO=choihenry0010@gmail.com`
- 보낼 이메일 주소: `NEWSLETTER_FROM`
- Resend API Key 보유 여부: `RESEND_API_KEY`

### B. Railway까지 같이 올릴 경우

아래 정보가 추가로 필요합니다.

1. Railway 프로젝트 생성 여부
- API 서비스 만들었는지
- Worker 서비스 만들었는지

2. Railway 공개 URL
- 예: `https://your-api.up.railway.app`

3. API 보호 비밀번호
- `BOT_PASSWORD`

4. 프론트 허용 origin
- 예: `https://your-app.vercel.app`

5. DB 사용 여부
- paper-trading/API 기능도 같이 쓸 거면 `DATABASE_URL`

## 4. Vercel에 넣을 환경 변수

### 현재 리서치 MVP만 띄울 최소값

- `DASHBOARD_PASSWORD`
- `LOCAL_DEMO_MODE=false`
- `RESEARCH_PUBLISHED_SNAPSHOT_URL`

선택값:

- `NEXT_PUBLIC_API_BASE_URL`
- `API_PASSWORD`

주의:

- 현재 `/` 리서치 홈은 별도 Railway API 없이도 동작합니다.
- 따라서 리서치 MVP만 먼저 띄울 때는 `NEXT_PUBLIC_API_BASE_URL`이 필수는 아닙니다.
- 다만 기존 dashboard/paper-trading 기능까지 살릴 거면 필요합니다.

### Vercel에 넣으면 좋은 값

- `DASHBOARD_PASSWORD=<원하는 비밀번호>`
- `LOCAL_DEMO_MODE=false`
- `RESEARCH_PUBLISHED_SNAPSHOT_URL=https://raw.githubusercontent.com/mlender-ai/fomo-club/main/generated/research/latest.json`

## 5. GitHub Actions에 넣을 값

### 이미 있거나 기본값으로 가능한 것

- `AI_API_URL`
  기본값: `https://models.github.ai/inference/chat/completions`
- `AI_API_KEY`
  비워두거나 `USE_GITHUB_TOKEN`이면 GitHub Models fallback 사용
- `AI_MODEL`
  기본값: `openai/gpt-4.1`
- `AI_TEMPERATURE`
  기본값: `0.2`

### 뉴스레터 실제 발송에 필요한 값

- `NEWSLETTER_TO`
- `NEWSLETTER_FROM`
- `RESEND_API_KEY`

현재 상태:

- `NEWSLETTER_TO`는 받을 주소만 있으면 됨
- `NEWSLETTER_FROM`은 Resend에서 인증된 sender여야 함
- `RESEND_API_KEY`가 없으면 preview만 생성되고 실제 메일은 발송되지 않음

## 6. Railway에 넣을 값

이건 현재 리서치 MVP 배포에는 필수 아님입니다.

paper-trading/API까지 살릴 때만 필요:

- `DATABASE_URL`
- `BOT_PASSWORD`
- `CONFIG_ENCRYPTION_SECRET`
- `FRONTEND_ORIGIN`
- `PORT=4000`

## 7. 지금 기준 추천 배포 순서

1. Vercel에 `apps/web`만 먼저 배포
2. GitHub Actions로 snapshot 자동 갱신 유지
3. Resend 연결해서 뉴스레터 실제 발송
4. 그 다음 Railway API/worker 필요 여부 판단

## 8. 다음 답장에서 사용자에게서 바로 받으면 되는 정보

아래 형식으로 주시면 됩니다.

```text
[Vercel]
- repo import 여부:
- 배포 도메인:
- DASHBOARD_PASSWORD:

[Newsletter]
- NEWSLETTER_FROM:
- RESEND_API_KEY 보유 여부:

[Railway]
- 지금 같이 할지 여부: yes / no
- Railway API URL:
- BOT_PASSWORD:
- DATABASE_URL 준비 여부:
```

## 9. 내가 다음 단계에서 바로 해줄 수 있는 것

사용자가 위 정보를 주면 바로 이어서:

- Vercel 최소 배포 기준 env 표 확정
- GitHub secret/variable 세팅 체크리스트 정리
- 실제 메일 뉴스레터 발송 경로 활성화
- 필요하면 Railway까지 확장 배포용 값 매핑
