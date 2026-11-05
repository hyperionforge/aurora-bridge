@echo off
rem Starship Aurora - host the bridge on this Windows laptop
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Download the LTS version from https://nodejs.org
  echo  install it, then double-click this file again.
  echo.
  pause
  exit /b
)
if not exist node_modules\ws (
  echo Installing - first run only...
  call npm install --no-audit --no-fund
)
start "" http://localhost:8737/
node server\dev-server.mjs
pause
