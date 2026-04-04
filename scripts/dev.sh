#!/usr/bin/env bash
set -euo pipefail

echo "==> Starting all services in dev mode"

docker compose up -d postgres
sleep 3

echo "==> Starting backend"
cd apps/backend && ./gradlew bootRun &
BACKEND_PID=$!

sleep 5

echo "==> Starting gateway"
cd apps/gateway && npm run start:dev &
GATEWAY_PID=$!

echo "==> Starting web"
cd apps/web && npm run dev &
WEB_PID=$!

echo "==> All services started"
echo "    Web:     http://localhost:3000"
echo "    Backend: http://localhost:8080"
echo "    Gateway: http://localhost:3001"

trap "kill $BACKEND_PID $GATEWAY_PID $WEB_PID 2>/dev/null" EXIT
wait
