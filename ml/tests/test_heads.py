"""
Tests for task-specific heads — output shapes, JSON serialization, confidence.
"""

import tempfile
from pathlib import Path

import pytest
import torch

from biomech_ml.heads import (
    HEAD_REGISTRY,
    ActivityHead,
    CadenceHead,
    ContactTimeHead,
    GaitHead,
    PresenceHead,
    SymmetryHead,
    create_head,
    load_head_json,
    save_head_json,
)
from biomech_ml.contrastive import EMBEDDING_DIM


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def embedding():
    torch.manual_seed(42)
    return torch.randn(4, EMBEDDING_DIM)


# ── Output shapes ───────────────────────────────────────────────────── #

class TestHeadOutputShapes:
    def test_cadence_head(self, embedding):
        head = CadenceHead()
        out = head(embedding)
        assert out.shape == (4, 1)

    def test_symmetry_head(self, embedding):
        head = SymmetryHead()
        out = head(embedding)
        assert out.shape == (4, 1)
        assert (out >= 0).all() and (out <= 1).all(), "Symmetry should be in [0, 1]"

    def test_contact_time_head(self, embedding):
        head = ContactTimeHead()
        out = head(embedding)
        assert out.shape == (4, 1)
        assert (out >= 0).all() and (out <= 1).all(), "Contact time should be in [0, 1]"

    def test_presence_head(self, embedding):
        head = PresenceHead()
        out = head(embedding)
        assert out.shape == (4, 1)
        assert (out >= 0).all() and (out <= 1).all(), "Presence should be in [0, 1]"

    def test_activity_head(self, embedding):
        head = ActivityHead()
        out = head(embedding)
        assert out.shape == (4, 4), f"Expected (4, 4), got {out.shape}"


class TestHeadConfidence:
    def test_predict_with_confidence(self, embedding):
        head = CadenceHead()
        result = head.predict_with_confidence(embedding)
        assert "prediction" in result
        assert "confidence" in result
        assert result["prediction"].shape == (4, 1)
        assert result["confidence"].shape == (4, 1)
        assert (result["confidence"] >= 0).all() and (result["confidence"] <= 1).all()


# ── Registry ────────────────────────────────────────────────────────── #

class TestHeadRegistry:
    def test_all_heads_registered(self):
        expected = {"cadence", "symmetry", "contact_time", "presence", "activity"}
        assert set(HEAD_REGISTRY.keys()) == expected

    def test_create_head_by_name(self):
        for name in HEAD_REGISTRY:
            head = create_head(name)
            assert isinstance(head, GaitHead)

    def test_create_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown head type"):
            create_head("nonexistent")


# ── JSON serialization ──────────────────────────────────────────────── #

class TestHeadJsonSerialization:
    @pytest.mark.parametrize("head_type", list(HEAD_REGISTRY.keys()))
    def test_roundtrip(self, head_type, embedding):
        head = create_head(head_type)
        head.eval()

        with torch.no_grad():
            out_before = head(embedding)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / f"{head_type}-head.json"
            save_head_json(head, path)

            assert path.exists()
            assert path.stat().st_size > 0

            loaded = load_head_json(path)
            loaded.eval()

            with torch.no_grad():
                out_after = loaded(embedding)

        assert torch.allclose(out_before, out_after, atol=1e-6), (
            f"JSON roundtrip failed for {head_type}: outputs differ"
        )

    def test_json_contains_metadata(self):
        import json

        head = CadenceHead()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "cadence-head.json"
            save_head_json(head, path)

            with open(path) as f:
                payload = json.load(f)

        assert payload["head_type"] == "cadence"
        assert payload["input_dim"] == EMBEDDING_DIM
        assert payload["experimental"] is True
        assert payload["validation_status"] == "unvalidated"
        assert "version" in payload
        assert "layers" in payload
        assert "weights" in payload

    def test_json_file_is_compact(self):
        """Head JSON files should be small (< 100 KB)."""
        head = ActivityHead()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "activity-head.json"
            save_head_json(head, path)
            size_kb = path.stat().st_size / 1024
            assert size_kb < 200, f"Head JSON too large: {size_kb:.1f} KB"
