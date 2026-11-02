#!/usr/bin/env bash
# ==============================================================================
# GamerBooker Enterprise v1.0 — Production Deployment Script
# ==============================================================================
set -euo pipefail

echo "================================================================="
echo "   GamerBooker Enterprise v1.0 — Cloud Production Deployment"
echo "================================================================="

# 1. Check Docker & Docker Compose
command -v docker >/dev/null 2>&1 || { echo "Error: Docker is not installed." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Error: docker compose plugin is not installed." >&2; exit 1; }

# 2. Build and start services
echo "-> Building and launching production containers..."
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d postgres redis

echo "-> Waiting for PostgreSQL to pass health checks..."
until docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U postgres; do
  sleep 2
done

echo "-> Applying database migrations..."
docker compose -f docker-compose.prod.yml run --rm backend node db/migrate.js

echo "-> Starting remaining services (Backend, Dashboard, Mobile, Gateway)..."
docker compose -f docker-compose.prod.yml up -d

echo "================================================================="
echo "   Deployment Complete!"
echo "   - Edge Gateway:      http://localhost/"
echo "   - Venue Dashboard:   http://localhost/dashboard/ or http://localhost:5173"
echo "   - Customer Mobile:   http://localhost/ or http://localhost:5174"
echo "   - Backend API & Docs http://localhost:3000/docs/"
echo "================================================================="
