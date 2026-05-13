from pathlib import Path
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

BASE = Path(__file__).resolve().parents[1]
RAW = BASE / 'data' / 'raw' / 'synthetic_rf_biomech_runner_stride_dataset.csv'
OUT = BASE / 'data' / 'processed'
OUT.mkdir(parents=True, exist_ok=True)
TARGET = 'future_pain_or_modification_14d'
GROUP = 'athlete_id'
DROP = ['row_id','source_type','source_reference','athlete_id','date','injury_region_next_28d','recommended_action_baseline','global_risk_probability_14d','pain_event_next_7d',TARGET]
QML_FEATURES = ['treadmill_speed_mps','load_spike_ratio','hrv_ms','subjective_fatigue_1_10','contact_phase_ms','uplift_flight_phase_ms','vertical_force_peak_BW','lateral_force_peak_N','loading_rate_BW_s','power_Wkg','muscle_load_index','asymmetry_pct','rf_signal_quality','multipath_score','achilles_calf_risk_14d','tibial_stress_risk_14d']

def load_clean():
    df = pd.read_csv(RAW)
    df = df.drop_duplicates('row_id')
    df = df[df.rf_signal_quality.between(0.20, 1.0)]
    df = df[df.vertical_force_peak_BW.between(1.0, 4.0)]
    df = df[df.contact_phase_ms.between(120, 380)]
    return df.copy()

def add_features(df):
    df['force_symmetry_penalty'] = df.asymmetry_pct / 100 * df.vertical_force_peak_BW
    df['contact_to_flight_ratio'] = df.contact_phase_ms / (df.uplift_flight_phase_ms + 1e-6)
    df['normalized_lateral_force'] = df.lateral_force_peak_N / (df.mass_kg * 9.81)
    df['power_speed_ratio'] = df.power_Wkg / (df.treadmill_speed_mps + 1e-6)
    df['recovery_stress_index'] = 0.45*df.load_spike_ratio + 0.25*(df.subjective_fatigue_1_10/10) + 0.20*np.maximum(70-df.hrv_ms,0)/35 + 0.10*(df.soreness_score_0_10/10)
    df['rf_confidence_weight'] = df.rf_signal_quality * (1 - df.multipath_score)
    return df

def build_classical(df):
    X = pd.get_dummies(df.drop(columns=[c for c in DROP if c in df.columns]), drop_first=True)
    X[TARGET] = df[TARGET].values
    X[GROUP] = df[GROUP].values
    split = GroupShuffleSplit(n_splits=1, train_size=0.80, random_state=42)
    tr, _ = next(split.split(X.drop(columns=[TARGET, GROUP]), X[TARGET], groups=X[GROUP]))
    X['split'] = 'test'
    X.loc[tr, 'split'] = 'train'
    return X

def build_qml(df):
    q = df[[GROUP, TARGET] + QML_FEATURES].dropna().copy()
    q[QML_FEATURES] = StandardScaler().fit_transform(q[QML_FEATURES])
    q[QML_FEATURES] = q[QML_FEATURES].clip(-3, 3)
    return q.sample(n=min(512, len(q)), random_state=42)

def main():
    df = add_features(load_clean())
    classical = build_classical(df)
    qml = build_qml(df)
    classical.to_csv(OUT / 'ml_feature_matrix.csv', index=False)
    qml.to_csv(OUT / 'qml_feature_matrix_small.csv', index=False)
    meta = {'rows_clean': len(df), 'classical_rows': len(classical), 'qml_rows': len(qml), 'target': TARGET, 'synthetic': True, 'medical_diagnosis': False}
    (OUT / 'train_test_split_metadata.json').write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))

if __name__ == '__main__':
    main()
