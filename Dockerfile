FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/keypair-store/package.json ./packages/keypair-store/
RUN pnpm install --frozen-lockfile

# ---- builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/keypair-store/node_modules ./packages/keypair-store/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=true
# NEXT_PUBLIC_ vars are baked into the bundle at build time — pass via --build-arg
ARG NEXT_PUBLIC_DIVER_PIN
ARG NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_DIVER_PIN=$NEXT_PUBLIC_DIVER_PIN
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
RUN pnpm --filter web build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
