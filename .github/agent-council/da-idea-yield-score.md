# Agent Council Work Plan

- Item: 에이전트 아이디어가 실제 구현으로 이어지는 비율을 측정합니다.
- Owner: DA
- Issue: https://github.com/mlender-ai/auto-trading-bot/issues/41
- Branch: codex/agent-council/da-idea-yield-score
- Generated At: 2026-04-29T23:28:01.031Z
- Status: queued

## Detail
회의에서 나온 아이디어가 issue 생성, PR 생성, merge 완료로 얼마나 이어지는지 추적해 council의 아이디어 품질을 평가합니다.

## Implementation Focus
아이디어 생산량보다 실제 실행 전환율을 기준으로 council의 품질을 평가하는 지표를 만듭니다.

## Target Files
- scripts/research-agent-issues.ts
- .github/workflows/research-pipeline.yml
- packages/shared/src/research.ts

## Verification
- npm run typecheck
- npm run research:issues

## References
- meeting
- execution-trader
- macro-analyst

## Acceptance
- [ ] 작업 범위를 제품 변경으로 구체화한다.
- [ ] 구현 또는 측정 지표를 연결한다.
- [ ] 완료 후 에이전트 회의 탭과 snapshot에 반영한다.