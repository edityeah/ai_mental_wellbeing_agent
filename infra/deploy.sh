#!/usr/bin/env bash
# Pull latest code + rebuild + restart all containers.
# Run from /opt/wellbeing on the VM as the deploy user.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "── Pulling latest code ──"
git fetch origin
git reset --hard origin/main

echo "── Building + restarting containers ──"
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

echo "── Cleaning old images ──"
docker image prune -f

echo "── Status ──"
docker compose -f docker-compose.prod.yml ps
