#!/usr/bin/env bash
set -euo pipefail

echo "=== Biomechanics Platform Demo Mode ==="
echo ""
echo "Starting services with DEMO_MODE=true..."
echo ""

export DEMO_MODE=true

# Start PostgreSQL
docker compose up -d postgres
echo "Waiting for PostgreSQL..."
sleep 3

# Start backend
cd "$(dirname "$0")/.."
(cd apps/backend && ./gradlew bootRun &)
sleep 5

# Start gateway
(cd apps/gateway && npm run start:dev &)
sleep 3

# Start web
(cd apps/web && npm run dev &)
sleep 2

echo ""
echo "=== Demo is running ==="
echo "  Web:     http://localhost:3000"
echo "  Gateway: http://localhost:3001"
echo "  Backend: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop all services."
wait
