#!/bin/bash
set -euo pipefail

TIME=$(date)
WORKING_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$WORKING_DIR"

sudo timedatectl set-timezone Asia/Kolkata || true

echo "#########################################"
echo "#   HobbyFlow build"
echo "#   Time = ${TIME}"
echo "#   Dir  = ${WORKING_DIR}"
echo "#########################################"

if [ ! -f .env ]; then
  echo "ERROR: .env is missing (workflow should write secrets.PROD_ENV)"
  exit 1
fi

npm ci
npm run build

echo "Build complete"
