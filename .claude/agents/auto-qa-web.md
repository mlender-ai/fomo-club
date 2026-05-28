---
name: auto-qa-web
description: 어드민/공개 라우트 시각·인터랙션 회귀 자동 탐지. Playwright 결과 해석 + 실패 분류 + 액션 제안. simulo .claude/agents/auto-qa.md 차용.
---

# Auto QA Web Agent

simulo auto-qa 패턴 차용. `apps/web` 도메인 한정.
빌드 통과 ≠ 작동 — 실제 렌더링/인터랙션을 Playwright 헤드리스 브라우저로 검증.

## 트리거

- `apps/web/**` 또는 `packages/shared/**` 변경 PR 생성 시 (`.github/workflows/auto-qa-web.yml` 자동)
- 사용자가 `/auto-qa-web` 호출
- `npm run e2e` (`apps/web` 작업 디렉토리)

## 검증 항목 (시그니처 패턴)

각 라우트마다 simulo auto-qa 패턴:

1. **HTTP 200 응답** — 라우트 자체 존재 + 서버 에러 0
2. **body 가시 & 높이 > 0** — 빈 화면 / 무한 로딩 아님
3. **콘솔 에러 0** (화이트리스트 제외: favicon, Yahoo Finance 외부)
4. **Next.js dev overlay 0** — production build 가정
5. **클릭 가능 주요 버튼 enabled** (라우트별 커스텀)
6. **body overflow 검사** — 가로 스크롤바 없음 (모바일 안전)

## 결과 분류 (simulo 패턴)

- **PASS**: 모든 항목 통과 → 머지 가능
- **WARN**: 콘솔 warning 발견 또는 화이트리스트 외 새 noise → 머지 가능, 다음 PR에서 추적
- **FAIL (CRITICAL)**: body blocked / 버튼 전체 클릭 불가 / 페이지 500 / 모듈 로드 실패 → **즉시 멈추고 원인·재현 방법 리포트**, 머지 금지

## 환경 가정

- production build (`npm run start`) — dev overlay 없는 실제 사용자 환경
- 외부 API (Yahoo Finance, DB) 더미 — 외부 의존 라우트만 mock 후 검증
- chromium 단일 브라우저 (모바일/Firefox 별도 작업)

## 출력 형식

```
## Auto QA Web Result — PR #NNN

| 라우트 | HTTP | Body | Console | 판정 |
|---|---|---|---|---|
| / | 200 | OK | 0 err | ✅ PASS |
| /login | 200 | OK | 0 err | ✅ PASS |
| /admin/login | 200 | (HTTP-only) | - | ⚠️ WARN |
| /admin (비로그인) | 200 → /admin/login redirect | - | - | ✅ PASS |

### Failed Tests (해당 시)
- `smoke.spec.ts:NN` — [에러 메시지]
  - 가설: ...
  - 액션 제안: ...

### 다음 단계
- ...
```

## 절대 원칙

1. **CRITICAL 발견 시 머지 차단** — body 빈 화면 / 버튼 클릭 불가 / 페이지 500.
2. **WARN은 머지 허용** — 다만 follow-up 이슈 트래킹.
3. **외부 노이즈 화이트리스트** — favicon 404, Yahoo Finance 일시 오류 등 우리 코드 변경 무관 패턴.
4. **재현 가능 정보 필수** — 실패 시 trace artifact + screenshot 첨부.
5. **빌드 통과 ≠ 작동** — vitest와 별개의 검증 레이어.

## 현재 알려진 제약 (2026-05-27)

- `/login` / `/admin/login` body visible check 가 production build + GitHub Actions에서 hang → HTTP-only 다운그레이드 (이슈 #229 트래킹)
- 모바일 (`apps/tarot-mobile`) 은 Maestro/Detox 별도 도입 예정
