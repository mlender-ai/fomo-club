# Agent Council Work Plan

- Item: 행동 제안을 진입 조건 사다리로 바꿉니다.
- Owner: Trader
- Issue: https://github.com/mlender-ai/auto-trading-bot/issues/37
- Branch: codex/agent-council/trader-entry-condition-ladder
- Generated At: 2026-05-03T10:47:04.509Z
- Status: queued

## Detail
NVDA 같은 대표 티커는 추천 행동을 한 줄 조언으로 끝내지 말고, 진입 조건, 무효화 조건, 추격 금지 규칙 순서로 보여줘 실행 오류를 줄입니다.

## Implementation Focus
행동 제안을 매수/관망/회피 분류보다 조건 기반 의사결정 카드로 재구성합니다.

## Target Files
- packages/shared/src/research.ts
- apps/web/components/research/ResearchWorkspace.tsx
- apps/web/app/globals.css

## Verification
- npm run typecheck
- npm run build:web

## References
- ticker-analyst
- execution-trader

## Acceptance
- [ ] 작업 범위를 제품 변경으로 구체화한다.
- [ ] 구현 또는 측정 지표를 연결한다.
- [ ] 완료 후 에이전트 회의 탭과 snapshot에 반영한다.