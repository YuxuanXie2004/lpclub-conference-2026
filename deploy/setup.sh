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
if [ "$(node -p "process.versions.node.split('.')[0]")" -lt 22 ]; then
  echo "ERROR: Node.js 22 or newer is required. Upgrade Node before continuing."
  exit 1
fi
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund
mkdir -p "$APP_DIR/data"
# Persistent originals are separate from the public site and disposable cache.
mkdir -p "$APP_DIR/data/material-originals"
chmod 700 "$APP_DIR/data/material-originals"
if [ ! -f "$APP_DIR/server/.env" ]; then
  cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
  echo "ERROR: created $APP_DIR/server/.env. Set ADMIN_USERNAME, ADMIN_PASSWORD_HASH and ADMIN_JWT_SECRET, then rerun this script."
  exit 1
fi
if ! node -e "const {loadEnv}=require('./server/env'); const {createAdminAuth}=require('./server/admin-auth'); process.exit(createAdminAuth(loadEnv({...process.env})).configured()?0:1)"; then
  echo "ERROR: configure ADMIN_PASSWORD_HASH and ADMIN_JWT_SECRET in $APP_DIR/server/.env before starting production."
  exit 1
fi

# Initialize only the explicitly configured MySQL database before starting.
npm run db:init

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

  location ~ ^/api/materials/upload/(card|portrait|logo)$ {
    client_max_body_size 6m;
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
  location ~ ^/(api/|login$|table$|pricing-admin$|pricing$|vip-codes$|materials$|materials-admin$|export\.csv$|health$) {
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
echo "Admin:  http://${DOMAIN:-SERVER_IP}/login"
