#!/usr/bin/env bash
# 🧑 맥에서 돌린다 — FCE 상태를 서버로 복사한다 (OPS-04 PART B). **맥 FCE 는 계속 돈다**(병행 운용).
#
#   scripts/ops/server/migrate-db-from-mac.sh ubuntu@<서버 IP>
#
# 옮기는 것: backend/*.db (sqlite 온라인 백업 — 쓰는 중에도 한 시점 사본) · notification_state.json · logs/shadows(ENG-02 실험)
# **옮기지 않는 것: .env** — 맥 키가 들어 있다. 서버 키는 조회 전용으로 새로 만든다(OPS-04 C-1).
#
# 끝에 **복사 시각**을 알려 준다 — 서버 install.sh --since 에 그대로 넣는다(병행 대조의 갈라진 시각).
set -euo pipefail
SERVER="${1:?사용법: $0 user@서버}"
FCE="${FCE_HOME:-$HOME/fce}"
[ -d "$FCE/backend" ] || { echo "FCE 가 $FCE 에 없다 (FCE_HOME=…)" >&2; exit 1; }
command -v zstd >/dev/null || { echo "zstd 가 없다: brew install zstd" >&2; exit 1; }

WORK="$(mktemp -d /tmp/fce-migrate.XXXX)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/backend" "$WORK/logs"

SINCE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "복사 시각(갈라진 시각): $SINCE"
for db in "$FCE"/backend/*.db; do
  [ -f "$db" ] || continue
  echo "  $(basename "$db") ($(du -h "$db" | cut -f1)) — 온라인 백업"
  sqlite3 "$db" ".timeout 60000" ".backup '$WORK/backend/$(basename "$db")'"
  [ "$(sqlite3 "$WORK/backend/$(basename "$db")" 'PRAGMA quick_check;')" = "ok" ] || { echo "사본 검사 실패: $db" >&2; exit 1; }
done
for f in "$FCE/notification_state.json" "$FCE/backend/notification_state.json"; do
  [ -f "$f" ] && { mkdir -p "$WORK/$(dirname "${f#$FCE/}")"; cp "$f" "$WORK/${f#$FCE/}"; echo "  ${f#$FCE/}"; }
done
[ -d "$FCE/logs/shadows" ] && { cp -R "$FCE/logs/shadows" "$WORK/logs/"; echo "  logs/shadows"; }
echo "$SINCE" > "$WORK/SINCE"

# 실수로라도 .env 가 섞이지 않았는지 한 번 더.
if find "$WORK" -name '.env*' | grep -q .; then echo ".env 가 섞였다 — 멈춘다" >&2; exit 1; fi

ARCHIVE="$WORK.tar.zst"
tar -C "$WORK" -cf - . | zstd -q -T0 -o "$ARCHIVE"
echo "묶음: $(du -h "$ARCHIVE" | cut -f1) → $SERVER"
scp -q "$ARCHIVE" "$SERVER:/tmp/fce-migrate.tar.zst"
rm -f "$ARCHIVE"

echo
echo "서버에서:"
echo "  sudo /opt/fomo-club/scripts/ops/server/restore-fce-state.sh /tmp/fce-migrate.tar.zst"
echo "  sudo /opt/fomo-club/scripts/ops/server/install.sh --mode shadow --since $SINCE"
