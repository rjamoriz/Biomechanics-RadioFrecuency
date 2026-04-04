#!/usr/bin/env bash
# Download pre-trained biomechanics CSI models from HuggingFace.
#
# Usage:
#   ./scripts/download-models.sh [--repo REPO_ID] [--local-dir DIR]
#
# Defaults:
#   repo:      rjamoriz/biomech-csi
#   local-dir: storage/models/
#
# Requires: Python 3.11+, pip

set -euo pipefail

REPO="${1:-rjamoriz/biomech-csi}"
LOCAL_DIR="${2:-storage/models/}"

echo "==> Ensuring huggingface_hub and safetensors are installed"
pip install --quiet huggingface_hub safetensors

echo "==> Downloading pre-trained models from ${REPO}"
python -m biomech_ml.hub download --repo "${REPO}" --local-dir "${LOCAL_DIR}"

echo "==> Done. Models available in ${LOCAL_DIR}"
