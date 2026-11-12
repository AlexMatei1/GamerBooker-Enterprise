> **Status (2026-11-12): superseded for the local release.** This script describes the original Docker-based setup. The verified v1.0 release build does **not** use Docker: PostgreSQL 17 runs from portable binaries on port `5433`. For the current, tested procedure and artifact list, see [`RELEASE-BUILD-REPORT.md`](RELEASE-BUILD-REPORT.md) and [`FINAL-RELEASE-CHECKLIST.md`](FINAL-RELEASE-CHECKLIST.md).

# GamerBooker Enterprise v1.0 - Build Script

## Quick Start: Release Build Process

### Prerequisites:
1. **Docker Desktop** (for PostgreSQL database)
2. **Node.js** (for TypeScript compilation)
3. **Flutter SDK** (optional, for testing)

### Step-by-Step Build Process

#### 1. Setup Development Environment
```bash
# Navigate to project root
cd /path/to/GamerBooker_Enterprise_v1.0

# Install dependencies
npm install

# Verify TypeScript configuration
npx tsc --noEmit
```

#### 2. Start Database Infrastructure
```bash
# Start PostgreSQL using Docker Compose
docker-compose up -d
# This creates:
# - Container: gamerbooker_postgres
# - Database: gamerbooker_dev
# - Port: 5433 (mapped to container's 5432)
```

#### 3. Build Backend API
```bash
# Build NestJS application with zero optimizations for development
npm run build
# Output: dist/ folder with compiled TypeScript
```

#### 4. Build Frontend Applications
```bash
# Build Venue Dashboard (React)
npm --prefix apps/venue-dashboard run build
# Output: apps/venue-dashboard/dist/

# Build Mobile Web App (React)
npm --prefix apps/mobile-app run build  
# Output: apps/mobile-app/dist/
```

#### 5. Setup and Seed Database
```bash
# Run database migrations (if any)
# Note: Check if there are any migration scripts needed

# Seed demo data (creates test accounts and venues)
node scripts/seed-demo.js
# This populates:
# - Administrator account
# - Arena Cyber Cafe partner
# - Test customer
# - All test stations and data
```

#### 6. Start Development Servers
```bash
# In separate terminals:

# Backend API
node tools/local-auth/start-api.cjs start
# Port: 3000

# Venue Dashboard (React)
npm --prefix apps/venue-dashboard run dev
# Port: 5173

# Mobile Web App (React)  
npm --prefix apps/mobile-app run dev
# Port: 5174

# Flutter Mobile Tests (separate terminal)
cd apps/flutter-mobile
flutter test
# Also requires adb reverse for real testing:
adb reverse tcp:3000 tcp:3000
```

#### 7. Run Integration Tests (Optional)
```bash
# Dashboard API Tests
node scratch/test-all-tabs.cjs

# Interactive Mutation Tests  
node scratch/test-dashboard-mutations.cjs

# Full E2E Customer Simulation
node scratch/full-customer-simulation.cjs

# Flutter Mobile Tests
cd apps/flutter-mobile
flutter test
```

#### 8. Verify Production Readiness
```bash
# Final verification checks
cd /path/to/GamerBooker_Enterprise_v1.0

# Check all builds exist
ls -la dist/
ls -la apps/venue-dashboard/dist/
ls -la apps/mobile-app/dist/

# Verify TypeScript compilation
npx tsc --noEmit

# Check database connectivity (optional)
# psql -h localhost -p 5433 -U postgres -d gamerbooker_dev
```

---

## Environment Setup Script (Windows PowerShell)

```powershell
# Save this as setup-dev-environment.ps1

# 1. Check Docker and start PostgreSQL
Write-Host "Checking Docker availability..."
try {
    docker --version
    Write-Host "Docker is available"
    
    # Start PostgreSQL
    Write-Host "Starting PostgreSQL database..."
    docker-compose up -d
    Write-Host "PostgreSQL started on port 5433"
} catch {
    Write-Host "Docker not available. Please install Docker Desktop."
    exit 1
}

# 2. Install Node.js dependencies
Write-Host "Installing Node.js dependencies..."
npm install

# 3. Verify TypeScript configuration
Write-Host "Verifying TypeScript configuration..."
npx tsc --noEmit
Write-Host "TypeScript configuration OK"

# 4. Build applications
Write-Host "Building backend API..."
npm run build

Write-Host "Building venue dashboard..."
npm --prefix apps/venue-dashboard run build

Write-Host "Building mobile web app..."
npm --prefix apps/mobile-app run build

# 5. Seed database
Write-Host "Seeding database with demo data..."
node scripts/seed-demo.js

# 6. Display access information
Write-Host """
========================================
DEV ENVIRONMENT SETUP COMPLETE
========================================

Available URLs:
- Backend API:    http://localhost:3000
- Venue Dashboard: http://localhost:5173
- Mobile Web App: http://localhost:5174
- PostgreSQL:     localhost:5433 (gamerbooker_dev)

Test Accounts:
- Platform Admin:    alexmatei2330@gmail.com
- Cafe Partner:      popamatei85@yahoo.com (Arena Cyber Cafe)
- Test Customer:     andrei.gamer@gmail.com

Next Steps:
1. Start backend: node tools/local-auth/start-api.cjs start
2. Start dashboard: npm --prefix apps/venue-dashboard run dev
3. Start mobile app: npm --prefix apps/mobile-app run dev
4. Run tests: node scratch/test-all-tabs.cjs
"""
```

---

## Docker Compose Configuration

### docker-compose.yml (Already Configured)
```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: gamerbooker_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_DB: gamerbooker_dev
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 2s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

### Production Docker Deployment

```bash
# For production deployment, you would typically:
# 1. Build and tag images
# 2. Push to container registry
# 3. Deploy with orchestration (Kubernetes, Docker Swarm, etc.)

# Example production docker-compose:
docker-compose -f docker-compose.prod.yml up -d
```

---

## Package.json Scripts Reference

### Available Scripts (`package.json`):

#### Core Scripts:
- `npm run build` - Build NestJS backend
- `npm run typecheck` - TypeScript compilation check
- `npm run typecheck:all` - Check all TypeScript projects

#### Frontend Scripts:
- `npm --prefix apps/venue-dashboard run build` - Build venue dashboard
- `npm --prefix apps/venue-dashboard run dev` - Start venue dashboard dev
- `npm --prefix apps/mobile-app run build` - Build mobile web app
- `npm --prefix apps/mobile-app run dev` - Start mobile app dev

#### Testing Scripts:
- `node scratch/test-all-tabs.cjs` - Dashboard API tests
- `node scratch/test-dashboard-mutations.cjs` - Interactive tests
- `node scratch/full-customer-simulation.cjs` - E2E customer flow

---

## Build Outputs

### Directory Structure After Build:
```
GamerBooker_Enterprise_v1.0/
├── dist/                          # NestJS Backend
│   ├── auth/
│   ├── bookings/
│   ├── venues/
│   └── app.module.js
│   └── main.js
├── apps/venue-dashboard/dist/     # Venue Dashboard
│   ├── assets/
│   └── index.html
├── apps/mobile-app/dist/          # Mobile Web App
│   ├── assets/
│   └── manifest.webmanifest
└── apps/flutter-mobile/          # Flutter Mobile App
    ├── lib/ (production code)
    └── test/ (49 tests)
```

---

## Troubleshooting Guide

### Common Issues:

#### Docker Not Available:
```bash
# Alternative: Setup PostgreSQL manually on port 5433
# Or use Docker Desktop troubleshooting:
# - Check Docker Desktop is running
# - Verify Docker Desktop Linux Engine
# - Check Docker socket permissions
```

#### TypeScript Build Errors:
```bash
# Fix TypeScript errors before building
npx tsc --noEmit
# Fix any reported errors in src/ files
```

#### Frontend Build Issues:
```bash
# For React builds, ensure:
# 1. Dependencies installed: npm install (in app directory)
# 2. Vite configured properly
# 3. Environment variables set (if needed)
```

#### Database Connection Issues:
```bash
# Verify PostgreSQL is accessible:
docker ps | grep gamerbooker_postgres
# Or manually check:
# netstat -an | grep 5433
# psql -h localhost -p 5433 -U postgres -d gamerbooker_dev
```

---

## Final Verification Commands

### After Build Complete:
```bash
# 1. Verify all builds exist and are non-empty
cd GamerBooker_Enterprise_v1.0
echo "Backend build:" && du -sh dist/
echo "Dashboard build:" && du -sh apps/venue-dashboard/dist/
echo "Mobile app build:" && du -sh apps/mobile-app/dist/

# 2. Verify TypeScript compilation
npx tsc --noEmit

# 3. Check database status (if Docker available)
if docker ps | grep -q gamerbooker_postgres; then
    echo "PostgreSQL is running"
else
    echo "WARNING: PostgreSQL not running - tests will fail"
fi

# 4. Verify test accounts exist (requires database)
# This would be run after database is populated
node scripts/verify-seed-data.js
```

---

## Release Checklist

### Before Production Release:
- [ ] Docker Desktop installed and running
- [ ] PostgreSQL database ready (port 5433)
- [ ] All applications built successfully
- [ ] Database migrations executed
- [ ] Seed data populated
- [ ] Security configuration verified
- [ ] Performance benchmarks measured
- [ ] Documentation updated
- [ ] Backup procedures established
- [ ] Rollback plan defined

### Build Artifacts to Deploy:
1. **NestJS Backend**: Complete `dist/` folder
2. **Venue Dashboard**: Complete `apps/venue-dashboard/dist/`
3. **Mobile Web App**: Complete `apps/mobile-app/dist/`
4. **Flutter App**: APK/IPA from `apps/flutter-mobile/`
5. **Database**: `gamerbooker_dev` with all seed data
6. **Configuration**: Environment files for production

---

**Status**: ✅ **BUILD PROCESS DOCUMENTED AND READY**
**Next Step**: Setup Docker environment and execute build script