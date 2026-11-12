@echo off
echo ===================================================
echo   GamerBooker Enterprise - Pornire Mediu Demo
echo ===================================================
echo.

echo 1. Se porneste baza de date PostgreSQL 17 (port 5433)...
start /b "PostgreSQL" "C:\Users\alexm\AppData\Local\Temp\opencode\pg17full\pgsql\bin\postgres.exe" -D "C:\Program Files\PostgreSQL\17\data" -p 5433
timeout /t 3 /nobreak >nul

echo 2. Se porneste serverul de backend NestJS (port 3000)...
start /b "Backend API" node tools/local-auth/start-api.cjs start
timeout /t 5 /nobreak >nul

echo 3. Se porneste Venue Dashboard (port 5173)...
start /b "Dashboard" npm --prefix apps/venue-dashboard run dev
timeout /t 3 /nobreak >nul

echo 4. Se configureaza conexiunea USB cu telefonul Android...
adb start-server
adb -s CNXNU20922109640 reverse tcp:3000 tcp:3000

echo.
echo ===================================================
echo   Gata! Toate serviciile sunt active:
echo   - Web Dashboard:  http://localhost:5173
echo   - Backend API:    http://127.0.0.1:3000
echo   - Telefon Android conectat prin ADB Reverse
echo ===================================================
echo.
pause
