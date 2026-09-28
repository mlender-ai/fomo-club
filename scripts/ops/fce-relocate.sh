#!/usr/bin/env bash
# FCE 를 ~/Documents 에서 ~/fce 로 옮기고 launchd 로 올린다 (OPS-01 STEP 2-3 · 3).
#
#   scripts/ops/fce-relocate.sh
#
# 왜: ~/Documents 는 macOS 보호 폴더라 launchd 로 뜬 프로세스가 FCE 를 못 읽는다.
# FCE 는 경로를 전부 상대로 쓴다(REPO_DIR = 스크립트 자리 · DB = sqlite:///./ · cd backend) — **FCE 코드는 안 고친다.**
#
# 하는 일 (중간에 하나라도 실패하면 거기서 멈춘다):
#   1  FCE 감시 루프 · 8875 · 8876 을 FCE 자신의 stop-supervisor.sh 로 멈춘다
#   2  mv "~/Documents/Fomo club engine" ~/fce  — 같은 디스크라 이름만 바뀐다(DB 5GB 도 즉시)
#   3  git worktree repair — .claude/worktrees 의 절대 경로를 새 자리로
#   4  launchd 등록(scripts/ops/launchd/install-fce.sh)
#   5  8875 가 다시 뜨는지 90초 기다린다
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$HOME/Documents/Fomo club engine"
DST="$HOME/fce"

if [ -d "$DST/backend" ] && [ ! -e "$SRC" ]; then
  echo "이미 옮겨져 있다: $DST — launchd 등록만 한다."
  exec "$REPO/scripts/ops/launchd/install-fce.sh"
fi
[ -d "$SRC/backend" ] || { echo "FCE 가 $SRC 에 없다." >&2; exit 1; }
[ ! -e "$DST" ] || { echo "$DST 가 이미 있다 — 무엇인지 보고 치운 뒤 다시." >&2; exit 1; }

echo "1/5 FCE 멈춤"
/bin/bash "$SRC/scripts/local/stop-supervisor.sh" || true
pkill -f "$SRC/scripts/local/supervisor.sh" 2>/dev/null || true
for _ in $(seq 1 30); do
  lsof -ti :8875 -sTCP:LISTEN >/dev/null 2>&1 || lsof -ti :8876 -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
if lsof -ti :8875 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "8875 가 30초 안에 안 내려갔다. 옮기지 않는다 — lsof -i :8875 로 누가 잡고 있나 본다." >&2
  exit 1
fi

echo "2/5 옮김 → $DST"
mv "$SRC" "$DST"

echo "3/5 worktree 경로"
git -C "$DST" worktree repair >/dev/null 2>&1 || echo "   (worktree repair 건너뜀 — FCE 가동과 무관)"

echo "4/5 launchd"
"$REPO/scripts/ops/launchd/install-fce.sh"

echo "5/5 8875 기다림"
for i in $(seq 1 90); do
  if curl -sf -m 3 -o /dev/null http://127.0.0.1:8875/health; then
    echo "   FCE 백엔드 ✅ (${i}초)"
    break
  fi
  sleep 1
  [ "$i" = 90 ] && { echo "   90초 안에 안 떴다 — tail -50 $DST/logs/backend.log" >&2; exit 1; }
done
if ! lsof -ti :8876 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "   8876(FCE 화면)이 아직이다. 몇 분 뒤에도 없으면: cd $DST/dashboard && npm run build"
fi
echo "끝. 이제 러너는 $DST 를 스스로 찾는다(scripts/lab/fce-home.ts) — 다시 올릴 필요 없다."
