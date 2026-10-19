# DFA Toolkit Visualizer - Unified Dockerfile
# Works for both development and production

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Try npm ci first (preferred), fallback to npm install if lock file is out of sync
RUN npm ci || npm install --legacy-peer-deps

# Stage 2: Base (for development)
FROM node:20-alpine AS base
WORKDIR /app

# Copy package files first, then full source (packages/ needed for workspace deps)
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY . .

# Install all dependencies (including workspace packages and e.g. xlsx); required for next dev/build
RUN npm install --legacy-peer-deps

ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Application environment variables (can be overridden via docker-compose or docker run)
ENV APP_BASE_ID=DTK_VIZ
ENV NEXT_PUBLIC_APP_BASE_ID=DTK_VIZ
ENV APP_ID=DFATSTVIZ
ENV NEXT_PUBLIC_APP_ID=DFATSTVIZ
ENV NEXT_PUBLIC_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=https://test.api.dfa6.dataforall.org
ENV NEXT_PUBLIC_ENABLE_API_PROXY=true
ENV NEXT_PUBLIC_API_PROXY_URL=https://test.api.dfa6.dataforall.org
ENV NEXT_PUBLIC_API_KEY=dfa_viz_fed_app
ENV NEXT_PUBLIC_ENABLE_API_PROXY=true

# Label for project identification
LABEL name="DFA Toolkit Visualizer"
LABEL description="DFA Toolkit Visualizer - Next.js Application"

# Default command (development mode)
# Override in docker-compose or docker run for production
# CMD ["npm", "run", "dev"]

# Stage 3: Builder (for production)
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 4: Runner (for production)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Standalone output does not include public/ — copy it so /images/* and favicon are served
COPY --from=builder /app/public ./public

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

LABEL name="DFA Toolkit Visualizer"
LABEL description="DFA Toolkit Visualizer - Production Build"

CMD ["node", "server.js"]