#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/diver"

echo "==> Pulling latest"
git -C "$INSTALL_DIR" pull

echo "==> Installing deps"
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile

echo "==> Building"
pnpm --filter web build

echo "==> Restarting service"
systemctl restart diver

echo "==> Done"
systemctl status diver --no-pager
