#!/usr/bin/env bash
# Ubuntu 22.04+ / Debian 12+
# Usage: sudo bash deploy/setup.sh conference.example.com admin@example.com
set -euo pipefail
APP_DIR=/opt/lpclub
SITE_DIR=$APP_DIR/site
SERVICE=lpclub-conference
DOMAIN=${1:-}
EMAIL=${2:-}

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx curl ca-certificates
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
cd "$APP_DIR"
npm install --omit=dev --no-audit --no-fund
mkdir -p "$APP_DIR/data"
if [ ! -f "$APP_DIR/server/.env" ]; then
  cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
  echo "ERROR: created $APP_DIR/server/.env. Set a strong ADMIN_TOKEN and rerun this script."
  exit 1
fi
if grep -q 'replace-with-a-long-random-secret' "$APP_DIR/server/.env"; then
  echo "ERROR: replace ADMIN_TOKEN in $APP_DIR/server/.env before starting production."
  exit 1
fi

cat >/etc/systemd/system/$SERVICE.service <<UNIT
[Unit]
Description=LP CLUB Conference registration service
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
Environment=PORT=8787
Environment=TRUST_PROXY=true
EnvironmentFile=$APP_DIR/server/.env
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "$SERVICE"

cat >/etc/nginx/sites-available/$SERVICE <<CONF
server {
  listen 80;
  server_name ${DOMAIN:-_};
  client_max_body_size 1m;
  root $SITE_DIR;
  index index.html;

  location ~ ^/(api/|table$|export\.csv$|health$) {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
  location / { try_files \$uri \$uri/ /index.html; }
  location ~* \.(jpg|jpeg|png|webp|svg|ico|css|js)$ { expires 7d; add_header Cache-Control "public"; }
}
CONF
ln -sf /etc/nginx/sites-available/$SERVICE /etc/nginx/sites-enabled/$SERVICE
nginx -t
systemctl reload nginx

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || true
fi

echo "Deployment complete."
echo "Health: http://${DOMAIN:-SERVER_IP}/health"
echo "Admin:  http://${DOMAIN:-SERVER_IP}/table?token=<ADMIN_TOKEN>"
