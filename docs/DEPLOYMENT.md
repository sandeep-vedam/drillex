# Deploying Drillex Ops on a new server

One Linux server runs everything: MySQL 8, the NestJS API, the Next.js web app,
and nginx in front. No Docker, no Redis, no object storage service.

## What you need first

- A fresh **Ubuntu 22.04 or 24.04** server with root (or sudo) SSH access.
  Any provider works — Hostinger KVM, DigitalOcean, Hetzner, Contabo, EC2.
- **2 GB RAM minimum.** The Next.js production build runs on the server and is
  killed by the kernel at 1 GB. If you only have 1 GB, add swap first (below).
- Ports **22, 80, 443** reachable. Nothing else needs to be public — MySQL stays
  bound to localhost.
- The code merged to `master` on GitHub. The installer clones the default
  branch; if you are testing an unmerged branch, check it out after step 1.

### 1 GB server: add swap before you start

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Step 1 — Provision the server (once)

As root on the fresh server:

```bash
curl -fsSL https://raw.githubusercontent.com/sandeep-vedam/drillex/master/infra/setup-vps.sh | bash
```

This installs Node 20, MySQL 8, nginx, pnpm and PM2; creates the `drillex`
database and the `drillex@localhost` user; opens only 22/80/443 in ufw; clones
the repo to `/opt/drillex`; and wires the nginx site.

**It prints a generated MySQL password at the end. Copy it now** — it is not
saved anywhere.

## Step 2 — Configure

```bash
cd /opt/drillex/infra
cp .env.prod.example .env.prod
nano .env.prod
```

Fill in:

| Variable | Value |
| --- | --- |
| `SERVER_IP` | This server's public IP |
| `MYSQL_PASSWORD` | The password printed in step 1 |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 32` (a different one) |

The API refuses to start with weak JWT secrets, so generate them properly.
Everything else has a working default: attachments go to local disk under
`UPLOAD_DIR`, and email/push stay disabled until you fill in `SMTP_*`/`FCM_*`.

## Step 3 — Deploy

```bash
./deploy.sh
```

Pulls the latest code, builds `shared`, the API and the web app, writes
`apps/api/.env`, runs `prisma migrate deploy` (which creates all 26 tables on
the empty database), starts both Node processes under PM2, and reloads nginx.

## Step 4 — Create the first users (once)

```bash
cd /opt/drillex/apps/api && node --import tsx prisma/seed.ts
```

Creates ADM001, MGR001, SUP001, TEC001 and OPR001 with the password
`Password123`. **Sign in as ADM001 and change it immediately.** Managers and
admins are prompted to enrol in 2FA on first web sign-in.

Optional realistic sample data: `node --import tsx prisma/demo.ts`.

## Step 5 — Verify

```bash
curl http://<SERVER_IP>/api/v1/health   # -> {"ok":true,...}
pm2 status                              # drillex-api and drillex-web both online
```

Then open `http://<SERVER_IP>` in a browser and sign in as ADM001.

## If you cannot run the migration on the server

Some hosts give you a MySQL database and phpMyAdmin, but no way to run Node
tooling against it. For that case the repo ships a ready-made dump:

    infra/drillex-mysql.sql

Import it into an **empty** database — `mysql -u <user> -p <db> < infra/drillex-mysql.sql`,
or phpMyAdmin -> your database -> Import. It creates all 26 tables and the five
starter users, and it contains no session-variable or SUPER-privilege
statements, so it imports as an ordinary restricted database user.

It also marks `0001_init` as applied in `_prisma_migrations`, so `deploy.sh`
later sees an up-to-date database instead of trying to recreate every table.
Skip step 4 (seeding) if you import this file — the users are already in it.

## Redeploying

```bash
cd /opt/drillex/infra && ./deploy.sh
```

That is the entire release loop — it pulls, rebuilds, migrates and restarts.

## Adding a domain and HTTPS

1. Point an A record at the server's IP and wait for it to resolve.
2. `apt-get install -y certbot python3-certbot-nginx && certbot --nginx`
3. Set `PUBLIC_ORIGIN=https://your.domain` in `infra/.env.prod`.
4. `./deploy.sh`

Step 3 matters: the browser bundle bakes in the API URL at **build time**, and
CORS on the API is derived from the same value. Installing the certificate
without redeploying leaves a site that loads over HTTPS but cannot reach its
own backend.

## Operating it

```bash
pm2 logs drillex-api          # application logs
pm2 restart drillex-api       # restart one process
mysqldump -u drillex -p drillex > backup-$(date +%F).sql
```

Back up **both** the database and the `UPLOAD_DIR` directory — attachments and
generated reports live on disk, not in MySQL.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Build killed partway through | Out of RAM. Add swap (see above). |
| `P1001: can't reach database` | MySQL not running (`systemctl status mysql`) or `MYSQL_PASSWORD` does not match the user created in step 1. |
| Site loads, every request fails | `PUBLIC_ORIGIN`/`SERVER_IP` does not match the URL in the address bar. Fix `.env.prod` and redeploy — a rebuild is required. |
| 502 from nginx | The Node process is down. `pm2 status`, then `pm2 logs`. |
| Migration says already applied | Expected on redeploys; `prisma migrate deploy` is idempotent. |
