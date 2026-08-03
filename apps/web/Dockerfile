# syntax=docker/dockerfile:1
# reliat — Next.js app container. Pinned Node + pnpm, frozen lockfile,
# standalone output. Multi-stage so the runtime image ships no dev deps.

FROM node:20.11.1-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# --- deps: install once, cached until lockfile changes ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- builder: build with the API base baked in (NEXT_PUBLIC_* is compiled
# into the client bundle, so it must be a build arg, not a runtime env var) ---
FROM base AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- runner: standalone server only ---
FROM node:20.11.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
