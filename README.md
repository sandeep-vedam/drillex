# Drillex Ops

Mobile operations & equipment management platform — React Native app (Android-first, iOS), Next.js web dashboard + admin portal, NestJS API.
Plan & budget: [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Layout
- `apps/mobile` — React Native CLI app: login, 15-min idle lock + biometrics, daily readings, shift reports, job cards, maintenance, notifications, reports — **offline-first** (outbox sync, signatures, photos)
- `apps/web` — Next.js: dashboard, asset register, shift production approval, daily readings review, maintenance, job cards, parts inventory, reports, notifications; admin: users, devices, sync conflicts
- `apps/api` — NestJS + Prisma + MySQL: RBAC at API level, JWT + TOTP 2FA, offline `/sync/push`, attachments (S3/local), cron jobs (maintenance reminders, weekly digest, month-end reports), push (FCM v1), email (SMTP)
- `packages/shared` — Zod schemas, enums, RBAC matrix and business rules shared by all three
- `infra/` — VPS setup & deploy scripts (Node + PM2 + nginx + MySQL, no Docker) and k6 load test

## Local development
```bash
corepack enable && pnpm install
brew services start mysql           # local MySQL 8 (Linux: sudo systemctl start mysql)
mysql -u root -e "CREATE DATABASE IF NOT EXISTS drillex CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
                  CREATE USER IF NOT EXISTS 'drillex'@'localhost' IDENTIFIED BY 'drillex';
                  GRANT ALL PRIVILEGES ON drillex.* TO 'drillex'@'localhost'; FLUSH PRIVILEGES;"
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
pnpm --filter @drillex/api prisma migrate deploy
pnpm db:seed                        # ADM001 / MGR001 / SUP001 / TEC001 / OPR001 — password Password123
pnpm db:demo                        # optional: 30 days of realistic readings & shift reports
pnpm --filter @drillex/api dev      # http://localhost:4000/api/v1  · Swagger at /api/docs
pnpm --filter @drillex/web dev      # http://localhost:3000
```
Managers/admins enrol in 2FA on first web sign-in (scan the QR with any authenticator app).

### Mobile
```bash
cd apps/mobile && pnpm android      # Android Studio + emulator/device (API → http://10.0.2.2:4000)
cd ios && bundle install && bundle exec pod install && cd .. && pnpm ios
```
Push notifications: add Firebase files (`android/app/google-services.json`, `ios/GoogleService-Info.plist`, APNs key) and `@react-native-firebase/messaging`, then call `registerPushToken()` (see `src/lib/push.ts`). Server: set `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON`.
Release signing: create `apps/mobile/android/keystore.properties` (git-ignored) — `build.gradle` picks it up automatically.

## Tests & quality
```bash
pnpm typecheck                      # all packages
pnpm test                           # shared rule tests + API integration tests (needs DATABASE_URL, migrated + seeded DB)
k6 run -e API=http://localhost:4000/api/v1 infra/load/k6-smoke.js   # 200-VU load test vs SRS §9.5 thresholds
```
CI (`.github/workflows/ci.yml`) runs install → migrate → seed → typecheck → tests → API/web builds on every push/PR.

## Deploy to a VPS

Full step-by-step runbook for a brand-new server: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

One path: API and web run as PM2-managed Node processes behind nginx, with MySQL
installed natively on the same host. No Docker. Works on any Linux VPS (Hostinger
KVM, DigitalOcean, Hetzner, EC2, Lightsail, …).

nginx is the only thing listening publicly — `/api/` proxies to the API on 4000,
everything else to the web app on 3000. MySQL stays bound to localhost.

```bash
# One-time, as root on a fresh Ubuntu/Debian VPS. Installs Node 20, MySQL 8,
# nginx, pnpm and PM2, creates the database, and prints a generated DB password:
curl -fsSL https://raw.githubusercontent.com/sandeep-vedam/drillex/master/infra/setup-vps.sh | bash

cd /opt/drillex/infra
cp .env.prod.example .env.prod && nano .env.prod   # SERVER_IP, the DB password, generated secrets
./deploy.sh

# Seed the first users once:
cd /opt/drillex/apps/api && node --import tsx prisma/seed.ts
```
Re-run `./deploy.sh` after every `git push` to redeploy — it pulls, builds,
migrates, and reloads PM2 and nginx.

Open only ports 22, 80 and 443 on the provider firewall (`setup-vps.sh` configures
ufw the same way). Once you have a domain pointed at the server, add TLS with
`apt-get install -y certbot python3-certbot-nginx && certbot --nginx`, then set
`PUBLIC_ORIGIN=https://your.domain` in `.env.prod` and redeploy so the web build
and CORS use the new origin.

## Production checklist
- `NODE_ENV=production`, 32+ char `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (server refuses weak secrets), `CORS_ORIGINS`
- `STORAGE_DRIVER=local` writes attachments to `UPLOAD_DIR` — back that directory up with the database, or set `s3` + bucket creds (R2/S3); `SMTP_*` for report email; `FCM_*` for push
- `DEVICE_REGISTRATION_REQUIRED=true` to enforce approved devices (Admin → Devices)
- Regular `mysqldump` backups; TLS via certbot (or at a load balancer); `deploy.sh` runs `prisma migrate deploy` on every release
- Monthly reports run on the 1st at 02:00 UTC; maintenance reminders daily 06:00; weekly digest Monday 07:00
