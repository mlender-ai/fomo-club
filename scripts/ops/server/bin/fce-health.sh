#!/usr/bin/env bash
# FCE /health — 3번 연속(3분) 실패면 fce.service 를 다시 띄운다 (OPS-04 E).
# 프로세스가 죽은 것은 systemd 가 이미 안다. 이건 **떠 있는데 대답이 없는** 경우다.
set -uo pipefail
STATE=/run/fomo/fce-health.fails
mkdir -p /run/fomo

# 멈춰 있거나(재시작 한도 초과) 막 뜨는 중이면 손대지 않는다 — 그건 systemd · 알림의 일이다.
systemctl is-active --quiet fce.service || exit 0

if curl -fsS --max-time 10 http://127.0.0.1:8875/health >/dev/null; then
  rm -f "$STATE"
  exit 0
fi

fails=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE"
echo "$(date -u +%FT%TZ) FCE /health 실패 ${fails}회"
if [ "$fails" -ge 3 ]; then
  echo "$(date -u +%FT%TZ) 3회 연속 — fce.service 재시작"
  rm -f "$STATE"
  systemctl restart fce.service
fi
