#!/usr/bin/env bash
# Build and (re)start everything on the server. Run from the repo root:
#
#   bash deploy/deploy.sh            # uses the code already checked out
#   bash deploy/deploy.sh --pull     # git pull first
set -euo pipefail
cd "$(dirname "$0")/.."

for app in web clinic automation; do
  if [ ! -f "apps/$app/.env" ]; then echo "Missing apps/$app/.env — create it first (see deploy/README.md)"; exit 1; fi
done

if [ "${1:-}" = "--pull" ]; then git pull --ff-only; fi

echo "== Redis"
docker compose -f apps/automation/docker-compose.yml up -d

echo "== install"
pnpm install --frozen-lockfile

echo "== build (one app at a time — three at once runs a 4 GB server out of memory)"
export NODE_OPTIONS="--max-old-space-size=3072"
for app in web clinic automation; do
  echo "-- $app"
  pnpm --filter "./apps/$app" build
done

echo "== start / reload"
if pm2 describe web >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save
pm2 status
