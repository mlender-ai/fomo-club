#!/usr/bin/env bash
# 서버 첫 준비 — Ubuntu 24.04 · root (OPS-04 PART B). 두 번 돌려도 된다.
#
#   curl -fsSL https://raw.githubusercontent.com/mlender-ai/fomo-club/main/scripts/ops/server/bootstrap.sh | sudo bash
#   (또는 레포를 받은 뒤) sudo bash scripts/ops/server/bootstrap.sh
#
# 설치만 한다. 서비스는 install.sh 가 올린다. **키 · 토큰은 여기서 다루지 않는다**(C-2).
#
# 파이썬은 3.13 — 맥이 3.13 이다(python.org 프레임워크). 결과가 같아야 하므로 버전을 맞춘다.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "root 로 돌린다(sudo)." >&2; exit 1; }

FCE_REPO="${FCE_REPO:-https://github.com/mlender-ai/fomo-control-engine.git}"
LAB_REPO="${LAB_REPO:-https://github.com/mlender-ai/fomo-club.git}"

echo "── 패키지"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git curl ca-certificates sqlite3 zstd logrotate jq build-essential unattended-upgrades >/dev/null

echo "── 시간대 · 시계"
timedatectl set-timezone Asia/Seoul
timedatectl set-ntp true

echo "── 보안 업데이트는 자동 · **자동 재부팅은 끈다**(재부팅은 사람이 · 재부팅 시험으로 살아나는지 확인한다)"
cat > /etc/apt/apt.conf.d/52fomo-no-auto-reboot <<'CONF'
Unattended-Upgrade::Automatic-Reboot "false";
CONF

echo "── Node 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node --version

echo "── 사용자 fomo (로그인 없음)"
id fomo >/dev/null 2>&1 || useradd --system --home /var/lib/fomo --create-home --shell /usr/sbin/nologin fomo
install -d -o fomo -g fomo /opt/fce /opt/fomo-club /var/lib/fomo /var/lib/fomo/shadow /var/log/fomo
install -d -m 700 -o root -g root /var/backups/fce
install -d -m 755 /etc/fomo

echo "── uv · Python 3.13"
if [ ! -x /usr/local/bin/uv ]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin INSTALLER_NO_MODIFY_PATH=1 sh >/dev/null
fi

echo "── FCE (코드는 그대로 — 받기만)"
if [ ! -d /opt/fce/.git ]; then
  sudo -u fomo git clone -q "$FCE_REPO" /opt/fce
fi
sudo -u fomo bash -c 'cd /opt/fce && UV_PYTHON_INSTALL_DIR=/var/lib/fomo/python uv venv -q --python 3.13 .venv && uv pip install -q --python .venv/bin/python -r backend/requirements.txt'
/opt/fce/.venv/bin/python --version

echo "── 랩 (러너 · 대조)"
if [ ! -d /opt/fomo-club/.git ]; then
  sudo -u fomo git clone -q "$LAB_REPO" /opt/fomo-club
fi
sudo -u fomo bash -c 'cd /opt/fomo-club && npm ci --no-audit --no-fund --loglevel=error'

echo "── 로그 보존"
install -m 644 /opt/fomo-club/scripts/ops/server/fomo.logrotate /etc/logrotate.d/fomo
install -d /etc/systemd/journald.conf.d
install -m 644 /opt/fomo-club/scripts/ops/server/journald-fomo.conf /etc/systemd/journald.conf.d/fomo.conf
systemctl restart systemd-journald

echo
echo "준비 끝. 다음:"
echo "  1 🧑 맥에서 DB 옮기기     scripts/ops/server/migrate-db-from-mac.sh <서버>"
echo "  2 🧑 비밀 넣기            /etc/fomo/*-secrets.env (env/*.example 참고)"
echo "  3    서비스 올리기        sudo /opt/fomo-club/scripts/ops/server/install.sh --mode shadow --since <1 이 알려 준 시각>"
