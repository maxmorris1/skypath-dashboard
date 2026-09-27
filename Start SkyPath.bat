@echo off
title SkyPath Companion Dashboard
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  Install the LTS version from https://nodejs.org then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo  [skypath] starting dashboard...
echo  Browser will open at http://localhost:3000
echo  Keep this window open while playing. Close it (or press Ctrl+C) to stop.
echo.

start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

node server.js
echo.
echo  [skypath] dashboard stopped.
pause
