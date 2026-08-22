# Drillex Ops

Mobile operations & equipment management platform — React Native app (Android-first, iOS), Next.js web dashboard + admin portal, NestJS API.
Plan & budget: [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Layout
- `apps/mobile` — React Native CLI app: login, 15-min idle lock + biometrics, daily readings, shift reports, job cards, maintenance, notifications, reports — **offline-first** (outbox sync, signatures, photos)
- `apps/web` — Next.js: dashboard, asset register, shift production approval, daily readings review, maintenance, job cards, parts inventory, reports, notifications; admin: users, devices, sync conflicts
- `apps/api` — NestJS + Prisma + PostgreSQL: RBAC at API level, JWT + TOTP 2FA, offline `/sync/push`, attachments (S3/local), cron jobs (maintenance reminders, weekly digest, month-end reports), push (FCM v1), email (SMTP)
- `packages/shared` — Zod schemas, enums, RBAC matrix and business rules shared by all three
- `infra/` — docker-compose (Postgres, Redis, MinIO) and k6 load test

## Local development
```bash
corepack enable && pnpm install
pnpm infra:up                       # or use a local Postgres 16 (brew services start postgresql@16)
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

Two options — pick one per server. Works on any Linux VPS (Lightsail, Hostinger KVM, DigitalOcean, Hetzner, EC2, …).

### Option A — bare Node + PM2 + nginx (recommended)
Only Postgres/Redis/MinIO run in Docker (bound to `127.0.0.1`); the API and web app run as plain Node processes under PM2, with nginx reverse-proxying everything through port 80/443 only — `/api/` → the API, everything else → the web app. No other ports need to be public.
```bash
# One-time, as root on a fresh Ubuntu VPS:
curl -fsSL https://get.docker.com | sh && systemctl enable --now docker
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs nginx
corepack enable && corepack prepare pnpm@9.15.4 --activate && npm install -g pm2
git clone https://github.com/sandeep-vedam/drillex.git /opt/drillex
cd /opt/drillex/infra
cp .env.prod-ip.example .env.prod-ip && nano .env.prod-ip   # fill in SERVER_IP + generated secrets
ln -sf /opt/drillex/infra/nginx-drillex.conf /etc/nginx/sites-available/drillex
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/drillex /etc/nginx/sites-enabled/drillex

# Then, and on every redeploy:
./deploy-baremetal.sh
```
Open Lightsail/VPS firewall ports 22, 80, 443 only. If you later get a domain, add TLS via `certbot --nginx`.

### Option B — Docker Compose + Caddy (auto-HTTPS for a domain)
Everything (Postgres, Redis, MinIO, API, web, Caddy) runs in containers; Caddy auto-issues Let's Encrypt certs for whatever domains you point at it.
```bash
# On a fresh Ubuntu/Debian VPS, as root:
curl -fsSL https://raw.githubusercontent.com/sandeep-vedam/drillex/master/infra/setup-vps.sh | bash
# Point DNS A records for api.yourdomain.com and app.yourdomain.com at the VPS IP, then:
cd /opt/drillex/infra
cp .env.prod.example .env.prod && nano .env.prod   # fill in your domains + generated secrets
./deploy.sh
```
`deploy.sh` builds and starts everything including Caddy. Re-run `./deploy.sh` after `git push` to redeploy. See `infra/docker-compose.prod.yml`. (For a no-domain, plain-HTTP variant of this same containerized approach, see `infra/docker-compose.prod-ip.yml`.)

## Production checklist
- `NODE_ENV=production`, 32+ char `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (server refuses weak secrets), `CORS_ORIGINS`
- `STORAGE_DRIVER=s3` + bucket creds (MinIO/R2/S3); `SMTP_*` for report email; `FCM_*` for push
- `DEVICE_REGISTRATION_REQUIRED=true` to enforce approved devices (Admin → Devices)
- Managed Postgres with backups; TLS termination (TLS 1.3) at the load balancer; run `prisma migrate deploy` on release
- Monthly reports run on the 1st at 02:00 UTC; maintenance reminders daily 06:00; weekly digest Monday 07:00
