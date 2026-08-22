#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu/Debian VPS (Hostinger KVM VPS, or any provider).
# Run as root (or with sudo) once: curl -fsSL <raw-url-to-this-file> | bash
# or: scp this file up and run it directly.
set -euo pipefail

echo "==> Installing Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Enabling Docker on boot"
systemctl enable --now docker

echo "==> Installing git"
apt-get update -y && apt-get install -y git ufw

echo "==> Firewall: allow SSH, HTTP, HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

DEPLOY_USER="${SUDO_USER:-$(whoami)}"
APP_DIR="/opt/drillex"

echo "==> Cloning the repo into $APP_DIR (edit REPO_URL below if this fails)"
REPO_URL="${REPO_URL:-https://github.com/sandeep-vedam/drillex.git}"
if [ ! -d "$APP_DIR" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

cat <<EOF

==> VPS is ready.

Next steps:
  1. Point your domain's DNS A records at this server's IP:
       api.yourdomain.com -> $(curl -s ifconfig.me || echo '<this VPS IP>')
       app.yourdomain.com -> $(curl -s ifconfig.me || echo '<this VPS IP>')
  2. cd $APP_DIR/infra
  3. cp .env.prod.example .env.prod && nano .env.prod   # fill in your domains + secrets
  4. ./deploy.sh

EOF
