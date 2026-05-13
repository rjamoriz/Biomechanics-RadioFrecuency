"""Tests for SyntheticCsiGenerator."""

import numpy as np
import pytest
from biomech_ml.synthetic_data import SyntheticCsiGenerator, GaitLabels


@pytest.fixture
def gen():
    return SyntheticCsiGenerator(num_subcarriers=32, window_size=50, rng_seed=42)


class TestSingleWindow:
    def test_output_shape(self, gen):
        win = gen.generate_window()
        assert win.amplitude.shape == (50, 32)

    def test_amplitude_dtype_float32(self, gen):
        win = gen.generate_window()
        assert win.amplitude.dtype == np.float32

    def test_amplitude_non_negative(self, gen):
        win = gen.generate_window()
        assert (win.amplitude >= 0).all()

    def test_labels_are_synthetic(self, gen):
        win = gen.generate_window()
        assert win.labels.synthetic is True
        assert win.labels.output_class == "synthetic_training_data"

    def test_labels_match_inputs(self, gen):
        win = gen.generate_window(cadence_spm=175.0, symmetry=0.88,
                                   contact_time_ms=260.0, flight_time_ms=110.0)
        assert win.labels.cadence_spm == pytest.approx(175.0)
        assert win.labels.symmetry_proxy == pytest.approx(0.88)
        assert win.labels.contact_time_ms == pytest.approx(260.0)
        assert win.labels.flight_time_ms == pytest.approx(110.0)

    def test_different_cadence_produces_different_windows(self, gen):
        w1 = gen.generate_window(cadence_spm=160.0)
        w2 = gen.generate_window(cadence_spm=200.0)
        assert not np.allclose(w1.amplitude, w2.amplitude)

    def test_symmetry_affects_amplitude(self, gen):
        """Lower symmetry should produce different amplitude pattern than perfect."""
        perfect = gen.generate_window(symmetry=1.0)
        asym = gen.generate_window(symmetry=0.7)
        assert not np.allclose(perfect.amplitude, asym.amplitude)


class TestBatch:
    def test_batch_output_shape(self, gen):
        amps, labels = gen.generate_batch(n_samples=10)
        assert amps.shape == (10, 50, 32)

    def test_batch_label_keys(self, gen):
        _, labels = gen.generate_batch(n_samples=5)
        expected = {"cadence_spm", "symmetry_proxy", "contact_time_ms",
                    "flight_time_ms", "treadmill_speed_kmh"}
        assert set(labels.keys()) == expected

    def test_batch_label_shapes(self, gen):
        n = 20
        _, labels = gen.generate_batch(n_samples=n)
        for key, arr in labels.items():
            assert arr.shape == (n,), f"{key} has wrong shape"

    def test_batch_cadence_in_range(self, gen):
        _, labels = gen.generate_batch(n_samples=100, cadence_range=(160.0, 180.0))
        assert (labels["cadence_spm"] >= 160.0).all()
        assert (labels["cadence_spm"] <= 180.0).all()

    def test_batch_symmetry_in_range(self, gen):
        _, labels = gen.generate_batch(n_samples=100, symmetry_range=(0.85, 0.95))
        assert (labels["symmetry_proxy"] >= 0.85).all()
        assert (labels["symmetry_proxy"] <= 0.95).all()

    def test_batch_amplitudes_non_negative(self, gen):
        amps, _ = gen.generate_batch(n_samples=20)
        assert (amps >= 0).all()

    def test_batch_amplitudes_dtype_float32(self, gen):
        amps, _ = gen.generate_batch(n_samples=5)
        assert amps.dtype == np.float32

    def test_batch_label_dtype_float32(self, gen):
        _, labels = gen.generate_batch(n_samples=5)
        for key, arr in labels.items():
            assert arr.dtype == np.float32, f"{key} dtype is {arr.dtype}"

    def test_deterministic_with_seed(self):
        g1 = SyntheticCsiGenerator(num_subcarriers=16, window_size=20, rng_seed=7)
        g2 = SyntheticCsiGenerator(num_subcarriers=16, window_size=20, rng_seed=7)
        a1, _ = g1.generate_batch(n_samples=5)
        a2, _ = g2.generate_batch(n_samples=5)
        np.testing.assert_array_equal(a1, a2)

    def test_different_seeds_produce_different_batches(self):
        g1 = SyntheticCsiGenerator(num_subcarriers=16, window_size=20, rng_seed=1)
        g2 = SyntheticCsiGenerator(num_subcarriers=16, window_size=20, rng_seed=2)
        a1, _ = g1.generate_batch(n_samples=5)
        a2, _ = g2.generate_batch(n_samples=5)
        assert not np.array_equal(a1, a2)
