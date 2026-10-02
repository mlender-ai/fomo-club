#!/usr/bin/env bash
# TRADER-03 F — 실계좌 비교 업로더를 launchd 에 올린다(15분마다).
#
#   scripts/ops/launchd/install-trader-me.sh                          # 키 = ~/fce/backend/.env
#   ENV_FILE=/다른/.env scripts/ops/launchd/install-trader-me.sh
#
# 키 파일에 ME_INGEST_TOKEN(Vercel 과 같은 값)도 넣는다 — 🧑 값은 광혁이.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
LABEL=com.fomo.trader.me
ENV_FILE="${ENV_FILE:-$HOME/fce/backend/.env}"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

case "$REPO" in
  "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*)
    echo "레포가 $REPO 에 있다 — launchd 는 이 폴더를 못 읽는다(TCC). ~/ 아래 다른 자리로 옮긴다." >&2
    exit 1;;
esac
[ -f "$ENV_FILE" ] || { echo "키 파일이 없다: $ENV_FILE (ENV_FILE=... 로 지정)" >&2; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s#__REPO__#$REPO#g" -e "s#__ENV_FILE__#$ENV_FILE#g" "$REPO/scripts/ops/launchd/$LABEL.plist" > "$TARGET"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"
echo "올렸다: $LABEL (15분마다) · 로그 ~/.fomo/trader/me-upload.log"
echo "지금 한 번: python3 scripts/trader/me_upload.py --env-file \"$ENV_FILE\""
