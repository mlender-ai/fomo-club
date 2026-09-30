#!/usr/bin/env bash
# 백업 복원 시험 (OPS-04 E · 완료 확인 8). **운영 DB 는 건드리지 않는다.**
#
#   sudo /opt/fomo-club/scripts/ops/server/bin/fce-restore-test.sh [백업파일]
#
# 1 가장 최근 백업을 임시 자리에 푼다
# 2 integrity_check — 페이지 전부를 읽는다(5GB 면 몇 분)
# 3 주요 표 행 수를 운영 DB 와 견준다 — 백업 시각 이후 늘어난 만큼만 적어야 한다
# 4 FCE 자기 코드로 연다 — 같은 파이썬 · 같은 모델로 최근 페이퍼 거래를 읽는다(워커는 안 띄운다)
set -euo pipefail
DIR="${FCE_BACKUP_DIR:-/var/backups/fce}"
LIVE="${FCE_DB_PATH:-/opt/fce/backend/fomo_control_engine.db}"
FILE="${1:-$(ls -1t "$DIR"/fce-*.db.zst | head -1)}"
WORK=$(mktemp -d /var/tmp/fce-restore.XXXX)
trap 'rm -rf "$WORK"' EXIT

echo "복원: $FILE"
zstd -q -d "$FILE" -o "$WORK/fce.db"
echo "크기: $(du -h "$WORK/fce.db" | cut -f1)"

echo -n "integrity_check: "
res=$(sqlite3 "$WORK/fce.db" "PRAGMA integrity_check;" | head -5)
echo "$res"
[ "$res" = "ok" ] || { echo "❌ 무결성 실패" >&2; exit 1; }

echo
printf '%-28s %12s %12s\n' "표" "백업" "운영"
for t in paper_trades stock_paper_orders positions judgment_ledger; do
  b=$(sqlite3 "$WORK/fce.db" "SELECT COUNT(*) FROM $t;" 2>/dev/null || echo "-")
  l=$(sqlite3 -readonly "$LIVE" "SELECT COUNT(*) FROM $t;" 2>/dev/null || echo "-")
  printf '%-28s %12s %12s\n' "$t" "$b" "$l"
done

echo
echo "FCE 코드로 열기:"
cd /opt/fce/backend
RESTORED="$WORK/fce.db" /opt/fce/.venv/bin/python - <<'PY'
import os
from app.db.repository import create_repository  # FCE 가 쓰는 그 저장소 — 복원본을 가리킨다
repo = create_repository("sqlite:///" + os.environ["RESTORED"])
trades = repo.list_paper_trades(status="closed", limit=3)
print(f"  닫힌 페이퍼 거래 최근 {len(trades)}건:", ", ".join(f"{t.symbol} {t.exit_at}" for t in trades) or "없음")
PY
echo
echo "✅ 복원 시험 통과 — 결과를 docs/ops/OPS-04.md '백업 복원 시험' 에 붙인다"
