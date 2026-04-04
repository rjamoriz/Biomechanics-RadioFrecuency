#!/usr/bin/env bash
set -euo pipefail

echo "==> Biomechanics RF Platform Setup"

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
fi

echo "==> Installing web dependencies"
cd apps/web && npm install && cd ../..

echo "==> Installing gateway dependencies"
cd apps/gateway && npm install && cd ../..

echo "==> Installing shared-types dependencies"
cd packages/shared-types && npm install && cd ../..

echo "==> Starting PostgreSQL"
docker compose up -d postgres
sleep 3

echo "==> Setup complete. Run 'make dev' to start all services."
