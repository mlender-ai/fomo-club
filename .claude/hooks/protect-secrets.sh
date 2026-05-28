#!/usr/bin/env bash
# Claude Code PreToolUse hook — Edit/Write 시 민감 파일 접근 차단.
# simulo AGENT_BIBLE.md "Clean Context → 결정론적 제어" 원칙 차용 (2026-05-27).
#
# 동작:
# - stdin으로 받은 JSON에서 tool_name 과 file_path 추출
# - 보호된 경로 패턴 매치 시 exit 2 + stderr 메시지 (Claude에게 전달되어 차단)
# - 정상이면 exit 0

set -euo pipefail

INPUT=$(cat)

# jq 사용 가능하면 사용, 아니면 grep 폴백
if command -v jq >/dev/null 2>&1; then
  TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
else
  TOOL=$(echo "$INPUT" | grep -oE '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
  FILE_PATH=$(echo "$INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
fi

# Edit/Write/NotebookEdit 가 아니면 통과
if [[ "$TOOL" != "Edit" && "$TOOL" != "Write" && "$TOOL" != "NotebookEdit" ]]; then
  exit 0
fi

# 파일 경로 없으면 통과 (다른 도구 변형)
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# 보호 패턴
BLOCK_REASONS=()

# .env 파일군 (.env, .env.local, .env.production, apps/web/.env.local 등)
# 단 .env.example 은 허용 (샘플 파일)
if [[ "$FILE_PATH" =~ (^|/)\.env($|\.local$|\.production$|\.development$|\.staging$|\.[a-z]+\.local$) ]]; then
  BLOCK_REASONS+=(".env 계열 환경 파일 (시크릿 노출 위험)")
fi

# Prisma migration SQL — 적용된 마이그레이션은 immutable
if [[ "$FILE_PATH" =~ (^|/)prisma/migrations/.+\.sql$ ]]; then
  BLOCK_REASONS+=("적용된 Prisma migration SQL (immutable — 새 마이그레이션 생성 필요)")
fi

# 비밀 키 파일
if [[ "$FILE_PATH" =~ \.(pem|key|p12|pfx|jks)$ ]]; then
  BLOCK_REASONS+=("암호화 키 파일")
fi

# Apple/Google 영수증 검증 시크릿
if [[ "$FILE_PATH" =~ (apple-shared-secret|google-service-account|firebase-admin) ]]; then
  BLOCK_REASONS+=("결제 검증 시크릿 (Apple/Google/Firebase)")
fi

# AdMob/RevenueCat 시크릿 파일
if [[ "$FILE_PATH" =~ (admob-secret|revenuecat-secret|revenuecat-private) ]]; then
  BLOCK_REASONS+=("결제/광고 시크릿")
fi

if [[ ${#BLOCK_REASONS[@]} -gt 0 ]]; then
  echo "🛡️  protect-secrets hook: 보호된 파일에 대한 ${TOOL} 차단" >&2
  echo "  파일: $FILE_PATH" >&2
  echo "  사유:" >&2
  for r in "${BLOCK_REASONS[@]}"; do
    echo "    - $r" >&2
  done
  echo "" >&2
  echo "  진짜 변경이 필요하면:" >&2
  echo "  1) .env.example / .env.template 같은 샘플 파일에 변경 (실제 .env는 사용자가 수동 수정)" >&2
  echo "  2) Prisma migration은 'npx prisma migrate dev --name <name>' 로 새 마이그레이션 생성" >&2
  echo "  3) 시크릿은 사용자가 직접 1Password / GitHub Secrets 에서 관리" >&2
  exit 2
fi

exit 0
