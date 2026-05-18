#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/your-org/diver.git"   # update before use
INSTALL_DIR="/opt/diver"
SERVICE_USER="diver"

echo "==> Creating system user"
id "$SERVICE_USER" &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

echo "==> Installing Node.js 22 + pnpm"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pnpm

echo "==> Cloning repo"
if [ -d "$INSTALL_DIR" ]; then
  git -C "$INSTALL_DIR" pull
else
  git clone "$REPO" "$INSTALL_DIR"
fi

echo "==> Installing dependencies"
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile

echo "==> Building"
cp .env.example .env
echo "  !! Edit $INSTALL_DIR/.env with your RPC URL before starting"
pnpm --filter web build

echo "==> Installing systemd service"
cp deploy/diver.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now diver

echo "==> Done. Service status:"
systemctl status diver --no-pager
