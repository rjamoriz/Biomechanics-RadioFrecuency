"""
ETL for raw-like synthetic Wi-Fi CSI running simulation.

Purpose:
  1. Load subcarrier-level CSI amplitude/phase.
  2. Aggregate CSI into session/window/link features.
  3. Join biomechanics/risk labels.
  4. Export ML-ready window-level features.

This is synthetic data for software development.
It is not real Wi-Fi CSI captured from hardware.
"""

from pathlib import Path
import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
RAW_CSI = BASE / "data" / "raw" / "synthetic_wifi_csi_raw_like.csv"
WINDOW_LABELS = BASE / "data" / "features" / "synthetic_wifi_rf_window_features.csv"
OUT = BASE / "data" / "features" / "etl_from_raw_csi_window_features.csv"

def load_data():
    csi = pd.read_csv(RAW_CSI)
    labels = pd.read_csv(WINDOW_LABELS)
    return csi, labels

def engineer_csi_features(csi: pd.DataFrame) -> pd.DataFrame:
    csi = csi.copy()
    csi["window_id"] = np.floor(csi["time_s"]).astype(int)
    csi["phase_sin"] = np.sin(csi["csi_phase_rad"])
    csi["phase_cos"] = np.cos(csi["csi_phase_rad"])

    group_cols = ["athlete_id", "session_id", "speed_mps", "window_id"]

    features = csi.groupby(group_cols).agg(
        csi_amp_mean=("csi_amplitude", "mean"),
        csi_amp_std=("csi_amplitude", "std"),
        csi_amp_min=("csi_amplitude", "min"),
        csi_amp_max=("csi_amplitude", "max"),
        csi_phase_sin_mean=("phase_sin", "mean"),
        csi_phase_cos_mean=("phase_cos", "mean"),
        rf_snr_db_mean=("rf_snr_db", "mean"),
        multipath_score_mean=("multipath_score", "mean"),
        rf_signal_quality_mean=("rf_signal_quality", "mean"),
        left_contact_ratio=("left_contact_label", "mean"),
        right_contact_ratio=("right_contact_label", "mean"),
    ).reset_index()

    features["csi_amp_range"] = features["csi_amp_max"] - features["csi_amp_min"]
    features["flight_ratio_proxy"] = (
        1.0 - features["left_contact_ratio"] - features["right_contact_ratio"]
    )
    return features

def join_labels(features: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    join_cols = ["athlete_id", "session_id", "speed_mps", "window_id"]
    label_cols = join_cols + [
        "cadence_spm",
        "contact_time_ms",
        "flight_time_ms",
        "asymmetry_pct",
        "dominant_doppler_proxy_hz",
        "harmonic_energy_ratio",
        "vertical_force_peak_bw_proxy",
        "lateral_force_peak_bw_proxy",
        "vertical_loading_rate_bw_s",
        "calf_load_contact_bw",
        "calf_load_uplift_bw",
        "muscle_load_index",
        "power_wkg_proxy",
        "global_risk_probability_14d",
        "future_pain_or_modification_14d",
    ]
    return features.merge(labels[label_cols], on=join_cols, how="left")

def main():
    csi, labels = load_data()
    features = engineer_csi_features(csi)
    dataset = join_labels(features, labels)
    dataset.to_csv(OUT, index=False)
    print(f"Wrote {OUT}")
    print(f"Rows: {len(dataset):,}; Columns: {len(dataset.columns)}")

if __name__ == "__main__":
    main()
