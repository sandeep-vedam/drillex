# apps/api — NestJS + Prisma. Build from the monorepo root: `docker build -f infra/docker/api.Dockerfile .`
FROM node:20-slim AS base
RUN corepack enable
# openssl must be present so `prisma generate` correctly detects the engine target
# (debian-openssl-3.0.x, matching the runner stage) instead of guessing 1.1.x.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @drillex/shared build \
 && pnpm --filter @drillex/api exec prisma generate \
 && pnpm --filter @drillex/api build \
 && pnpm deploy --filter @drillex/api --prod /out \
 && cd /out && node_modules/.bin/prisma generate

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/prisma ./prisma
COPY --from=build /out/package.json ./package.json
EXPOSE 4000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/src/main.js"]
