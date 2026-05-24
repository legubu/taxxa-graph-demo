# syntax=docker/dockerfile:1.7
# Multi-stage build for the Next.js app, using output: "standalone".
# Image stays small because only the traced runtime files are copied
# into the final stage — no full node_modules.

ARG NODE_VERSION=22-alpine

# ---- deps: install production-shape dependencies ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder: build the Next.js app ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for the runtime process.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone bundle: server.js + the minimal subset of node_modules
# that NFT traced as actually needed at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets and public/ are not included in standalone by default;
# server.js will serve them when placed at these paths.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# API keys (VOYAGE_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, VOYAGE_MODEL)
# are intentionally NOT baked into the image. They are supplied at runtime
# via `docker run --env-file .env` or docker-compose `env_file:`.

CMD ["node", "server.js"]
