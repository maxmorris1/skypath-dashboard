#!/bin/bash
# Publish the dashboard to GitHub. Usage: ./publish.sh <github-token> ["commit message"]
# The token is used in-memory only and never written to disk or .git/config.
set -e
REPO="maxmorris1/skypath-dashboard"
cd /home/user/skypath-dashboard
git config user.name "maxmorris1"
git config user.email "maxmorris1@users.noreply.github.com"
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:$1@github.com/$REPO.git"
git add -A
git diff --cached --quiet || git commit -q -m "${2:-SkyPath dashboard update}"
git push -u origin main
git remote remove origin
echo "published to https://github.com/$REPO"
