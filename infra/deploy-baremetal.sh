#!/usr/bin/env bash
# Bare-metal deploy: MySQL/Redis/MinIO in Docker, API + web as PM2-managed Node
# processes, nginx reverse-proxying everything through port 80/443 only.
#
# One-time setup (as root/sudo on a fresh Ubuntu VPS):
#   curl -fsSL https://get.docker.com | sh && systemctl enable --now docker
#   curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs nginx
#   corepack enable && corepack prepare pnpm@9.15.4 --activate
#   npm install -g pm2
#   git clone <repo> /opt/drillex
#   cp /opt/drillex/infra/.env.prod-ip.example /opt/drillex/infra/.env.prod-ip && edit it
#   ln -sf /opt/drillex/infra/nginx-drillex.conf /etc/nginx/sites-available/drillex
#   rm -f /etc/nginx/sites-enabled/default
#   ln -sf /etc/nginx/sites-available/drillex /etc/nginx/sites-enabled/drillex
#
# Then, and on every redeploy, run this script from infra/:
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.prod-ip ]; then
  echo "Missing infra/.env.prod-ip — copy .env.prod-ip.example and fill in real values first." >&2
  exit 1
fi
source .env.prod-ip

echo "==> Pulling latest code"
git -C .. pull --ff-only

echo "==> Starting/updating stateful infra (MySQL, Redis, MinIO)"
docker compose -f docker-compose.infra.yml --env-file .env.prod-ip up -d

echo "==> Installing deps and building"
cd ..
pnpm install
pnpm --filter @drillex/shared build
pnpm --filter @drillex/api exec prisma generate
pnpm --filter @drillex/api build
NEXT_PUBLIC_API_URL="http://${SERVER_IP}/api/v1" pnpm --filter @drillex/web build

echo "==> Wiring web standalone static assets"
cd apps/web
mkdir -p public
rm -rf .next/standalone/apps/web/.next/static .next/standalone/public
cp -r .next/static .next/standalone/apps/web/.next/static
cp -r public .next/standalone/public
cd ../..

echo "==> Writing apps/api/.env"
cat > apps/api/.env <<EOF
DATABASE_URL=mysql://drillex:${MYSQL_PASSWORD}@127.0.0.1:3306/drillex
REDIS_URL=redis://127.0.0.1:6379
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
STORAGE_DRIVER=s3
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=drillex
S3_ACCESS_KEY=${S3_ACCESS_KEY}
S3_SECRET_KEY=${S3_SECRET_KEY}
PORT=4000
PUBLIC_API_URL=http://${SERVER_IP}/api/v1
DEVICE_REGISTRATION_REQUIRED=${DEVICE_REGISTRATION_REQUIRED:-true}
CORS_ORIGINS=http://${SERVER_IP}
NODE_ENV=production
EOF
chmod 600 apps/api/.env

echo "==> Ensuring the MinIO bucket exists"
docker run --rm --network infra_default \
  -e MC_HOST_local="http://${S3_ACCESS_KEY}:${S3_SECRET_KEY}@minio:9000" \
  minio/mc mb --ignore-existing local/drillex || true

echo "==> Migrating database"
cd apps/api && npx prisma migrate deploy && cd ../..

echo "==> Restarting app processes"
pm2 startOrReload infra/ecosystem.config.js
pm2 save

echo "==> Reloading nginx"
sudo nginx -t && sudo systemctl reload nginx

echo
echo "Deployed. http://${SERVER_IP}"
echo "Seed demo users once, manually: cd apps/api && node --import tsx prisma/seed.ts"
