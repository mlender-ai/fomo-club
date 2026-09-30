#!/usr/bin/env bash
# 서버 — 맥에서 받은 FCE 상태를 /opt/fce 에 푼다 (OPS-04 PART B). root.
#
#   restore-fce-state.sh /tmp/fce-migrate.tar.zst
#
# FCE 가 돌고 있으면 멈추고 푼다. 이미 DB 가 있으면 옆에 .before-<시각> 으로 남긴다 — 덮어써서 잃지 않는다.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "root 로 돌린다(sudo)." >&2; exit 1; }
ARCHIVE="${1:?묶음 파일}"
WORK="$(mktemp -d /var/tmp/fce-restore.XXXX)"
trap 'rm -rf "$WORK"' EXIT

zstd -q -d "$ARCHIVE" -c | tar -C "$WORK" -xf -
[ -f "$WORK/SINCE" ] || { echo "SINCE 가 없다 — migrate-db-from-mac.sh 로 만든 묶음인가" >&2; exit 1; }
if find "$WORK" -name '.env*' | grep -q .; then echo ".env 가 들어 있다 — 풀지 않는다" >&2; exit 1; fi

systemctl stop fce.service 2>/dev/null || true
stamp=$(date -u +%Y%m%dT%H%M%SZ)
for db in "$WORK"/backend/*.db; do
  dest="/opt/fce/backend/$(basename "$db")"
  [ -f "$dest" ] && mv "$dest" "$dest.before-$stamp"
  install -o fomo -g fomo -m 640 "$db" "$dest"
  echo "  $(basename "$db") → $dest"
done
[ -f "$WORK/notification_state.json" ] && install -o fomo -g fomo -m 640 "$WORK/notification_state.json" /opt/fce/notification_state.json
[ -f "$WORK/backend/notification_state.json" ] && install -o fomo -g fomo -m 640 "$WORK/backend/notification_state.json" /opt/fce/backend/notification_state.json
if [ -d "$WORK/logs/shadows" ]; then
  install -d -o fomo -g fomo /opt/fce/logs
  cp -R "$WORK/logs/shadows" /opt/fce/logs/ && chown -R fomo:fomo /opt/fce/logs/shadows
fi
rm -f "$ARCHIVE"
echo
echo "갈라진 시각: $(cat "$WORK/SINCE")"
echo "다음: sudo /opt/fomo-club/scripts/ops/server/install.sh --mode shadow --since $(cat "$WORK/SINCE")"
