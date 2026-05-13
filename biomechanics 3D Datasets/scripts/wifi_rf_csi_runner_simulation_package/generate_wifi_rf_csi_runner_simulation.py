from pathlib import Path
import numpy as np
import pandas as pd
import zipfile
import json

np.random.seed(20260503)

# -----------------------------
# Output structure
# -----------------------------
base_dir = Path("wifi_rf_csi_runner_simulation_package")
raw_dir = base_dir / "data" / "raw"
features_dir = base_dir / "data" / "features"
docs_dir = base_dir / "docs"
scripts_dir = base_dir / "scripts"

for folder in [raw_dir, features_dir, docs_dir, scripts_dir]:
    folder.mkdir(parents=True, exist_ok=True)

# -----------------------------
# Simulation parameters
# -----------------------------
n_athletes = 10
sessions_per_athlete = 2
speeds_mps = [2.7, 3.0, 3.3, 3.7]
duration_s = 18
internal_fs_hz = 100
csv_downsample = 10
n_time = duration_s * internal_fs_hz

subcarriers = np.array([
    -28, -24, -20, -16, -12, -8, -4, -2,
     2,   4,   8,  12,  16, 20, 24, 28
])

links = ["tx1_rx1", "tx1_rx2", "tx2_rx1", "tx2_rx2"]

# -----------------------------
# Synthetic athletes
# -----------------------------
athlete_rows = []

for i in range(n_athletes):
    sex = np.random.choice(["female", "male"])

    if sex == "male":
        mass = np.random.normal(72, 8)
        height = np.random.normal(178, 7)
    else:
        mass = np.random.normal(60, 7)
        height = np.random.normal(166, 6)

    athlete_rows.append({
        "athlete_id": f"ATH_WIFI_{i + 1:03d}",
        "sex": sex,
        "age": int(np.clip(np.random.normal(34, 8), 18, 55)),
        "mass_kg": round(float(np.clip(mass, 48, 95)), 1),
        "height_cm": round(float(np.clip(height, 155, 195)), 1),
        "injury_history_score": round(float(np.random.beta(2, 5)), 3),
        "habitual_footstrike": np.random.choice(
            ["rearfoot", "midfoot", "forefoot"],
            p=[0.55, 0.30, 0.15]
        ),
    })

athletes_df = pd.DataFrame(athlete_rows)
athletes_df.to_csv(raw_dir / "wifi_sim_athlete_profiles.csv", index=False)

# -----------------------------
# Helper functions
# -----------------------------
def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def gait_phase_at(left_contact, right_contact, idx):
    if left_contact[idx]:
        return "left_contact"
    if right_contact[idx]:
        return "right_contact"
    return "flight"


# -----------------------------
# Generate raw-like CSI and features
# -----------------------------
raw_csi_rows = []
window_feature_rows = []
event_rows = []

for _, athlete in athletes_df.iterrows():
    injury_history = float(athlete["injury_history_score"])
    footstrike = athlete["habitual_footstrike"]

    for session_number in range(1, sessions_per_athlete + 1):
        room_id = np.random.choice(["lab_A", "lab_B", "lab_C"])
        sensor_geometry = np.random.choice([
            "front_back",
            "left_right",
            "diagonal_4link"
        ])

        fatigue_score = float(np.clip(np.random.normal(4.5, 1.4), 1, 9))
        baseline_asymmetry = float(
            np.clip(1.2 + injury_history * 4.5 + np.random.normal(0, 0.8), 0.2, 9.5)
        )
        multipath_base = float(np.clip(np.random.beta(2, 8), 0.02, 0.80))

        date = (
            pd.Timestamp("2026-01-05")
            + pd.Timedelta(days=(session_number - 1) * 7 + np.random.randint(0, 3))
        )

        for speed_mps in speeds_mps:
            session_id = f"{athlete['athlete_id']}_S{session_number:02d}_{speed_mps:.1f}mps"
            t = np.arange(n_time) / internal_fs_hz

            # -----------------------------
            # Running biomechanics proxy
            # -----------------------------
            cadence_spm = float(np.clip(
                158 + 9.5 * speed_mps + np.random.normal(0, 2),
                160, 205
            ))

            step_hz = cadence_spm / 60.0
            stride_hz = step_hz / 2.0

            contact_time_ms = float(np.clip(
                285 - 27 * (speed_mps - 2.7)
                + 4.2 * fatigue_score
                + np.random.normal(0, 5),
                170, 330
            ))

            flight_time_ms = float(np.clip(
                65 + 18 * (speed_mps - 2.7)
                - 1.2 * fatigue_score
                + np.random.normal(0, 4),
                35, 145
            ))

            asymmetry_pct = float(np.clip(
                baseline_asymmetry + 0.25 * fatigue_score + np.random.normal(0, 0.5),
                0.2, 12
            ))

            vertical_loading_rate_bw_s = float(np.clip(
                52 + 8.5 * speed_mps + 2.2 * fatigue_score + np.random.normal(0, 4),
                40, 115
            ))

            # -----------------------------
            # Contact/uplift phase labels
            # -----------------------------
            phase_pos = (t * step_hz) % 2.0
            contact_fraction = np.clip(
                (contact_time_ms / 1000.0) * step_hz,
                0.18, 0.55
            )

            left_contact = phase_pos < contact_fraction
            right_contact = ((phase_pos + 1.0) % 2.0) < contact_fraction

            # -----------------------------
            # Simplified body-motion model
            # -----------------------------
            torso_motion = 0.22 * np.sin(2 * np.pi * stride_hz * t)
            left_leg_motion = 0.65 * np.sin(2 * np.pi * step_hz * t + 0.12)
            right_leg_motion = 0.65 * np.sin(
                2 * np.pi * step_hz * t
                + np.pi
                + 0.12
                + asymmetry_pct / 100
            )
            arm_motion = 0.18 * np.sin(2 * np.pi * step_hz * t + np.pi / 2)
            vertical_bounce = 0.10 * np.sin(2 * np.pi * stride_hz * t + np.pi / 4)

            body_motion = (
                torso_motion
                + left_leg_motion
                + right_leg_motion
                + arm_motion
                + vertical_bounce
            )

            # -----------------------------
            # Biomechanics and risk labels
            # -----------------------------
            footstrike_factor = {
                "rearfoot": 1.08,
                "midfoot": 1.00,
                "forefoot": 0.97,
            }[footstrike]

            vertical_force_peak_bw = float(np.clip(
                2.15
                + 0.13 * (speed_mps - 2.7)
                + 0.025 * fatigue_score
                + 0.04 * (footstrike_factor - 1)
                + np.random.normal(0, 0.05),
                1.7, 3.2
            ))

            lateral_force_peak_bw = float(np.clip(
                0.05 + 0.010 * asymmetry_pct + np.random.normal(0, 0.012),
                0.02, 0.28
            ))

            braking_force_peak_bw = float(np.clip(
                0.18
                + 0.06 * (speed_mps - 2.7)
                + 0.01 * (cadence_spm < 170)
                + np.random.normal(0, 0.015),
                0.07, 0.55
            ))

            propulsive_force_peak_bw = float(np.clip(
                0.24 + 0.07 * (speed_mps - 2.7) + np.random.normal(0, 0.018),
                0.10, 0.65
            ))

            power_wkg = float(np.clip(
                3.0 + 0.80 * (speed_mps - 2.7) + np.random.normal(0, 0.18),
                2.0, 6.5
            ))

            calf_load_contact_bw = float(np.clip(
                1.10 + 0.20 * speed_mps + 0.05 * fatigue_score + np.random.normal(0, 0.06),
                1.0, 3.0
            ))

            calf_load_uplift_bw = float(np.clip(
                1.30 + 0.22 * speed_mps + 0.04 * fatigue_score + np.random.normal(0, 0.07),
                1.1, 3.6
            ))

            quad_load_contact_bw = float(np.clip(
                1.20 + 0.12 * speed_mps + 0.035 * fatigue_score + np.random.normal(0, 0.07),
                0.9, 3.3
            ))

            hamstring_load_uplift_bw = float(np.clip(
                0.85 + 0.15 * speed_mps + 0.030 * fatigue_score + np.random.normal(0, 0.06),
                0.5, 2.6
            ))

            muscle_load_index = float(np.clip(
                (
                    calf_load_contact_bw
                    + calf_load_uplift_bw
                    + quad_load_contact_bw
                    + hamstring_load_uplift_bw
                ) / 8.0,
                0.35, 1.25
            ))

            risk_probability_14d = float(np.clip(sigmoid(
                -4.2
                + 0.038 * vertical_loading_rate_bw_s
                + 0.20 * asymmetry_pct
                + 0.23 * fatigue_score
                + 0.85 * injury_history
                + 0.50 * (speed_mps > 3.3)
            ), 0.01, 0.90))

            future_pain_or_modification_14d = int(
                np.random.rand() < risk_probability_14d * 0.50
            )

            event_rows.append({
                "athlete_id": athlete["athlete_id"],
                "session_id": session_id,
                "date": date.date().isoformat(),
                "speed_mps": speed_mps,
                "speed_kmh": round(speed_mps * 3.6, 2),
                "cadence_spm": round(cadence_spm, 2),
                "contact_time_ms": round(contact_time_ms, 2),
                "flight_time_ms": round(flight_time_ms, 2),
                "asymmetry_pct": round(asymmetry_pct, 3),
                "vertical_loading_rate_bw_s": round(vertical_loading_rate_bw_s, 3),
                "vertical_force_peak_bw_proxy": round(vertical_force_peak_bw, 4),
                "lateral_force_peak_bw_proxy": round(lateral_force_peak_bw, 4),
                "braking_force_peak_bw_proxy": round(braking_force_peak_bw, 4),
                "propulsive_force_peak_bw_proxy": round(propulsive_force_peak_bw, 4),
                "power_wkg_proxy": round(power_wkg, 3),
                "calf_load_contact_bw": round(calf_load_contact_bw, 4),
                "calf_load_uplift_bw": round(calf_load_uplift_bw, 4),
                "quadriceps_load_contact_bw": round(quad_load_contact_bw, 4),
                "hamstring_load_uplift_bw": round(hamstring_load_uplift_bw, 4),
                "muscle_load_index": round(muscle_load_index, 4),
                "global_risk_probability_14d": round(risk_probability_14d, 4),
                "future_pain_or_modification_14d": future_pain_or_modification_14d,
                "not_medical_diagnosis": True,
            })

            # -----------------------------
            # Subcarrier-level raw-like CSI
            # -----------------------------
            for link_idx, link in enumerate(links):
                link_gain = float(np.random.normal(1.0, 0.08))
                link_phase = float(np.random.uniform(-np.pi, np.pi))
                link_multipath = float(np.clip(multipath_base + np.random.normal(0, 0.035), 0.0, 1.0))

                rf_snr_db = float(np.clip(
                    np.random.normal(25, 3) - link_multipath * 7,
                    8, 38
                ))

                rf_signal_quality = float(np.clip(
                    0.86 + (rf_snr_db - 25) / 45 - link_multipath * 0.30,
                    0.25, 0.99
                ))

                for sc in subcarriers:
                    sc_norm = sc / np.max(np.abs(subcarriers))
                    carrier_gain = float(1.0 + 0.08 * sc_norm + np.random.normal(0, 0.015))

                    amp_signal = (
                        1.0
                        + 0.045 * link_gain * carrier_gain * body_motion
                        + 0.020 * np.sin(2 * np.pi * (step_hz * 2) * t + link_phase + sc_norm)
                        + 0.010 * np.sin(2 * np.pi * 0.25 * t + link_idx)
                    )

                    phase_signal = (
                        link_phase
                        + 0.23 * link_gain * body_motion
                        + 0.060 * np.sin(2 * np.pi * step_hz * t + sc_norm * np.pi)
                        + 0.020 * np.cumsum(np.random.normal(0, 0.02, n_time)) / np.sqrt(n_time)
                    )

                    amp_noise = np.random.normal(0, 0.010 + 0.018 * link_multipath, n_time)
                    phase_noise = np.random.normal(0, 0.020 + 0.025 * link_multipath, n_time)

                    amp = np.clip(amp_signal + amp_noise, 0.05, 2.5)
                    phase = np.angle(np.exp(1j * (phase_signal + phase_noise)))

                    for idx in range(0, n_time, csv_downsample):
                        raw_csi_rows.append({
                            "athlete_id": athlete["athlete_id"],
                            "session_id": session_id,
                            "room_id": room_id,
                            "sensor_geometry": sensor_geometry,
                            "speed_mps": speed_mps,
                            "speed_kmh": round(speed_mps * 3.6, 2),
                            "time_s": round(float(t[idx]), 3),
                            "link_id": link,
                            "subcarrier_index": int(sc),
                            "csi_amplitude": round(float(amp[idx]), 6),
                            "csi_phase_rad": round(float(phase[idx]), 6),
                            "gait_phase_label": gait_phase_at(left_contact, right_contact, idx),
                            "left_contact_label": int(left_contact[idx]),
                            "right_contact_label": int(right_contact[idx]),
                            "rf_snr_db": round(rf_snr_db, 3),
                            "multipath_score": round(link_multipath, 4),
                            "rf_signal_quality": round(rf_signal_quality, 4),
                            "simulated": 1,
                        })

            # -----------------------------
            # Window-level RF features
            # -----------------------------
            window_s = 1.0
            samples_per_window = int(internal_fs_hz * window_s)
            n_windows = n_time // samples_per_window

            for w in range(n_windows):
                start = w * samples_per_window
                end = start + samples_per_window
                segment = body_motion[start:end]

                freqs = np.fft.rfftfreq(len(segment), 1 / internal_fs_hz)
                fft_mag = np.abs(np.fft.rfft(segment - segment.mean()))

                dominant_freq = float(freqs[np.argmax(fft_mag[1:]) + 1])
                harmonic_mask = (freqs > step_hz * 0.70) & (freqs < step_hz * 2.50)
                harmonic_energy_ratio = float(
                    fft_mag[harmonic_mask].sum() / (fft_mag.sum() + 1e-9)
                )

                window_feature_rows.append({
                    "athlete_id": athlete["athlete_id"],
                    "session_id": session_id,
                    "room_id": room_id,
                    "sensor_geometry": sensor_geometry,
                    "speed_mps": speed_mps,
                    "speed_kmh": round(speed_mps * 3.6, 2),
                    "window_id": w,
                    "window_start_s": round(w * window_s, 2),
                    "window_end_s": round((w + 1) * window_s, 2),
                    "cadence_spm": round(cadence_spm, 2),
                    "contact_time_ms": round(contact_time_ms, 2),
                    "flight_time_ms": round(flight_time_ms, 2),
                    "asymmetry_pct": round(asymmetry_pct, 3),
                    "fatigue_score_1_10": round(fatigue_score, 2),
                    "dominant_doppler_proxy_hz": round(dominant_freq, 4),
                    "harmonic_energy_ratio": round(harmonic_energy_ratio, 5),
                    "rf_snr_db": round(float(np.clip(np.random.normal(25, 3) - multipath_base * 7, 8, 38)), 3),
                    "multipath_score": round(multipath_base, 4),
                    "rf_signal_quality": round(float(np.clip(0.86 - multipath_base * 0.30 + np.random.normal(0, 0.035), 0.25, 0.99)), 4),
                    "vertical_force_peak_bw_proxy": round(vertical_force_peak_bw, 4),
                    "lateral_force_peak_bw_proxy": round(lateral_force_peak_bw, 4),
                    "braking_force_peak_bw_proxy": round(braking_force_peak_bw, 4),
                    "propulsive_force_peak_bw_proxy": round(propulsive_force_peak_bw, 4),
                    "vertical_loading_rate_bw_s": round(vertical_loading_rate_bw_s, 3),
                    "calf_load_contact_bw": round(calf_load_contact_bw, 4),
                    "calf_load_uplift_bw": round(calf_load_uplift_bw, 4),
                    "quadriceps_load_contact_bw": round(quad_load_contact_bw, 4),
                    "hamstring_load_uplift_bw": round(hamstring_load_uplift_bw, 4),
                    "muscle_load_index": round(muscle_load_index, 4),
                    "power_wkg_proxy": round(power_wkg, 3),
                    "global_risk_probability_14d": round(risk_probability_14d, 4),
                    "future_pain_or_modification_14d": future_pain_or_modification_14d,
                    "simulated": 1,
                })

# -----------------------------
# Save generated datasets
# -----------------------------
raw_csi_df = pd.DataFrame(raw_csi_rows)
window_df = pd.DataFrame(window_feature_rows)
events_df = pd.DataFrame(event_rows)

raw_csi_path = raw_dir / "synthetic_wifi_csi_raw_like.csv"
window_path = features_dir / "synthetic_wifi_rf_window_features.csv"
events_path = features_dir / "synthetic_wifi_biomech_event_labels.csv"

raw_csi_df.to_csv(raw_csi_path, index=False)
window_df.to_csv(window_path, index=False)
events_df.to_csv(events_path, index=False)

# -----------------------------
# QML small matrix
# -----------------------------
qml_cols = [
    "speed_mps",
    "cadence_spm",
    "contact_time_ms",
    "flight_time_ms",
    "asymmetry_pct",
    "fatigue_score_1_10",
    "dominant_doppler_proxy_hz",
    "harmonic_energy_ratio",
    "rf_snr_db",
    "multipath_score",
    "rf_signal_quality",
    "vertical_force_peak_bw_proxy",
    "lateral_force_peak_bw_proxy",
    "vertical_loading_rate_bw_s",
    "muscle_load_index",
    "power_wkg_proxy",
]

qml_df = window_df[
    ["athlete_id", "session_id", "future_pain_or_modification_14d"] + qml_cols
].dropna().copy()

for col in qml_cols:
    qml_df[col] = (qml_df[col] - qml_df[col].mean()) / (qml_df[col].std() + 1e-9)
    qml_df[col] = qml_df[col].clip(-3, 3)

qml_df = qml_df.sample(n=min(512, len(qml_df)), random_state=42)
qml_path = features_dir / "synthetic_wifi_qml_feature_matrix.csv"
qml_df.to_csv(qml_path, index=False)

# -----------------------------
# ETL from raw CSI to features
# -----------------------------
csi = raw_csi_df.copy()
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

label_cols = group_cols + [
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

etl_output = features.merge(window_df[label_cols], on=group_cols, how="left")
etl_output_path = features_dir / "etl_from_raw_csi_window_features.csv"
etl_output.to_csv(etl_output_path, index=False)

# -----------------------------
# Write reusable ETL script
# -----------------------------
etl_script = '''"""
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
'''

(scripts_dir / "etl_from_raw_wifi_csi.py").write_text(etl_script)

# -----------------------------
# Data dictionary
# -----------------------------
dictionary_rows = [
    ("synthetic_wifi_csi_raw_like.csv", "athlete_id", "Synthetic anonymized athlete identifier."),
    ("synthetic_wifi_csi_raw_like.csv", "session_id", "Synthetic Wi-Fi CSI session identifier."),
    ("synthetic_wifi_csi_raw_like.csv", "room_id", "Simulated laboratory room identifier."),
    ("synthetic_wifi_csi_raw_like.csv", "sensor_geometry", "Simulated Wi-Fi transmitter/receiver placement geometry."),
    ("synthetic_wifi_csi_raw_like.csv", "speed_mps", "Treadmill running speed in meters per second."),
    ("synthetic_wifi_csi_raw_like.csv", "time_s", "Timestamp in seconds, downsampled to compact CSV rate."),
    ("synthetic_wifi_csi_raw_like.csv", "link_id", "Synthetic TX/RX link identifier."),
    ("synthetic_wifi_csi_raw_like.csv", "subcarrier_index", "OFDM-like Wi-Fi subcarrier index."),
    ("synthetic_wifi_csi_raw_like.csv", "csi_amplitude", "Synthetic CSI amplitude for a subcarrier/link/time sample."),
    ("synthetic_wifi_csi_raw_like.csv", "csi_phase_rad", "Synthetic wrapped CSI phase in radians."),
    ("synthetic_wifi_csi_raw_like.csv", "gait_phase_label", "Synthetic gait phase: left_contact, right_contact, or flight."),
    ("synthetic_wifi_csi_raw_like.csv", "left_contact_label", "Binary left-foot contact label."),
    ("synthetic_wifi_csi_raw_like.csv", "right_contact_label", "Binary right-foot contact label."),
    ("synthetic_wifi_csi_raw_like.csv", "rf_snr_db", "Synthetic RF signal-to-noise ratio."),
    ("synthetic_wifi_csi_raw_like.csv", "multipath_score", "Synthetic multipath/noise score from 0 to 1."),
    ("synthetic_wifi_csi_raw_like.csv", "rf_signal_quality", "Synthetic confidence score for RF measurement quality."),
    ("synthetic_wifi_rf_window_features.csv", "dominant_doppler_proxy_hz", "Dominant motion frequency proxy extracted from simulated body motion."),
    ("synthetic_wifi_rf_window_features.csv", "harmonic_energy_ratio", "Spectral energy around gait harmonics divided by total motion energy."),
    ("synthetic_wifi_rf_window_features.csv", "vertical_force_peak_bw_proxy", "Synthetic peak vertical force proxy in body weights."),
    ("synthetic_wifi_rf_window_features.csv", "lateral_force_peak_bw_proxy", "Synthetic peak lateral force proxy in body weights."),
    ("synthetic_wifi_rf_window_features.csv", "calf_load_contact_bw", "Synthetic calf-load proxy during contact phase in body-weight units."),
    ("synthetic_wifi_rf_window_features.csv", "calf_load_uplift_bw", "Synthetic calf-load proxy during uplift/propulsion phase in body-weight units."),
    ("synthetic_wifi_rf_window_features.csv", "muscle_load_index", "Synthetic global muscle-load index."),
    ("synthetic_wifi_rf_window_features.csv", "future_pain_or_modification_14d", "Synthetic risk label for pain or training modification within 14 days."),
]

pd.DataFrame(dictionary_rows, columns=["file", "column", "description"]).to_csv(
    docs_dir / "wifi_csi_simulation_data_dictionary.csv",
    index=False
)

# -----------------------------
# Metadata + README
# -----------------------------
metadata = {
    "raw_like_csi_rows": int(len(raw_csi_df)),
    "window_feature_rows": int(len(window_df)),
    "event_label_rows": int(len(events_df)),
    "qml_rows": int(len(qml_df)),
    "etl_from_raw_rows": int(len(etl_output)),
    "athletes": int(n_athletes),
    "sessions_per_athlete": int(sessions_per_athlete),
    "speeds_mps": speeds_mps,
    "duration_s_per_speed": duration_s,
    "internal_sampling_rate_hz": internal_fs_hz,
    "csv_downsample": csv_downsample,
    "csv_effective_rate_hz": internal_fs_hz / csv_downsample,
    "subcarriers": subcarriers.tolist(),
    "links": links,
    "synthetic": True,
    "hardware_captured": False,
    "medical_diagnosis": False,
}

(base_dir / "metadata.json").write_text(json.dumps(metadata, indent=2))

readme = f"""# Raw-Like Wi-Fi CSI Runner Simulation Package

This package simulates an athlete running on a treadmill while being monitored with Wi-Fi RF sensing.

It is designed for the Biomechanical Radiofrequency Athlete Monitoring Platform so the software can test the complete RF pipeline:

Wi-Fi CSI amplitude/phase
→ subcarrier/link processing
→ RF window features
→ gait/contact labels
→ biomechanics proxies
→ injury-risk labels
→ classical ML / quantum ML feature matrices

## Main files

### Raw-like CSI

`data/raw/synthetic_wifi_csi_raw_like.csv`

Contains subcarrier-level CSI-like samples.

### Window-level RF/biomechanics features

`data/features/synthetic_wifi_rf_window_features.csv`

Contains ML-ready one-second windows.

### ETL output from raw CSI

`data/features/etl_from_raw_csi_window_features.csv`

Generated by aggregating the raw-like CSI table into ML-ready features.

### QML matrix

`data/features/synthetic_wifi_qml_feature_matrix.csv`

Reduced and scaled feature matrix for quantum kernels or variational quantum classifiers.

## Dataset size

- Raw-like CSI rows: {len(raw_csi_df):,}
- Window feature rows: {len(window_df):,}
- Event label rows: {len(events_df):,}
- QML rows: {len(qml_df):,}
- Athletes: {n_athletes}
- Speeds: {speeds_mps}
- Subcarriers: {len(subcarriers)}
- TX/RX links: {len(links)}

## Important

This is synthetic data. It is not real Wi-Fi CSI captured from hardware and must not be used for medical diagnosis.
Its purpose is software development, ETL testing, ML/QML prototyping, dashboard testing, and RF-sensing architecture validation.
"""

(base_dir / "README.md").write_text(readme)

# -----------------------------
# ZIP package
# -----------------------------
zip_path = Path("wifi_rf_csi_runner_simulation_package.zip")

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for p in base_dir.rglob("*"):
        z.write(p, arcname=p.relative_to(base_dir))

print(f"Created package: {zip_path}")
print(f"Raw-like CSI CSV: {raw_csi_path}")
print(f"Window features CSV: {window_path}")
print(f"ETL output CSV: {etl_output_path}")
print(f"QML CSV: {qml_path}")
print(f"Raw-like CSI rows: {len(raw_csi_df):,}")
print(f"Window rows: {len(window_df):,}")
print(f"ETL rows: {len(etl_output):,}")
