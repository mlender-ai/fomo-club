#!/usr/bin/env bash
# 유닛 실패 알림 — 텔레그램 한 줄 (OPS-04 E).
#   fomo-alert@<유닛>.service 가 부른다. 토큰은 /etc/fomo/alert-secrets.env (🧑 사람이 넣는다).
#
# **FCE 봇과 다른 봇을 쓴다.** 같은 토큰으로 두 곳이 getUpdates 를 부르면 텔레그램이 한쪽을 끊는다(409).
# 여기는 sendMessage 만 부르니 OPS-03 알림 봇(랩 · TELEGRAM_BOT_TOKEN)과 같은 봇이어도 된다.
set -uo pipefail
unit="${1:-?}"
host="$(hostname)"
state="$(systemctl show "$unit" -p ActiveState -p Result --value 2>/dev/null | paste -sd' ')"
tail="$(journalctl -u "$unit" -n 5 --no-pager -o cat 2>/dev/null | tail -c 600)"
text="🚨 ${host} · ${unit} 실패 (${state})
${tail}
확인: systemctl status ${unit}"

echo "$text"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  curl -fsS --max-time 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=${text}" >/dev/null \
    || echo "텔레그램 전송 실패" >&2
else
  echo "alert-secrets.env 가 없다 — 알림을 못 보냈다(로그에만 남는다)" >&2
fi
