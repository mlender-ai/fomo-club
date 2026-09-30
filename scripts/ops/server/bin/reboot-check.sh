#!/usr/bin/env bash
# 재부팅 자동 기동 시험 (OPS-04 E · 완료 확인 7). 재부팅하고 **아무것도 안 한 채** 10분 뒤 돌린다.
#
#   sudo /opt/fomo-club/scripts/ops/server/bin/reboot-check.sh
set -uo pipefail
bad=0
ok()  { printf '✅ %s\n' "$1"; }
no()  { printf '❌ %s\n' "$1"; bad=1; }

echo "부팅: $(uptime -s) · 지금 $(date '+%F %T %Z')"
mode=$(cat /etc/fomo/mode 2>/dev/null || echo '?')
echo "모드: $mode"
echo

systemctl is-active --quiet fce.service && ok "fce.service active" || no "fce.service $(systemctl is-active fce.service)"
curl -fsS --max-time 10 http://127.0.0.1:8875/health >/dev/null && ok "FCE /health 200" || no "FCE /health 응답 없음"
for t in fce-health.timer fce-backup.timer; do
  systemctl is-active --quiet "$t" && ok "$t" || no "$t $(systemctl is-active "$t")"
done
if [ "$mode" = "primary" ]; then
  systemctl is-active --quiet lab-runner.service && ok "lab-runner.service active" || no "lab-runner.service $(systemctl is-active lab-runner.service)"
  if grep -q "fce ✅" <(tail -n 200 /var/log/fomo/lab-runner.log 2>/dev/null); then ok "러너 첫 업로드 fce ✅"; else no "러너 로그에 fce ✅ 가 아직 없다"; fi
else
  systemctl is-active --quiet lab-shadow.timer && ok "lab-shadow.timer" || no "lab-shadow.timer $(systemctl is-active lab-shadow.timer)"
  systemctl is-active --quiet lab-runner.service && no "그림자 모드인데 lab-runner 가 돈다 — 맥과 동시 업로드 위험" || ok "lab-runner 꺼져 있음(그림자)"
fi
restarts=$(systemctl show fce.service -p NRestarts --value)
echo
echo "fce.service 재시작 횟수(부팅 뒤): $restarts"
exit "$bad"
