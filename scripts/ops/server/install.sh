#!/usr/bin/env bash
# systemd 에 올린다 (OPS-04 PART B · D). root.
#
#   install.sh --mode shadow --since 2026-10-01T03:00:00Z    # 1주차 — FCE + 그림자 기록 + 매일 대조. 업로드 없음
#   install.sh --mode primary                                # 운영 — FCE + 러너(업로드). 그림자 끔
#
# 두 번 돌려도 된다. 모드를 바꾸면 반대쪽 유닛을 끈다 — **그림자와 러너가 같이 켜져 있는 순간이 없다.**
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "root 로 돌린다(sudo)." >&2; exit 1; }

MODE=""; SINCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    *) echo "모르는 인자: $1" >&2; exit 1 ;;
  esac
done
case "$MODE" in shadow|primary) ;; *) echo "--mode shadow|primary" >&2; exit 1 ;; esac

REPO=/opt/fomo-club
SRV="$REPO/scripts/ops/server"

need_secret() { # 파일 · 반드시 채울 키…
  local f="$1"; shift
  [ -f "$f" ] || { echo "❌ $f 가 없다 — $SRV/env/$(basename "$f").example 을 보고 🧑 만든다(root 0600)." >&2; exit 1; }
  [ "$(stat -c '%a %U' "$f")" = "600 root" ] || { echo "❌ $f 권한은 600 root 여야 한다: sudo chown root:root $f && sudo chmod 600 $f" >&2; exit 1; }
  for k in "$@"; do
    v=$(grep -E "^$k=" "$f" | head -1 | cut -d= -f2-)
    # 자리표시로 실패한 적이 있다(OPS-01 — 토큰 자리에 '…').
    if [ -z "$v" ] || [[ "$v" == *"…"* ]] || [[ "$v" == *"여기에"* ]]; then
      echo "❌ $f 의 $k 가 비었거나 자리표시다." >&2; exit 1
    fi
  done
}

echo "── 설정 파일"
{
  echo "# 만든 곳: $SRV/install.sh ($(date -u +%FT%TZ)) — 손으로 고치지 말고 원본을 고친 뒤 다시 돌린다"
  cat "$REPO/scripts/ops/launchd/fce.env"          # 맥과 같은 운영 값
  cat "$SRV/env/fce-server.env"
  if [ "$MODE" = "shadow" ]; then cat "$SRV/env/fce-shadow.env"; fi
} > /etc/fomo/fce.env
sed -e "s#^SHADOW_SINCE=.*#SHADOW_SINCE=${SINCE}#" "$SRV/env/runner.env" > /etc/fomo/runner.env
chmod 644 /etc/fomo/fce.env /etc/fomo/runner.env
echo "$MODE" > /etc/fomo/mode

if [ "$MODE" = "shadow" ]; then
  [ -n "$SINCE" ] || { echo "❌ --since 가 필요하다 — migrate-db-from-mac.sh 가 알려 준 시각" >&2; exit 1; }
  need_secret /etc/fomo/runner-secrets.env LAB_INGEST_TOKEN
  # 그림자 서버에 봇 토큰이 있으면 맥 봇을 끊는다.
  if grep -qE '^FCE_TELEGRAM_BOT_TOKEN=.+' /etc/fomo/fce-secrets.env 2>/dev/null; then
    echo "❌ 그림자 모드인데 fce-secrets.env 에 FCE_TELEGRAM_BOT_TOKEN 이 있다 — 비운다(맥 봇과 충돌)." >&2; exit 1
  fi
else
  need_secret /etc/fomo/runner-secrets.env LAB_INGEST_TOKEN
fi
[ -f /etc/fomo/fce-secrets.env ] && need_secret /etc/fomo/fce-secrets.env
[ -f /etc/fomo/alert-secrets.env ] || echo "⚠ /etc/fomo/alert-secrets.env 가 없다 — 유닛 실패 알림이 로그에만 남는다."

echo "── 유닛"
install -m 644 "$SRV"/units/*.service "$SRV"/units/*.timer /etc/systemd/system/
chmod +x "$SRV"/bin/*.sh
systemctl daemon-reload

systemctl enable --now fce.service fce-health.timer fce-backup.timer
if [ "$MODE" = "shadow" ]; then
  systemctl disable --now lab-runner.service 2>/dev/null || true
  systemctl enable --now lab-shadow.timer lab-shadow-compare.timer
else
  systemctl disable --now lab-shadow.timer lab-shadow-compare.timer 2>/dev/null || true
  systemctl enable --now lab-runner.service
fi

echo
echo "올렸다 — 모드 $MODE"
systemctl --no-pager --plain list-units 'fce*' 'lab-*' | sed -n '1,20p'
echo
echo "로그: tail -f /var/log/fomo/fce.log /var/log/fomo/lab-*.log"
if [ "$MODE" = "primary" ]; then echo "⚠ Vercel LAB_WRITER=seoul-1 로 바꾸고 재배포했나? 안 했으면 맥이 아직 쓸 수 있다(docs/ops/OPS-04.md 전환 단계)."; fi
exit 0
