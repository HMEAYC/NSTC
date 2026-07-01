#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="hmeayc-backend"
USER_HOME="$HOME"
REPO_DIR="$(dirname "$(dirname "$(realpath "$0")")")"

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (sudo)." >&2
  exit 1
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=HMEAYC Backend
After=network.target

[Service]
Type=simple
User=$(logname 2>/dev/null || echo "$SUDO_USER")
WorkingDirectory=${REPO_DIR}/backend
ExecStart=${REPO_DIR}/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=5
EnvironmentFile=-${REPO_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl start "${SERVICE_NAME}.service"

echo "✓ Systemd service '${SERVICE_NAME}' installed and started."
echo "  Manage with: systemctl [status|stop|restart] ${SERVICE_NAME}"
