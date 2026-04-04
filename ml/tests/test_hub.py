"""
Tests for ModelRegistry — initialization, listing, loading.
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
import torch

from biomech_ml.hub import ModelRegistry, DEFAULT_CACHE_DIR


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def tmp_cache(tmp_path):
    """Temporary cache directory with sample model files."""
    cache = tmp_path / "models"
    cache.mkdir()
    return cache


@pytest.fixture
def registry(tmp_cache):
    return ModelRegistry(cache_dir=str(tmp_cache))


# ── Initialization ──────────────────────────────────────────────────── #

class TestRegistryInit:
    def test_creates_cache_dir(self, tmp_path):
        cache = tmp_path / "new_cache"
        assert not cache.exists()
        reg = ModelRegistry(cache_dir=str(cache))
        assert cache.exists()

    def test_default_cache_dir(self):
        reg = ModelRegistry()
        assert reg.cache_dir == Path(DEFAULT_CACHE_DIR)


# ── List local models ───────────────────────────────────────────────── #

class TestListLocalModels:
    def test_empty_cache(self, registry):
        models = registry.list_local_models()
        assert models == []

    def test_lists_safetensors(self, registry, tmp_cache):
        # Create a fake safetensors file
        (tmp_cache / "encoder.safetensors").write_bytes(b"fake")
        models = registry.list_local_models()
        assert len(models) == 1
        assert models[0]["type"] == "encoder"
        assert models[0]["name"] == "encoder.safetensors"

    def test_lists_onnx(self, registry, tmp_cache):
        (tmp_cache / "model.onnx").write_bytes(b"fake")
        models = registry.list_local_models()
        assert len(models) == 1
        assert models[0]["type"] == "onnx_model"

    def test_lists_head_json(self, registry, tmp_cache):
        (tmp_cache / "cadence-head.json").write_text('{"head_type": "cadence"}')
        models = registry.list_local_models()
        assert len(models) == 1
        assert models[0]["type"] == "head"

    def test_lists_quantized_bin(self, registry, tmp_cache):
        (tmp_cache / "encoder-int4.bin").write_bytes(b"fake")
        models = registry.list_local_models()
        assert len(models) == 1
        assert models[0]["type"] == "quantized"

    def test_lists_multiple_models(self, registry, tmp_cache):
        (tmp_cache / "encoder.safetensors").write_bytes(b"fake")
        (tmp_cache / "cadence-head.json").write_text('{}')
        (tmp_cache / "model.onnx").write_bytes(b"fake")
        models = registry.list_local_models()
        assert len(models) == 3

    def test_includes_metadata(self, registry, tmp_cache):
        (tmp_cache / "encoder-int8.bin").write_bytes(b"fake")
        meta = {"bits": 8, "experimental": True}
        (tmp_cache / "encoder-int8.meta.json").write_text(json.dumps(meta))
        models = registry.list_local_models()
        assert len(models) == 1
        assert models[0].get("metadata", {}).get("bits") == 8

    def test_correct_format(self, registry, tmp_cache):
        (tmp_cache / "test.safetensors").write_bytes(b"fake")
        models = registry.list_local_models()
        m = models[0]
        assert "name" in m
        assert "path" in m
        assert "size_kb" in m
        assert "experimental" in m
        assert m["experimental"] is True


# ── Load encoder ────────────────────────────────────────────────────── #

class TestLoadEncoder:
    def test_load_encoder_with_safetensors(self, registry, tmp_cache):
        """Test loading encoder from a real safetensors file."""
        from biomech_ml.contrastive import CsiContrastiveEncoder, save_encoder_safetensors

        enc = CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32)
        path = tmp_cache / "biomech-encoder.safetensors"
        save_encoder_safetensors(enc, str(path))

        loaded = registry.load_encoder(
            num_subcarriers=16, window_size=32, d_model=32,
        )
        assert loaded is not None

        # Verify output
        x = torch.randn(1, 2, 32, 16)
        with torch.no_grad():
            z = loaded(x)
        assert z.shape == (1, 128)

    def test_load_encoder_not_found(self, registry):
        with pytest.raises(FileNotFoundError, match="No encoder found"):
            registry.load_encoder()


# ── Load head ───────────────────────────────────────────────────────── #

class TestLoadHead:
    def test_load_head_from_json(self, registry, tmp_cache):
        from biomech_ml.heads import CadenceHead, save_head_json

        head = CadenceHead()
        path = tmp_cache / "cadence-head.json"
        save_head_json(head, path)

        loaded = registry.load_head("cadence")
        assert loaded is not None
        assert loaded.head_type == "cadence"

    def test_load_head_not_found(self, registry):
        with pytest.raises(FileNotFoundError, match="No 'cadence' head found"):
            registry.load_head("cadence")
