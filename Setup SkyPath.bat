@echo off
title SkyPath - First-time install
echo  ================================================
echo   SkyPath Companion Dashboard - one-time install
echo  ================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo  Git is not installed yet.
  echo  1. Install it from https://git-scm.com/download/win ^(default options are fine^)
  echo  2. Run this file again.
  pause
  exit /b 1
)

if exist "%USERPROFILE%\skypath-dashboard\Start SkyPath.bat" (
  echo  Already installed in %USERPROFILE%\skypath-dashboard
  echo  Use "Start SkyPath.bat" there, or "Update SkyPath.bat" to get the latest.
  pause
  exit /b 0
)

echo  Downloading from GitHub...
git clone https://github.com/maxmorris1/skypath-dashboard.git "%USERPROFILE%\skypath-dashboard"
if errorlevel 1 (
  echo  Clone failed - check your internet and that the repo exists.
  pause
  exit /b 1
)

echo.
echo  Installed to %USERPROFILE%\skypath-dashboard
echo  Next: double-click "Start SkyPath.bat" in that folder.
start "" explorer "%USERPROFILE%\skypath-dashboard"
pause
