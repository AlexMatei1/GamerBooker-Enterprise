# ==============================================================================
# GamerBooker Enterprise v1.0 — Production Backend Dockerfile
# Multi-stage optimized Node 20 Alpine image
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

RUN npm run build
RUN npm prune --production

# ==============================================================================
# Production Runtime Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000

# Create unprivileged user for security
RUN addgroup -S gamerbooker && adduser -S gamerbooker -G gamerbooker

COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY migrations/ ./migrations/
COPY db/ ./db/
COPY scripts/ ./scripts/

USER gamerbooker

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/docs/ || exit 1

CMD ["node", "dist/main.js"]
