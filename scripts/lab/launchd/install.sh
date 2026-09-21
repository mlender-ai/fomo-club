#!/usr/bin/env bash
# 로컬 수집 러너를 launchd 에 올린다.
#
# 러너는 이 맥에서 떠 있어야 화면이 살아 있다(docs/lab/CRON.md §0-3).
# 터미널을 닫거나 재부팅하면 죽으므로 launchd 가 대신 지킨다.
#
#   scripts/lab/launchd/install.sh
#
# 토큰은 환경변수 LAB_INGEST_TOKEN 에서 읽는다. plist 안에 들어가므로
# ~/Library/LaunchAgents 파일 권한을 600 으로 둔다.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LABEL="com.fomo.lab.runner"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -z "${LAB_INGEST_TOKEN:-}" ]; then
  echo "LAB_INGEST_TOKEN 이 없다. 토큰 없이는 러너가 아무것도 못 올린다." >&2
  exit 1
fi

NODE="$(command -v node)"
TSX="$REPO/node_modules/tsx/dist/cli.mjs"
[ -f "$TSX" ] || { echo "tsx 가 없다. npm install 먼저." >&2; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s#__NODE__#$NODE#" \
    -e "s#__TSX__#$TSX#" \
    -e "s#__REPO__#$REPO#" \
    -e "s#__TOKEN__#$LAB_INGEST_TOKEN#" \
    -e "s#__PATH__#$PATH#" \
    "$REPO/scripts/lab/launchd/$LABEL.plist" > "$TARGET"
chmod 600 "$TARGET"

# 이미 올라가 있으면 내렸다 다시 올린다 — 두 개가 같이 돌면 어느 게 죽었는지 모른다.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"

echo "올렸다: $LABEL"
echo "로그:   tail -f /tmp/lab-runner.log"
echo "제거:   launchctl bootout gui/\$(id -u)/$LABEL && rm $TARGET"
