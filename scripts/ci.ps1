# Continuous Integration script for Windows PowerShell
$ErrorActionPreference = "Continue"

Write-Host "=========================================================="
Write-Host " GamerBooker Enterprise v1.0 - Verification & Build Runner "
Write-Host "=========================================================="

# Check if Docker Desktop engine is running
Write-Host "Checking Docker daemon status..."
$null = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Docker Desktop is NOT running!" -ForegroundColor Red
    Write-Host "👉 Please launch 'Docker Desktop' from your Windows Start Menu." -ForegroundColor Yellow
    Write-Host "👉 Wait until Docker Desktop shows 'Engine running' (green icon in the system tray)." -ForegroundColor Yellow
    Write-Host "👉 Then run this script again: .\scripts\ci.ps1" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Bring up the PostgreSQL container
Write-Host "Ensuring fresh PostgreSQL container via Docker Compose..."
docker compose down -v
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start PostgreSQL container." -ForegroundColor Red
    exit 1
}

# Wait for the DB port (5433) to become reachable (max 30 seconds)
$maxAttempts = 30
$dbUp = $false
for ($i = 1; $i -le $maxAttempts; $i++) {
    Write-Host "Waiting for database on port 5433 (attempt $i/$maxAttempts)..."
    try {
        $tcpResult = Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue
        if ($tcpResult.TcpTestSucceeded) {
            Write-Host "✅ PostgreSQL is accepting connections on port 5433." -ForegroundColor Green
            $dbUp = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 1
}

if (-not $dbUp) {
    Write-Host "❌ PostgreSQL container did not become reachable in time on port 5433." -ForegroundColor Red
    exit 1
}

# Allow PostgreSQL 2 seconds to initialize internal cluster
Start-Sleep -Seconds 2

# Set standard environment variables for migrations and tests
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:5433/gamerbooker_dev"
$env:ADMIN_DATABASE_URL = "postgresql://postgres@127.0.0.1:5433/postgres"
$env:MIGRATION_DATABASE_URL = "postgresql://postgres@127.0.0.1:5433/gamerbooker_dev"
$env:MFA_SECRET_KEY = "test-mfa-key-0123456789abcdef0123456789"
$env:NODE_ENV = "test"

# 1. Apply migrations
Write-Host "Applying database migrations..." -ForegroundColor Cyan
node db/migrate.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Database migrations failed." -ForegroundColor Red
    exit 1
}

# 2. Load fixture seeds
Write-Host "Loading fixture seeds..." -ForegroundColor Cyan
npx ts-node scripts/seed.ts
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Seeding failed." -ForegroundColor Red
    exit 1
}

# 3. Lint checks
Write-Host "Running ESLint..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ESLint failed." -ForegroundColor Red
    exit 1
}

# 4. Typecheck
Write-Host "Running TypeScript typecheck..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Typecheck failed." -ForegroundColor Red
    exit 1
}

# 5. Full test suite
Write-Host "Running Jest test suite..." -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Jest test suite failed." -ForegroundColor Red
    exit 1
}

# 6. Build
Write-Host "Building NestJS application..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ NestJS build failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 SUCCESS! All migrations, seeds, tests, and release build completed." -ForegroundColor Green
