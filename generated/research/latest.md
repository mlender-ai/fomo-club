# Research Pipeline

- Contract Version: 2026-04-21.1
- Generated At: 2026-05-01T22:42:42.785Z
- Provider: rule-based
- Model: openai/gpt-4.1
- Source: github-actions
- Status: fallback
- Sectors: 반도체, 에너지(오일)
- Tickers: NVDA, AMD, 005930.KS, 010950.KS, XOM

## Main Headline
- Nvidia, Google, Microsoft Win Major Pentagon AI Contracts
- Why it matters: 반도체는 수급보다 리드타임과 고객 믹스에 더 민감해져 있어, 기사 한 건이 업황 기대의 방향을 빠르게 바꿀 수 있습니다.
- Action: NVDA 중심으로만 노출을 유지하고, 제목만 강한 후행 설계주 추격은 피하는 편이 좋습니다.

## Agent Transcript
### 01 News Editor -> Macro Analyst
메인 헤드라인을 "Nvidia, Google, Microsoft Win Major Pentagon AI Contracts"로 고정하고 파생 뉴스 3개를 연결했습니다. 이 출력은 시황 해석 에이전트의 입력으로 넘어갑니다.
References: live-semiconductors-nvidia-google-microsoft-win-major-pentagon-ai-contracts, live-semiconductors-riot-platform-stock-spikes-after-data-center-debut-amd-doubles-capacity, live-semiconductors-broadcom-shares-trade-near-52-week-high-can-the-rally-continue, live-semiconductors-riot-jumps-10-as-amd-signs-additional-25-mw-ai-deployment-q1-earnings

### 02 Macro Analyst -> Ticker Analyst
지금 시장은 반도체 리더십과 방어형 에너지로 자금이 압축되는 국면입니다. 이 해석은 티커 딥분석과 행동 제안 에이전트의 공통 컨텍스트가 됩니다.
References: live-semiconductors-nvidia-google-microsoft-win-major-pentagon-ai-contracts, live-semiconductors-riot-platform-stock-spikes-after-data-center-debut-amd-doubles-capacity, live-energy-oil-chevron-exxon-show-earnings-resilience-but-stocks-fail-key-test

### 03 Ticker Analyst -> Execution Trader
NVDA를 대표 분석 티커로 선택해 추세, 패턴, 섹터 연결을 해석했습니다. 이 출력은 행동 제안 에이전트가 진입/관망/회피 조건을 만드는 기준이 됩니다.
References: NVDA, live-semiconductors-nvidia-google-microsoft-win-major-pentagon-ai-contracts, live-semiconductors-riot-platform-stock-spikes-after-data-center-debut-amd-doubles-capacity, live-semiconductors-broadcom-shares-trade-near-52-week-high-can-the-rally-continue

### 04 Execution Trader -> Operator
NVDA 중심의 조정 매수만 허용하고, 010950.KS로 방어 노출을 병행하는 전략이 우세합니다. 이 출력은 사용자에게 보이는 최종 실행 제안이자 제품 팀 리뷰의 평가 대상입니다.
References: NVDA, live-semiconductors-riot-platform-stock-spikes-after-data-center-debut-amd-doubles-capacity, live-semiconductors-broadcom-shares-trade-near-52-week-high-can-the-rally-continue, live-semiconductors-riot-jumps-10-as-amd-signs-additional-25-mw-ai-deployment-q1-earnings

## Trader Plan
- Strategy: NVDA 중심의 조정 매수만 허용하고, 010950.KS로 방어 노출을 병행하는 전략이 우세합니다.
- Do: NVDA는 추격 대신 조정 구간에서만 분할 진입합니다.
- Do: AMD는 이벤트 전 기대가 과열되면 비중을 늘리지 않고, 가이던스 확인 뒤 확장합니다.
- Do: 010950.KS 같은 방어형 에너지로 포지션 균형을 맞춥니다.
- Avoid: 서비스주나 후행 확산주를 뉴스 헤드라인만 보고 추격 매수하지 않습니다.
- Avoid: 행동 조건 없이 모든 관심 티커를 동시에 매수하는 분산 진입은 피합니다.
- Risk: 리드타임 둔화나 고객 믹스 악화 코멘트가 나오면 반도체 강세 논리가 빠르게 약해질 수 있습니다.
- Risk: 메이저 오일의 capex 보수화는 에너지 내 강세 확산을 막고 서비스주를 먼저 흔들 수 있습니다.

## Behavior Funnel
- 헤드라인 열람: 0회
- 다음 단계 이동: 0회
- 티커 선택: 0회
- 행동 제안 확장: 0회

## Product Action Items
- 행동 제안을 진입 조건 사다리로 바꿉니다.
  Owner: Trader
  Detail: NVDA 같은 대표 티커는 추천 행동을 한 줄 조언으로 끝내지 말고, 진입 조건, 무효화 조건, 추격 금지 규칙 순서로 보여줘 실행 오류를 줄입니다.
  Implementation Status: ready
  Focus: 행동 제안을 매수/관망/회피 분류보다 조건 기반 의사결정 카드로 재구성합니다.
  Scope: packages/shared/src/research.ts, apps/web/components/research/ResearchWorkspace.tsx, apps/web/app/globals.css
  Verify: npm run typecheck | npm run build:web
  Issue: https://github.com/mlender-ai/auto-trading-bot/issues/37
  Branch: codex/agent-council/trader-entry-condition-ladder
  PR: https://github.com/mlender-ai/auto-trading-bot/pull/16
  Plan: .github/agent-council/trader-entry-condition-ladder.md
  Changed Files: none yet

- 실데이터 fetch와 fallback 상태를 운영 패널에 드러냅니다.
  Owner: CTO
  Detail: 뉴스 RSS, 차트 API, 기사 이미지 추출이 실패해 fallback으로 내려간 경우를 회의 탭과 markdown summary에서 바로 알 수 있게 만듭니다.
  Implementation Status: ready
  Focus: 실데이터 성공률과 fallback 사용 여부를 구조화된 운영 신호로 표면화합니다.
  Scope: packages/shared/src/researchLive.ts, packages/shared/src/researchPipeline.ts, apps/web/components/research/ResearchWorkspace.tsx
  Verify: npm run typecheck | npm run research:generate | npm run build:web
  Issue: https://github.com/mlender-ai/auto-trading-bot/issues/38
  Branch: codex/agent-council/cto-live-data-health-check
  PR: https://github.com/mlender-ai/auto-trading-bot/pull/18
  Plan: .github/agent-council/cto-live-data-health-check.md
  Changed Files: none yet

- 웹과 뉴스레터의 섹션 구조 차이를 자동 점검합니다.
  Owner: PM
  Detail: 웹에서는 보이는데 뉴스레터에는 빠지는 요소, 뉴스레터에는 있는데 웹에는 없는 요소를 자동 점검해 동일 데이터 기반 경험을 유지합니다.
  Implementation Status: ready
  Focus: 뉴스, 시황, 행동, 섹터 이슈의 섹션 parity를 검증 가능한 규칙으로 정의합니다.
  Scope: packages/shared/src/research.ts, scripts/research-newsletter.ts, apps/web/lib/researchPipelineStore.ts
  Verify: npm run typecheck | npm run research:newsletter
  Issue: https://github.com/mlender-ai/auto-trading-bot/issues/39
  Branch: codex/agent-council/pm-newsletter-web-parity
  PR: https://github.com/mlender-ai/auto-trading-bot/pull/20
  Plan: .github/agent-council/pm-newsletter-web-parity.md
  Changed Files: none yet

- fallback 데이터 사용 시 사용자에게 명확히 표시합니다.
  Owner: QA
  Detail: 실제 뉴스나 가격 데이터를 가져오지 못해 fallback snapshot을 쓴 경우, 웹과 뉴스레터에 분명한 상태 표시를 넣어 신뢰 저하를 막습니다.
  Implementation Status: ready
  Focus: 실패를 숨기지 않고 사용자와 운영자가 즉시 구분할 수 있는 disclosure 패턴을 도입합니다.
  Scope: packages/shared/src/researchPipeline.ts, apps/web/components/research/ResearchWorkspace.tsx, scripts/research-newsletter.ts
  Verify: npm run typecheck | npm run build:web
  Issue: https://github.com/mlender-ai/auto-trading-bot/issues/40
  Branch: codex/agent-council/qa-fallback-visibility
  PR: https://github.com/mlender-ai/auto-trading-bot/pull/22
  Plan: .github/agent-council/qa-fallback-visibility.md
  Changed Files: none yet

- 에이전트 아이디어가 실제 구현으로 이어지는 비율을 측정합니다.
  Owner: DA
  Detail: 회의에서 나온 아이디어가 issue 생성, PR 생성, merge 완료로 얼마나 이어지는지 추적해 council의 아이디어 품질을 평가합니다.
  Implementation Status: ready
  Focus: 아이디어 생산량보다 실제 실행 전환율을 기준으로 council의 품질을 평가하는 지표를 만듭니다.
  Scope: scripts/research-agent-issues.ts, .github/workflows/research-pipeline.yml, packages/shared/src/research.ts
  Verify: npm run typecheck | npm run research:issues
  Issue: https://github.com/mlender-ai/auto-trading-bot/issues/41
  Branch: codex/agent-council/da-idea-yield-score
  PR: https://github.com/mlender-ai/auto-trading-bot/pull/24
  Plan: .github/agent-council/da-idea-yield-score.md
  Changed Files: none yet
