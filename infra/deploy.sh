#!/usr/bin/env bash
# Deploy or redeploy on a VPS: API + web as PM2-managed Node processes behind nginx.
# MySQL runs natively on the same host (see setup-vps.sh). No Docker anywhere.
#
# One-time setup: run infra/setup-vps.sh on a fresh Ubuntu/Debian VPS, then fill in
# infra/.env.prod. After that, this script is the only command you need per release.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.prod ]; then
  echo "Missing infra/.env.prod — copy .env.prod.example and fill in real values first." >&2
  exit 1
fi
source .env.prod

: "${SERVER_IP:?set SERVER_IP in infra/.env.prod}"
: "${MYSQL_PASSWORD:?set MYSQL_PASSWORD in infra/.env.prod}"
: "${JWT_ACCESS_SECRET:?set JWT_ACCESS_SECRET in infra/.env.prod}"
: "${JWT_REFRESH_SECRET:?set JWT_REFRESH_SECRET in infra/.env.prod}"

# Public origin: a domain if you have one, otherwise the bare IP over plain HTTP.
ORIGIN="${PUBLIC_ORIGIN:-http://${SERVER_IP}}"

echo "==> Pulling latest code"
git -C .. pull --ff-only

echo "==> Installing deps and building"
cd ..
pnpm install --frozen-lockfile
pnpm --filter @drillex/shared build
pnpm --filter @drillex/api exec prisma generate
pnpm --filter @drillex/api build
NEXT_PUBLIC_API_URL="${ORIGIN}/api/v1" pnpm --filter @drillex/web build

echo "==> Wiring web standalone static assets"
cd apps/web
mkdir -p public
rm -rf .next/standalone/apps/web/.next/static .next/standalone/public
cp -r .next/static .next/standalone/apps/web/.next/static
cp -r public .next/standalone/public
cd ../..

echo "==> Writing apps/api/.env"
UPLOAD_DIR="${UPLOAD_DIR:-/opt/drillex/uploads}"
mkdir -p "$UPLOAD_DIR"
cat > apps/api/.env <<EOF
DATABASE_URL=mysql://drillex:${MYSQL_PASSWORD}@127.0.0.1:3306/drillex
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
STORAGE_DRIVER=${STORAGE_DRIVER:-local}
UPLOAD_DIR=${UPLOAD_DIR}
S3_ENDPOINT=${S3_ENDPOINT:-}
S3_BUCKET=${S3_BUCKET:-drillex}
S3_ACCESS_KEY=${S3_ACCESS_KEY:-}
S3_SECRET_KEY=${S3_SECRET_KEY:-}
PORT=4000
PUBLIC_API_URL=${ORIGIN}
FCM_PROJECT_ID=${FCM_PROJECT_ID:-}
FCM_SERVICE_ACCOUNT_JSON=${FCM_SERVICE_ACCOUNT_JSON:-}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-drillex-ops@example.com}
DEVICE_REGISTRATION_REQUIRED=${DEVICE_REGISTRATION_REQUIRED:-true}
CORS_ORIGINS=${ORIGIN}
NODE_ENV=production
EOF
chmod 600 apps/api/.env

echo "==> Migrating database"
cd apps/api && npx prisma migrate deploy && cd ../..

echo "==> Restarting app processes"
pm2 startOrReload infra/ecosystem.config.js
pm2 save

echo "==> Reloading nginx"
sudo nginx -t && sudo systemctl reload nginx

echo
echo "Deployed. ${ORIGIN}"
echo "Seed the first users once: cd apps/api && node --import tsx prisma/seed.ts"
