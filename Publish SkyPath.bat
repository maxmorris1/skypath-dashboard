@echo off
setlocal
title SkyPath - Publish to GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Git is not installed. Get it from https://git-scm.com/download/win
  echo  then run this file again.
  pause
  exit /b 1
)

git config user.name "maxmorris1"
git config user.email "maxmorris1@users.noreply.github.com"

if not exist ".git" (
  echo  First-time publish: linking this folder to GitHub...
  git init -b main
  git remote add origin https://github.com/maxmorris1/skypath-dashboard.git
)

git add -A
git diff --cached --quiet
if not errorlevel 1 goto pull

set "MSG="
set /p MSG=Describe what changed, then press Enter ^(Enter alone = auto name^): 
if "%MSG%"=="" set "MSG=SkyPath update %DATE% %TIME%"
git commit -m "%MSG%"

:pull
echo  Checking for changes from the other side...
git pull --rebase origin main 2>nul

echo  Pushing to GitHub... ^(first ever push opens a browser - sign in once^)
git push -u origin main
if errorlevel 1 (
  echo.
  echo  Push failed. Usual causes:
  echo   1. The repo does not exist yet - go to https://github.com/new
  echo      Name: skypath-dashboard   Visibility: Public   ^(no README^)
  echo      then run this file again.
  echo   2. A login window appeared and was closed - just run this again.
  pause
  exit /b 1
)

echo.
echo  Published! https://github.com/maxmorris1/skypath-dashboard
pause
