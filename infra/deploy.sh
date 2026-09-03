#!/usr/bin/env bash
# Deploy or redeploy the full stack (MySQL, Redis, MinIO, API, web, Caddy) on this VPS.
# Run from infra/ after infra/.env.prod exists (see .env.prod.example): ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.prod ]; then
  echo "Missing infra/.env.prod — copy .env.prod.example and fill in real values first." >&2
  exit 1
fi

echo "==> Pulling latest code"
git -C .. pull --ff-only

echo "==> Building and starting containers"
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "==> Pruning old images"
docker image prune -f

echo "==> Status"
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

source .env.prod
echo
echo "Deployed. API: https://${API_DOMAIN}  Web: https://${WEB_DOMAIN}"
echo "First boot: the API container runs 'prisma migrate deploy' automatically."
echo "Seed demo users once, manually:"
echo "  docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node_modules/.bin/tsx prisma/seed.ts"
