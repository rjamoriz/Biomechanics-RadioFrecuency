#!/usr/bin/env bash
set -euo pipefail
SERIAL_PORT="${1:-/dev/ttyUSB1}"
cd "$(dirname "$0")/../firmware/rx_csi_collector"
idf.py set-target esp32
idf.py build
idf.py -p "$SERIAL_PORT" flash monitor
