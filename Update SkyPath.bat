@echo off
title SkyPath - Update from GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Git is not installed. Get it from https://git-scm.com/download/win
  echo  then run this file again.
  pause
  exit /b 1
)

echo  Checking for updates...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo  Update failed. Close the dashboard window if it is open, then retry.
  echo  If you changed files locally and really want to discard those changes,
  echo  run:  git reset --hard origin/main
  pause
  exit /b 1
)

echo.
echo  Up to date. If the dashboard was running, close it and start it again
echo  with "Start SkyPath.bat" so the new version takes effect.
pause
