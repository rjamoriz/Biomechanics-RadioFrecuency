#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/gateway"
npm run start:dev
