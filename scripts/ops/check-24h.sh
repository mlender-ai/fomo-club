#!/usr/bin/env bash
# 24시간 가동 점검 (OPS-01 완료 확인 · RUNBOOK). 읽기만 한다 — 아무것도 켜거나 끄지 않는다.
#
#   scripts/ops/check-24h.sh
set -uo pipefail

FCE="${FCE_HOME:-$HOME/fce}"
[ -d "$FCE/backend" ] || FCE="$HOME/Documents/Fomo club engine"
DOMAIN="gui/$(id -u)"
LAB="${LAB_BASE_URL:-https://fomo-web-mlender-ais-projects.vercel.app}"
ok() { echo "✅ $*"; }
no() { echo "❌ $*"; }

echo "── 절전 (전원 연결 시)"
AC="$(pmset -g custom | awk '/AC Power/{f=1;next} /Battery Power/{f=0} f')"
for k in sleep disksleep; do
  v="$(echo "$AC" | awk -v k="$k" '$1==k{print $2}')"
  [ "$v" = "0" ] && ok "$k 0" || no "$k ${v:-?} — sudo pmset -c $k 0"
done
pmset -g batt | grep -q "AC Power" && ok "전원 연결됨" || no "배터리로 돈다 — 어댑터를 꽂는다 (-c 설정은 전원 연결 시만)"

echo "── FCE ($FCE)"
case "$FCE" in "$HOME/Documents"*) no "보호 폴더 안 — scripts/ops/fce-relocate.sh";; *) ok "보호 폴더 밖";; esac
launchctl print "$DOMAIN/com.fomo.fce.supervisor" >/dev/null 2>&1 && ok "감시 루프 launchd" || no "감시 루프가 launchd 에 없다 — scripts/ops/launchd/install-fce.sh"
curl -sf -m 5 -o /dev/null http://127.0.0.1:8875/health && ok "백엔드 8875" || no "백엔드 8875 응답 없음 — tail -50 $FCE/logs/backend.log"
lsof -ti :8876 -sTCP:LISTEN >/dev/null 2>&1 && ok "화면 8876" || no "화면 8876 없음 — tail -50 $FCE/logs/frontend.log"

echo "── 러너"
RPID="$(launchctl print "$DOMAIN/com.fomo.lab.runner" 2>/dev/null | awk '$1=="pid"{print $3}')"
if [ -n "$RPID" ]; then
  ok "러너 launchd (pid $RPID)"
  PIDS="$RPID $(pgrep -P "$RPID" | tr '\n' ' ')"
  PAT="$(echo $PIDS | sed 's/ /|p/g')"
  LAST="$(grep -aE "p($PAT)\] fce " /tmp/lab-runner.log 2>/dev/null | tail -3)"
  if [ -n "$LAST" ]; then echo "$LAST" | sed 's/^/   /'; else no "이 러너의 fce 줄이 아직 없다(15분 주기)"; fi
else
  no "러너가 launchd 에 없다 — LAB_INGEST_TOKEN='값' scripts/lab/launchd/install.sh"
fi
OTHERS="$(pgrep -f "scripts/lab/runner.ts" | while read -r p; do
  [ "$p" = "$RPID" ] && continue; pgrep -P "${RPID:-0}" | grep -qx "$p" && continue
  anc="$(ps -o ppid= -p "$p" | tr -d ' ')"; [ "$anc" = "$RPID" ] && continue
  gp="$(ps -o ppid= -p "${anc:-1}" | tr -d ' ')"; [ "$gp" = "$RPID" ] && continue
  echo "$p"; done | tr '\n' ' ')"
[ -z "${OTHERS// /}" ] && ok "다른 러너 없음" || no "launchd 밖 러너: $OTHERS— 겹쳐 올린다"
pgrep -f "scripts/lab/fce-sidecar.ts" >/dev/null && echo "ℹ️  사이드카가 돈다 (FCE 를 옮긴 뒤엔 필요 없다)"

echo "── 사이트"
curl -s -m 10 "$LAB/api/lab/overview" | python3 -c '
import sys,json
s=json.load(sys.stdin).get("sync") or {}
print(("✅" if s.get("level")=="live" else "❌"), "동기화", s.get("label"), "·", s.get("level"))' 2>/dev/null || no "사이트 응답 없음"
