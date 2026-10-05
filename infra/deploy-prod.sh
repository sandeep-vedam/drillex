#!/usr/bin/env bash
# Server half of .github/workflows/deploy-prod.yml, run on the prod box after the workflow has rsynced the source
# into /opt/drillex. Can also be run by hand there: bash /opt/drillex/infra/deploy-prod.sh <label>
#
# Backs up the database and the current builds, rebuilds API + web, migrates, restarts both PM2 processes and
# health-checks them. Any failure restores the previous builds and restarts, so prod keeps serving the old version.
set -euo pipefail
cd "$(dirname "$0")/.."

REV=${1:-manual}
TS=$(date +%Y%m%d-%H%M%S)
BACKUP=~/drillex-deploy-backup-$TS
mkdir -p "$BACKUP"
echo "==> Deploying $REV (backup: $BACKUP)"

echo "==> Backing up database and current builds"
docker exec infra-postgres-1 pg_dump -U drillex drillex | gzip > "$BACKUP/db.sql.gz"
tar -czf "$BACKUP/builds.tgz" --exclude=apps/web/.next/cache apps/api/dist apps/web/.next

rollback() {
  set +e
  echo "!! Deploy of $REV failed — restoring the previous builds" >&2
  rm -rf apps/api/dist apps/web/.next
  tar -xzf "$BACKUP/builds.tgz"
  pm2 restart drillex-api drillex-web --update-env || true
  echo "!! Previous builds restored. Database dump from before the deploy: $BACKUP/db.sql.gz" >&2
  echo "!! If 'prisma migrate deploy' failed, clear its row with: prisma migrate resolve --rolled-back <migration>" >&2
}
DONE=
trap '[ -n "$DONE" ] || rollback' EXIT

echo "==> Installing deps and building"
pnpm install --frozen-lockfile --filter "@drillex/api..." --filter "@drillex/web..."
pnpm --filter @drillex/shared build
pnpm --filter @drillex/api exec prisma generate
pnpm --filter @drillex/api build
# Same-origin behind nginx (web on /, API on /api/), so no host is baked into the client bundle.
NEXT_PUBLIC_API_URL=/api/v1 pnpm --filter @drillex/web build

echo "==> Wiring web standalone static assets"
W=apps/web/.next/standalone/apps/web
mkdir -p apps/web/public
rm -rf "$W/.next/static" "$W/public"
cp -r apps/web/.next/static "$W/.next/static"
cp -r apps/web/public "$W/public"

echo "==> Migrating database"
pnpm --filter @drillex/api exec prisma migrate deploy

echo "==> Restarting"
pm2 restart drillex-api --update-env
pm2 restart drillex-web --update-env

echo "==> Health check"
ok=
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/v1/health && curl -fsS -o /dev/null http://127.0.0.1:3000/login; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { echo "!! API or web did not come up healthy" >&2; exit 1; }

DONE=1
pm2 save >/dev/null
echo "$TS $REV" >> ~/drillex-deploys.log
# Keep the five most recent deploy backups; older ones and any manual backups elsewhere are left alone.
ls -dt ~/drillex-deploy-backup-* | tail -n +6 | xargs -r rm -rf
echo "==> Deployed $REV"
