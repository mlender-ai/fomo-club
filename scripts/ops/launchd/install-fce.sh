#!/usr/bin/env bash
# FCE 감시 루프를 launchd 에 올린다 (OPS-01 STEP 3). 토큰이 필요 없다.
#
#   scripts/ops/launchd/install-fce.sh            # ~/fce
#   FCE_HOME=/다른/자리 scripts/ops/launchd/install-fce.sh
#
# 두 번 돌려도 된다 — 올라가 있으면 내렸다 다시 올린다.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FCE="${FCE_HOME:-$HOME/fce}"
LABEL="com.fomo.fce.supervisor"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

[ -f "$FCE/scripts/local/supervisor.sh" ] || { echo "FCE 가 $FCE 에 없다. scripts/ops/fce-relocate.sh 먼저." >&2; exit 1; }
case "$FCE" in
  "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*)
    echo "$FCE 는 macOS 보호 폴더다 — launchd 가 못 읽는다. ~/fce 로 옮긴다(scripts/ops/fce-relocate.sh)." >&2; exit 1 ;;
esac

# nohup 으로 뜬 옛 감시 루프가 있으면 둘이 같은 포트를 두고 싸운다.
if pgrep -f "scripts/local/supervisor.sh" >/dev/null && ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "launchd 밖에서 도는 감시 루프가 있다:" >&2
  pgrep -fl "scripts/local/supervisor.sh" >&2
  echo "먼저 멈춘다: /bin/bash \"$FCE/scripts/local/stop-supervisor.sh\"" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$FCE/logs"
sed -e "s#__FCE__#$FCE#g" "$REPO/scripts/ops/launchd/$LABEL.plist" > "$TARGET"
plutil -lint "$TARGET" >/dev/null

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$TARGET"

echo "올렸다: $LABEL ($FCE)"
echo "로그:   tail -f \"$FCE/logs/supervisor.log\""
echo "제거:   launchctl bootout $DOMAIN/$LABEL && rm $TARGET"
