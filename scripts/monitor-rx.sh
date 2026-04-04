#!/usr/bin/env bash
set -euo pipefail
SERIAL_PORT="${1:-/dev/ttyUSB1}"
idf.py -p "$SERIAL_PORT" monitor
