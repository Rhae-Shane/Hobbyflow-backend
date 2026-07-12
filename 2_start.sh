#!/bin/bash
set -euo pipefail

TIME=$(date)
WORKING_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$WORKING_DIR"

sudo timedatectl set-timezone Asia/Kolkata || true

echo "#########################################"
echo "#   HobbyFlow start"
echo "#   Time = ${TIME}"
echo "#   Dir  = ${WORKING_DIR}"
echo "#########################################"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing pm2..."
  npm install -g pm2
fi

# Restart if already running; otherwise start fresh
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "API status:"
pm2 status hobbyflow-api

curl -fsS http://127.0.0.1:3000/health || {
  echo "Health check failed"
  pm2 logs hobbyflow-api --lines 40 --nostream
  exit 1
}

echo "Deploy healthy"
