# Agent Council Work Plan

- Item: 웹과 뉴스레터의 섹션 구조 차이를 자동 점검합니다.
- Owner: PM
- Issue: https://github.com/mlender-ai/taro-stock-app/issues/39
- Branch: codex/agent-council/pm-newsletter-web-parity
- Generated At: 2026-05-16T07:53:09.837Z
- Status: queued

## Detail
웹에서는 보이는데 뉴스레터에는 빠지는 요소, 뉴스레터에는 있는데 웹에는 없는 요소를 자동 점검해 동일 데이터 기반 경험을 유지합니다.

## Implementation Focus
뉴스, 시황, 행동, 섹터 이슈의 섹션 parity를 검증 가능한 규칙으로 정의합니다.

## Target Files
- packages/shared/src/research.ts
- scripts/research-newsletter.ts
- apps/web/lib/researchPipelineStore.ts

## Verification
- npm run typecheck
- npm run research:newsletter

## References
- news-editor
- meeting

## Acceptance
- [ ] 작업 범위를 제품 변경으로 구체화한다.
- [ ] 구현 또는 측정 지표를 연결한다.
- [ ] 완료 후 에이전트 회의 탭과 snapshot에 반영한다.