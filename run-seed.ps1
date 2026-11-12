# PowerShell script to run the seed-demo.js script
# This script handles the node execution properly

$ErrorActionPreference = "Stop"

Write-Host "Current directory: $(Get-Location)"

# Check if seed-demo.js exists
if (-not (Test-Path "seed-demo.js")) {
    Write-Host "ERROR: seed-demo.js not found!" -ForegroundColor Red
    exit 1
}

# Check if node is available
try {
    $nodeVersion = node --version
    Write-Host "Node version: $nodeVersion"
} catch {
    Write-Host "ERROR: Node.js is not available or not in PATH!" -ForegroundColor Red
    exit 1
}

# Check if pg module is available
try {
    $testResult = node -e "require('pg')"
    Write-Host "pg module is available"
} catch {
    Write-Host "ERROR: pg module is not available!" -ForegroundColor Red
    Write-Host "Available modules:" -ForegroundColor Yellow
    node -e "console.log(Object.keys(require('module')._cache).filter(k => !k.startsWith('.')))" 2>$null
    exit 1
}

# Run the seed script
Write-Host "Running seed-demo.js..." -ForegroundColor Green
try {
    & node seed-demo.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: seed-demo.js exited with code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
catch {
    Write-Host "ERROR: Failed to run seed-demo.js: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Seed script completed successfully!" -ForegroundColor Green