"""Quick validation of all P1 ML features."""
import sys
sys.path.insert(0, "src")
import torch

# === 1. Temporal Model ===
from biomech_ml.temporal_model import CsiTemporalModel, TemporalConfig, create_temporal_model, count_temporal_parameters

cfg = TemporalConfig(num_subcarriers=16, hidden_dim=32, conv_channels=[32, 64])
m = CsiTemporalModel(cfg)
o = m(torch.randn(4, 10, 2, 16))
assert o["gait_phase"].shape == (4, 10, 4), o["gait_phase"].shape
assert o["stride_events"].shape == (4, 10, 2), o["stride_events"].shape
assert o["fatigue_trend"].shape == (4, 1), o["fatigue_trend"].shape
assert (o["gait_phase"] >= 0).all() and (o["gait_phase"] <= 1).all()
assert torch.allclose(o["gait_phase"].sum(dim=-1), torch.ones(4, 10), atol=1e-5)
assert (o["stride_events"] >= 0).all() and (o["stride_events"] <= 1).all()

# Gradient flow
loss = o["gait_phase"].sum() + o["stride_events"].sum() + o["fatigue_trend"].sum()
loss.backward()
for n, p in m.named_parameters():
    assert p.grad is not None, f"No grad: {n}"
print("[OK] Temporal model forward + gradients")

# Factory + default
m2 = create_temporal_model()
o2 = m2(torch.randn(2, 8, 2, 64))
assert o2["gait_phase"].shape == (2, 8, 4)
print(f"[OK] Factory + default config ({count_temporal_parameters(m2):,} params)")

# Unidirectional
cfg_uni = TemporalConfig(num_subcarriers=16, hidden_dim=32, bidirectional=False, conv_channels=[32, 64])
m_uni = CsiTemporalModel(cfg_uni)
o_uni = m_uni(torch.randn(2, 5, 2, 16))
assert o_uni["gait_phase"].shape == (2, 5, 4)
print("[OK] Unidirectional variant")

# === 2. Augmentation ===
from biomech_ml.augmentation import time_warp, noise_injection, amplitude_scaling, subcarrier_dropout, mixup, phase_shift, CsiAugmentor, AugmentorConfig

x3 = torch.randn(4, 2, 32)
x4 = torch.randn(4, 8, 2, 32)

assert time_warp(x3).shape == x3.shape
assert time_warp(x4).shape == x4.shape
assert noise_injection(x3).shape == x3.shape
assert amplitude_scaling(x3).shape == x3.shape
assert subcarrier_dropout(x3).shape == x3.shape
shifted = phase_shift(x3, max_shift=1.0)
assert torch.allclose(shifted[:, 0, :], x3[:, 0, :])  # amplitude unchanged
mixed, lam = mixup(x3, torch.randn_like(x3), alpha=0.2)
assert mixed.shape == x3.shape and 0 <= lam <= 1
print("[OK] All 6 augmentation functions")

aug = CsiAugmentor()
assert aug(x3).shape == x3.shape
assert aug(x4).shape == x4.shape
cfg_off = AugmentorConfig(enable_time_warp=False, enable_noise=False, enable_amplitude_scaling=False, enable_subcarrier_dropout=False, enable_phase_shift=False)
assert torch.allclose(CsiAugmentor(cfg_off)(x3), x3)
print("[OK] CsiAugmentor pipeline")

# === 3. Synthetic data + Trainer ===
from biomech_ml.train_temporal import generate_synthetic_gait_data, TemporalTrainer, TrainConfig, gait_collate_fn

ds = generate_synthetic_gait_data(10, seq_len=8, num_subcarriers=16)
assert len(ds) == 10
s = ds[0]
assert s["csi"].shape == (8, 2, 16)
assert s["gait_phase"].shape == (8,)
assert s["stride_events"].shape == (8, 2)
print("[OK] Synthetic gait data generator")

cfg_s = TemporalConfig(num_subcarriers=16, hidden_dim=16, conv_channels=[16, 32])
m_t = CsiTemporalModel(cfg_s)
trainer = TemporalTrainer(m_t, TrainConfig(learning_rate=1e-3))
dl = torch.utils.data.DataLoader(ds, batch_size=4, collate_fn=gait_collate_fn)
metrics = trainer.train_epoch(dl)
assert "total" in metrics and metrics["total"] > 0
eval_m = trainer.evaluate(dl)
assert "val_loss" in eval_m and "gait_phase_accuracy" in eval_m
print(f"[OK] Trainer train_epoch + evaluate (loss={metrics['total']:.4f}, acc={eval_m['gait_phase_accuracy']:.4f})")

# === 4. __init__ imports ===
from biomech_ml import CsiTemporalModel, TemporalConfig, create_temporal_model, CsiAugmentor, AugmentorConfig
print("[OK] __init__.py exports")

print("\n=== ALL P1 ML FEATURES VALIDATED SUCCESSFULLY ===")
