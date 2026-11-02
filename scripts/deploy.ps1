# ==============================================================================
# GamerBooker Enterprise v1.0 — Windows PowerShell Production Deployment
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   GamerBooker Enterprise v1.0 — Production Deployment" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is required but not installed or not in PATH."
    exit 1
}

# 2. Build images
Write-Host "-> Building and launching production containers..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres redis

Write-Host "-> Waiting for database container..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "-> Applying database migrations..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml run --rm backend node db/migrate.js

Write-Host "-> Starting application services..." -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml up -d

Write-Host "=================================================================" -ForegroundColor Green
Write-Host "   Deployment Complete!" -ForegroundColor Green
Write-Host "   - Edge Gateway:      http://localhost/" -ForegroundColor Green
Write-Host "   - Venue Dashboard:   http://localhost/dashboard/ or http://localhost:5173" -ForegroundColor Green
Write-Host "   - Customer Mobile:   http://localhost/ or http://localhost:5174" -ForegroundColor Green
Write-Host "   - Backend API & Docs http://localhost:3000/docs/" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
