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

if [ ! -f .env ]; then
  echo "ERROR: .env is missing"
  exit 1
fi

GIT_SHA="$(git rev-parse HEAD)"
GIT_SHORT="$(git rev-parse --short HEAD)"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Keep PROD_ENV secrets; refresh deploy markers each release
grep -vE '^(DEPLOY_GIT_SHA|DEPLOY_GIT_SHORT|DEPLOYED_AT)=' .env > .env.tmp
mv .env.tmp .env
{
  echo "DEPLOY_GIT_SHA=${GIT_SHA}"
  echo "DEPLOY_GIT_SHORT=${GIT_SHORT}"
  echo "DEPLOYED_AT=${DEPLOYED_AT}"
} >> .env

echo "Deploy markers: ${GIT_SHORT} @ ${DEPLOYED_AT}"

# Full restart so Node reloads .env + new dist/
pm2 delete hobbyflow-api >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --update-env
pm2 save

echo "API status:"
pm2 status hobbyflow-api

echo "Waiting for health..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:3000/health" >/tmp/hobbyflow-health.json 2>/dev/null; then
    echo
    cat /tmp/hobbyflow-health.json
    echo
    echo "Version:"
    curl -fsS "http://127.0.0.1:3000/version" || true
    echo
    echo "Deploy healthy (${GIT_SHORT})"
    exit 0
  fi
  sleep 1
done

echo "Health check failed after 30s"
pm2 logs hobbyflow-api --lines 60 --nostream
exit 1
