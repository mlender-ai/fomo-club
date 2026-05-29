#!/usr/bin/env bash
# Daily Agent Council 수동 트리거 스크립트
# Claude Code 세션에서 Claude가 직접 호출 가능
#
# 사용법:
#   bash .claude/scripts/trigger-council.sh            # 전체 실행 (all)
#   bash .claude/scripts/trigger-council.sh cto        # 특정 에이전트만
#   bash .claude/scripts/trigger-council.sh cto marketer prompt_engineer
#
# 에이전트 이름:
#   all / pm / frontend / backend / designer / qa / cto / marketer / security / prompt_engineer

set -euo pipefail

REPO="mlender-ai/taro-stock-app"
WORKFLOW="idea-proposal.yml"
BRANCH="main"

AGENTS=("${@:-all}")

for AGENT in "${AGENTS[@]}"; do
  echo "▶ Triggering agent: $AGENT"
  gh api \
    --method POST \
    "repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches" \
    -f ref="${BRANCH}" \
    -f "inputs[agent]=${AGENT}" \
    && echo "  ✅ Dispatched: $AGENT" \
    || echo "  ❌ Failed: $AGENT"

  # CEO Brief는 agent=all 로만 실행되므로 개별 에이전트 후 별도 실행 불필요
  # 여러 에이전트를 연속 트리거할 때 concurrency 충돌 방지
  if [[ "${#AGENTS[@]}" -gt 1 && "$AGENT" != "${AGENTS[-1]}" ]]; then
    echo "  ⏳ 대기 10s (concurrency 충돌 방지)..."
    sleep 10
  fi
done

echo ""
echo "🔗 실행 확인: https://github.com/${REPO}/actions/workflows/${WORKFLOW}"
