#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
ADMIN_EMAIL="${1:-admin@biomech.local}"
ADMIN_PASSWORD="${2:-admin123}"

echo "Creating admin user: $ADMIN_EMAIL"

curl -s -X POST "$BACKEND_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"password\": \"$ADMIN_PASSWORD\",
    \"displayName\": \"Admin\",
    \"role\": \"ADMIN\"
  }" | python3 -m json.tool 2>/dev/null || echo "(raw response above)"

echo ""
echo "Admin user created. Use these credentials to log in."
