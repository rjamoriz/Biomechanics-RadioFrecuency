#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../ml"
python -m src.inference.serve
