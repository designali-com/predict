#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 EC2 instance for Predict.
#
#   sudo bash deploy/setup-server.sh
#
# Installs: 4 GB swap, Node 22 + pnpm, Docker (for Redis), nginx, certbot, pm2.
# Safe to run again — every step checks before it acts.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi
APP_USER="${SUDO_USER:-ubuntu}"

echo "== swap (4 GB) — building three Next apps needs more than the 4 GB of RAM"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
grep -q "vm.swappiness" /etc/sysctl.conf || echo "vm.swappiness=10" >> /etc/sysctl.conf

echo "== base packages"
apt-get update -y
apt-get install -y ca-certificates curl git build-essential nginx certbot python3-certbot-nginx

echo "== Node 22"
if ! command -v node >/dev/null || ! node -v | grep -q "^v22"; then
  # NodeSource first; on an Ubuntu release it does not know yet, the official
  # Linux build from nodejs.org instead.
  if ! { curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs; }; then
    NODE_TAR=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v22[^ ]*-linux-x64.tar.xz" | head -1)
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/$NODE_TAR" | tar -xJ -C /usr/local --strip-components=1
  fi
fi
node -v

echo "== pnpm (the version the repo pins) and pm2"
corepack enable
sudo -u "$APP_USER" corepack prepare pnpm@10.33.4 --activate
npm install -g pm2

echo "== Docker (Redis for the automation queue)"
if ! command -v docker >/dev/null; then
  # Ubuntu's own packages: they exist on every release, including ones
  # Docker's installer does not support yet.
  apt-get install -y docker.io docker-compose-v2 || curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
usermod -aG docker "$APP_USER"

echo "== pm2 starts on boot, as $APP_USER"
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null

echo "== firewall is the security group; nginx default site off"
rm -f /etc/nginx/sites-enabled/default
systemctl enable --now nginx

echo
echo "Done. Log out and back in once (so the docker group applies), then:"
echo "  cd ~/predictfit && bash deploy/deploy.sh"
