# Drillex Ops

Mobile operations & equipment management platform — React Native app, web dashboard/admin, NestJS API.
Plan: [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Layout
- `apps/mobile` — React Native CLI app (operators, technicians, supervisors) — Android primary, iOS
- `apps/web` — Next.js (manager dashboard + admin portal)
- `apps/api` — NestJS + Prisma + PostgreSQL (REST, RBAC, sync, jobs)
- `packages/shared` — Zod schemas, enums, RBAC matrix shared by all three

## Getting started
```bash
corepack enable && pnpm install
pnpm infra:up                      # Postgres, Redis, MinIO (needs Docker)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @drillex/api prisma migrate dev --name init
pnpm db:seed                       # users ADM001 / MGR001 / SUP001 / TEC001 / OPR001, password Password123
pnpm --filter @drillex/api dev     # http://localhost:4000/api/v1  (docs at /api/docs)
pnpm --filter @drillex/web dev     # http://localhost:3000
```

### Mobile
```bash
cd apps/mobile
pnpm android                       # needs Android Studio + emulator/device
cd ios && bundle install && bundle exec pod install && cd .. && pnpm ios   # macOS only
```
