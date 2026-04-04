#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../ml"
python -m src.training.train_proxy
