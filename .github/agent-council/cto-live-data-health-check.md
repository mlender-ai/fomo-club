# Agent Council Work Plan

- Item: 실데이터 fetch와 fallback 상태를 운영 패널에 드러냅니다.
- Owner: CTO
- Issue: https://github.com/mlender-ai/taro-stock-app/issues/38
- Branch: codex/agent-council/cto-live-data-health-check
- Generated At: 2026-05-16T09:23:48.822Z
- Status: queued

## Detail
뉴스 RSS, 차트 API, 기사 이미지 추출이 실패해 fallback으로 내려간 경우를 회의 탭과 markdown summary에서 바로 알 수 있게 만듭니다.

## Implementation Focus
실데이터 성공률과 fallback 사용 여부를 구조화된 운영 신호로 표면화합니다.

## Target Files
- packages/shared/src/researchLive.ts
- packages/shared/src/researchPipeline.ts
- apps/web/components/research/ResearchWorkspace.tsx

## Verification
- npm run typecheck
- npm run research:generate
- npm run build:web

## References
- news-editor
- ticker-analyst
- meeting

## Acceptance
- [ ] 작업 범위를 제품 변경으로 구체화한다.
- [ ] 구현 또는 측정 지표를 연결한다.
- [ ] 완료 후 에이전트 회의 탭과 snapshot에 반영한다.