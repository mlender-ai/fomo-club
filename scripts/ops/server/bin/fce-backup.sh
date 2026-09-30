#!/usr/bin/env bash
# FCE DB 백업 — 매일 · 7일 보존 (OPS-04 E).
#
# `sqlite3 .backup` 은 온라인 백업 API 다 — FCE 가 쓰는 중에도 한 시점의 일관된 사본이 나온다.
# 파일을 `cp` 하면 쓰던 중간이 찍혀 복원이 안 될 수 있다.
set -euo pipefail
DB="${FCE_DB_PATH:-/opt/fce/backend/fomo_control_engine.db}"
DIR="${FCE_BACKUP_DIR:-/var/backups/fce}"
KEEP_DAYS="${FCE_BACKUP_KEEP_DAYS:-7}"
mkdir -p "$DIR"
stamp=$(date -u +%Y%m%d-%H%M)
tmp="$DIR/.fce-$stamp.db"
out="$DIR/fce-$stamp.db.zst"

sqlite3 "$DB" ".timeout 60000" ".backup '$tmp'"
# 사본이 멀쩡한지 바로 본다 — 깨진 백업을 7일 쌓는 것이 가장 나쁘다.
ok=$(sqlite3 "$tmp" "PRAGMA quick_check;")
if [ "$ok" != "ok" ]; then
  echo "백업 사본 quick_check 실패: $ok" >&2
  rm -f "$tmp"
  exit 1
fi
zstd -q -T0 --rm "$tmp" -o "$out"
chmod 600 "$out"

# 보존 — KEEP_DAYS 일보다 오래된 것만 지운다. 오늘 것이 없으면 지우지 않는다(위에서 실패했으면 여기 안 온다).
find "$DIR" -maxdepth 1 -name 'fce-*.db.zst' -mtime +"$((KEEP_DAYS - 1))" -print -delete
echo "$(date -u +%FT%TZ) 백업 $out ($(du -h "$out" | cut -f1)) · 보관 $(ls "$DIR"/fce-*.db.zst | wc -l)개"
