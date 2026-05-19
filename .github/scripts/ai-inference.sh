#!/usr/bin/env bash
# AI inference with automatic retry and exponential backoff
# Usage: source this file, then call: ai_inference "system_prompt" "user_prompt" [max_tokens]

ai_inference() {
  local system_prompt="$1"
  local user_prompt="$2"
  local max_tokens="${3:-2000}"
  local max_retries="${AI_MAX_RETRIES:-3}"
  local retry_delay="${AI_RETRY_DELAY:-45}"
  local model="${AI_MODEL:-openai/gpt-4o}"
  local api_url="${AI_API_URL:-https://models.inference.ai.azure.com/chat/completions}"

  for attempt in $(seq 1 "$max_retries"); do
    local payload
    payload=$(jq -n \
      --arg model "$model" \
      --arg system "$system_prompt" \
      --arg user "$user_prompt" \
      --argjson max_tokens "$max_tokens" \
      '{
        model: $model,
        messages: [
          {role: "system", content: $system},
          {role: "user", content: $user}
        ],
        temperature: 0.7,
        max_tokens: $max_tokens
      }')

    local http_response
    http_response=$(curl -s -w "\n%{http_code}" \
      --max-time 120 \
      -X POST "$api_url" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$payload" 2>/dev/null)

    local http_code
    http_code=$(echo "$http_response" | tail -1)
    local body
    body=$(echo "$http_response" | sed '$d')

    if [ "$http_code" = "200" ]; then
      local content
      content=$(echo "$body" | jq -r '.choices[0].message.content // empty')
      if [ -n "$content" ]; then
        echo "$content"
        return 0
      fi
    fi

    echo "::warning::AI inference attempt $attempt/$max_retries failed (HTTP $http_code)" >&2

    if [ "$attempt" -lt "$max_retries" ]; then
      local wait_time=$((retry_delay * attempt))
      echo "::notice::Retrying in ${wait_time}s..." >&2
      sleep "$wait_time"
    fi
  done

  echo "AI 추론 실패 (${max_retries}회 재시도 후 HTTP $http_code)"
  return 1
}
