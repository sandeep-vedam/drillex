#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu/Debian VPS (Hostinger KVM, DigitalOcean, Hetzner, EC2, …).
# Installs Node 20, MySQL 8, nginx, pnpm and PM2 natively — no Docker.
# Run as root: curl -fsSL <raw-url-to-this-file> | bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/drillex}"
REPO_URL="${REPO_URL:-https://github.com/sandeep-vedam/drillex.git}"
DEPLOY_USER="${SUDO_USER:-$(whoami)}"

echo "==> Installing Node 20, MySQL 8, nginx, git"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update -y
apt-get install -y nodejs mysql-server nginx git ufw

echo "==> Enabling MySQL and nginx on boot"
systemctl enable --now mysql nginx

echo "==> Installing pnpm and PM2"
corepack enable
corepack prepare pnpm@9.15.4 --activate
npm install -g pm2

echo "==> Firewall: SSH, HTTP, HTTPS only (MySQL stays on localhost)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Creating the drillex database and user"
DB_PASSWORD="${MYSQL_PASSWORD:-$(openssl rand -hex 16)}"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS drillex CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'drillex'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON drillex.* TO 'drillex'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> Cloning the repo into $APP_DIR"
if [ ! -d "$APP_DIR" ]; then git clone "$REPO_URL" "$APP_DIR"; fi
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

echo "==> Wiring nginx"
ln -sf "$APP_DIR/infra/nginx-drillex.conf" /etc/nginx/sites-available/drillex
ln -sf /etc/nginx/sites-available/drillex /etc/nginx/sites-enabled/drillex
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

cat <<EOF

==> VPS is ready. MySQL is listening on localhost only.

Your generated database password (save it now — it is not stored anywhere):
    ${DB_PASSWORD}

Next:
  1. cd $APP_DIR/infra
  2. cp .env.prod.example .env.prod && nano .env.prod
     - SERVER_IP=$(curl -s ifconfig.me || echo '<this VPS IP>')
     - MYSQL_PASSWORD=<the password above>
     - generate each secret with: openssl rand -hex 32
  3. ./deploy.sh
  4. Seed the first users once: cd $APP_DIR/apps/api && node --import tsx prisma/seed.ts

Later, with a domain pointed here: apt-get install -y certbot python3-certbot-nginx && certbot --nginx
EOF
