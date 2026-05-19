#!/usr/bin/env bash
# 에이전트 공유 컨텍스트 로드
# Usage: source .github/scripts/load-context.sh
# 결과: AGENT_CONTEXT 변수에 OKR + 메모리 + 어제 CEO 브리프가 담김

OKR=$(cat .github/agents/QUARTERLY_OKR.md 2>/dev/null || echo "OKR 미정의")
MEMORY=$(tail -80 .github/agents/MEMORY.md 2>/dev/null || echo "이전 기록 없음")

# 어제 CEO 브리프 (최근 1개)
LAST_BRIEF=$(gh issue list \
  --label "ceo-brief" \
  --state closed \
  --limit 1 \
  --json body \
  --jq '.[0].body // "이전 브리프 없음"' 2>/dev/null | head -150)

AGENT_CONTEXT="
=== 이번 분기 OKR ===
${OKR}

=== 과거 학습 기록 (최근) ===
${MEMORY}

=== 어제 CEO 브리프 요약 ===
${LAST_BRIEF}
"

export AGENT_CONTEXT
