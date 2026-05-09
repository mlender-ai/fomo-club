# Agent Council Work Plan

- Item: fallback 데이터 사용 시 사용자에게 명확히 표시합니다.
- Owner: QA
- Issue: https://github.com/mlender-ai/auto-trading-bot/issues/40
- Branch: codex/agent-council/qa-fallback-visibility
- Generated At: 2026-05-09T15:43:50.776Z
- Status: ready

## Detail
실제 뉴스나 가격 데이터를 가져오지 못해 fallback snapshot을 쓴 경우, 웹과 뉴스레터에 분명한 상태 표시를 넣어 신뢰 저하를 막습니다.

## Implementation Focus
실패를 숨기지 않고 사용자와 운영자가 즉시 구분할 수 있는 disclosure 패턴을 도입합니다.

## Target Files
- packages/shared/src/researchPipeline.ts
- apps/web/components/research/ResearchWorkspace.tsx
- scripts/research-newsletter.ts

## Verification
- npm run typecheck
- npm run build:web

## References
- meeting
- news-editor
- ticker-analyst

## Acceptance
- [ ] 작업 범위를 제품 변경으로 구체화한다.
- [ ] 구현 또는 측정 지표를 연결한다.
- [ ] 완료 후 에이전트 회의 탭과 snapshot에 반영한다.