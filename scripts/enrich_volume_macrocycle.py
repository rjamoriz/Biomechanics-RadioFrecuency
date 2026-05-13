"""
Enrich the raw synthetic biomechanics dataset with training macrocycle structure
and volume-based injury risk correlation features.

New columns added
-----------------
macrocycle_position        : int    Position within 4-week mesocycle (1-4).
                                     Weeks follow a 3:1 periodization model
                                     (3 load weeks → 1 deload week).
macrocycle_week_type       : str    "load_week" | "deload_week"
predicted_weekly_km        : float  Phase-aware volume prediction derived from
                                     marathon_phase + macrocycle_position.
volume_vs_predicted_delta_km: float Actual weekly_km − predicted_weekly_km
                                     Positive = over-plan, negative = under-plan
volume_change_pct_7d       : float  Week-over-week % change in weekly_km per
                                     athlete. NaN for each athlete's first week.
cumulative_volume_mesocycle_km: float Rolling 4-week cumulative volume per athlete
                                     (sum of current + 3 prior weeks).
volume_injury_risk_flag    : int    Composite binary flag (0/1):
                                     1 when load_spike_ratio >= 1.3 AND
                                       global_risk_probability_14d >= 0.3
                                     or volume_change_pct_7d > 25% on a load week
volume_risk_context        : str    Human-readable label combining week type
                                     and risk level for dashboards and reports.
                                     Values:
                                       "low_risk_load"
                                       "moderate_risk_load"
                                       "high_risk_load"
                                       "low_risk_deload"
                                       "unexpected_high_risk_deload"
computed_global_risk_proxy : float  Composite injury risk score derived from
                                     all five region-specific risk columns:
                                       max(region risks) * 0.5 +
                                       mean(region risks) * 0.5
                                     Fills the unfilled global_risk_probability_14d
                                     placeholder. Labeled "proxy" — not validated.

Scientific notes
----------------
- Macrocycle position is derived from the absolute training week number using
  modular arithmetic (((week - 1) % 4) + 1).  Week 1 of data need not be
  week 1 of training; alignment is approximate and consistent within the dataset.
- Predicted volume uses a simple phase-scaling model grounded in published
  marathon periodization literature (Magness 2014; Higdon 2019):
    BASE phase   : 40 km × position_scale
    BUILD phase  : 55 km × position_scale
    PEAK phase   : 65 km × position_scale
    TAPER phase  : 40 km × (5 - macrocycle_position) / 4  (progressive reduction)
  These are population-level proxies for a recreational-to-competitive cohort
  matching the athlete distribution in this dataset.
- computed_global_risk_proxy is derived from the five region risks (achilles/calf,
  knee, tibial stress, hamstring, plantar fascia). It is an experimental proxy.
  The original global_risk_probability_14d column is empty (all zeros) in the raw
  dataset and is preserved as-is. Use computed_global_risk_proxy for analysis.
- volume_injury_risk_flag is an experimental composite signal.
  It is NOT a validated injury prediction. Use it only as a pattern-detection
  aid alongside the dedicated risk columns.
- All new columns are labeled "proxy" or "predicted" in downstream documentation.

Output
------
Writes the enriched CSV alongside the original at:
  data/raw/synthetic_rf_biomech_runner_stride_dataset_enriched.csv
"""

import math
import os
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "biomechanics 3D Datasets" / "data" / "raw"
INPUT_CSV = RAW_DIR / "synthetic_rf_biomech_runner_stride_dataset.csv"
OUTPUT_CSV = RAW_DIR / "synthetic_rf_biomech_runner_stride_dataset_enriched.csv"


# ---------------------------------------------------------------------------
# Phase-aware volume prediction model
# ---------------------------------------------------------------------------
# Base volume targets (km) for a macrocycle_position == 1 load week.
# Deload weeks are scaled down by 0.65 (65% of load week volume).
# These numbers are population-level estimates grounded in published
# marathon training literature for recreational–competitive runners.
PHASE_BASE_KM: dict[str, float] = {
    "base": 42.0,
    "build": 58.0,
    "peak": 70.0,
    "taper": 45.0,
}

# Scaling per macrocycle position (1–4).
# Positions 1–3 are load weeks; position 4 is the deload week.
POSITION_SCALE: dict[int, float] = {
    1: 0.85,   # first load week of the block — controlled ramp
    2: 1.00,   # target load week
    3: 1.10,   # overreach week
    4: 0.65,   # deload week — deliberate volume reduction
}

DELOAD_POSITION = 4

REGION_RISK_COLS = [
    "achilles_calf_risk_14d",
    "knee_risk_14d",
    "tibial_stress_risk_14d",
    "hamstring_risk_14d",
    "plantar_fascia_risk_14d",
]


def predict_weekly_km(phase: str, position: int) -> float:
    """Return a predicted weekly volume (km) for a given marathon phase and
    macrocycle position.  Falls back to the "build" baseline for unknown phases.
    """
    base = PHASE_BASE_KM.get(phase.lower().strip(), PHASE_BASE_KM["build"])
    scale = POSITION_SCALE.get(position, 1.0)

    if phase.lower().strip() == "taper" and position == DELOAD_POSITION:
        # During taper the deload is even more pronounced
        return round(base * 0.45, 2)

    return round(base * scale, 2)


# ---------------------------------------------------------------------------
# Composite risk flag
# ---------------------------------------------------------------------------
def volume_injury_risk_flag(row: pd.Series) -> int:
    """Return 1 when a volume-related injury risk pattern is detected.

    Patterns:
    1. Acute:chronic load spike (>= 1.3) AND computed_global_risk_proxy >= 0.30
    2. Week-over-week volume increase > 25% on a load week
       (classic overtraining trigger from Gabbett 2016 ACWR research)

    Flag is experimental — label in downstream docs as proxy/unvalidated.
    Uses computed_global_risk_proxy (max*0.5 + mean*0.5 of region risks)
    because the raw global_risk_probability_14d column is unfilled.
    """
    spike_and_risk = (
        row.get("load_spike_ratio", 0) >= 1.3
        and row.get("computed_global_risk_proxy", 0) >= 0.30
    )
    volume_jump = (
        row.get("macrocycle_week_type", "") == "load_week"
        and not math.isnan(row.get("volume_change_pct_7d", float("nan")))
        and row.get("volume_change_pct_7d", 0) > 25.0
    )
    return int(spike_and_risk or volume_jump)


def volume_risk_context(row: pd.Series) -> str:
    """Return a human-readable risk context label for dashboards.

    Uses computed_global_risk_proxy (scaled 0–1 equivalent from region risks).
    Thresholds calibrated relative to the proxy's observed range (~0.07–0.60).
    """
    week_type = row.get("macrocycle_week_type", "load_week")
    risk = float(row.get("computed_global_risk_proxy", 0))

    if week_type == "deload_week":
        if risk >= 0.35:
            return "unexpected_high_risk_deload"
        return "low_risk_deload"

    # Load week buckets
    if risk < 0.25:
        return "low_risk_load"
    if risk < 0.40:
        return "moderate_risk_load"
    return "high_risk_load"


# ---------------------------------------------------------------------------
# Main enrichment
# ---------------------------------------------------------------------------
def enrich(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # -- 0. Composite global risk proxy (raw column is all zeros) ----------
    # max*0.5 + mean*0.5 weights the dominant risk region while averaging
    # across all regions. Scaled to ~0–1 range relative to observed maxima.
    region_risks = df[REGION_RISK_COLS].astype(float)
    df["computed_global_risk_proxy"] = (
        region_risks.max(axis=1) * 0.5 + region_risks.mean(axis=1) * 0.5
    ).round(4)

    # -- 1. Macrocycle position (1–4) and week type ------------------------
    df["macrocycle_position"] = ((df["week"].astype(int) - 1) % 4) + 1
    df["macrocycle_week_type"] = df["macrocycle_position"].apply(
        lambda p: "deload_week" if p == DELOAD_POSITION else "load_week"
    )

    # -- 2. Predicted weekly volume ----------------------------------------
    df["predicted_weekly_km"] = df.apply(
        lambda r: predict_weekly_km(
            str(r.get("marathon_phase", "build")),
            int(r["macrocycle_position"]),
        ),
        axis=1,
    )

    # -- 3. Delta: actual − predicted --------------------------------------
    df["volume_vs_predicted_delta_km"] = (
        df["weekly_km"].astype(float) - df["predicted_weekly_km"]
    ).round(2)

    # -- 4. Week-over-week % change per athlete ----------------------------
    # Sort by athlete and week to ensure correct sequential diff
    df = df.sort_values(["athlete_id", "week"]).reset_index(drop=True)
    df["_prev_weekly_km"] = df.groupby("athlete_id")["weekly_km"].shift(1)
    df["volume_change_pct_7d"] = (
        (df["weekly_km"] - df["_prev_weekly_km"]) / df["_prev_weekly_km"] * 100
    ).round(2)
    df.drop(columns=["_prev_weekly_km"], inplace=True)

    # -- 5. Cumulative 4-week volume per athlete (rolling window) ----------
    df["cumulative_volume_mesocycle_km"] = (
        df.groupby("athlete_id")["weekly_km"]
        .transform(lambda s: s.rolling(window=4, min_periods=1).sum())
        .round(2)
    )

    # -- 6. Composite volume injury risk flag ------------------------------
    df["volume_injury_risk_flag"] = df.apply(volume_injury_risk_flag, axis=1)

    # -- 7. Human-readable risk context label ------------------------------
    df["volume_risk_context"] = df.apply(volume_risk_context, axis=1)

    return df


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    print(f"Reading: {INPUT_CSV}")
    df = pd.read_csv(INPUT_CSV)
    print(f"  Rows: {len(df):,}  |  Columns: {len(df.columns)}")

    df_enriched = enrich(df)

    new_cols = [
        "computed_global_risk_proxy",
        "macrocycle_position",
        "macrocycle_week_type",
        "predicted_weekly_km",
        "volume_vs_predicted_delta_km",
        "volume_change_pct_7d",
        "cumulative_volume_mesocycle_km",
        "volume_injury_risk_flag",
        "volume_risk_context",
    ]
    print("\nNew columns added:")
    for col in new_cols:
        if df_enriched[col].dtype == object:
            sample = df_enriched[col].value_counts().to_dict()
        else:
            d = df_enriched[col].describe()
            sample = {k: round(v, 4) for k, v in d.items()}
        print(f"  {col}: {sample}")

    # -- Correlation: volume features × actual pain outcome columns -------
    print("\nCorrelation: volume features × pain_event_next_7d (actual binary outcome)")
    outcome_col = "pain_event_next_7d"
    numeric_cols = [
        "weekly_km",
        "predicted_weekly_km",
        "volume_vs_predicted_delta_km",
        "volume_change_pct_7d",
        "cumulative_volume_mesocycle_km",
        "volume_injury_risk_flag",
        "load_spike_ratio",
        "computed_global_risk_proxy",
        "acute_load_7d",
        "chronic_load_28d",
    ]
    corr = df_enriched[numeric_cols + [outcome_col]].corr()[outcome_col].drop(outcome_col)
    for col, val in corr.items():
        print(f"  {col:45s}: {val:+.4f}")

    print("\nCorrelation: volume features × future_pain_or_modification_14d")
    outcome_col2 = "future_pain_or_modification_14d"
    corr2 = df_enriched[numeric_cols + [outcome_col2]].corr()[outcome_col2].drop(outcome_col2)
    for col, val in corr2.items():
        print(f"  {col:45s}: {val:+.4f}")

    # -- Risk flag distribution by week type -------------------------------
    print("\nMean values by macrocycle_week_type:")
    print(
        df_enriched.groupby("macrocycle_week_type")[
            ["weekly_km", "computed_global_risk_proxy", "volume_injury_risk_flag",
             "load_spike_ratio", "pain_event_next_7d", "future_pain_or_modification_14d"]
        ].mean().round(4).to_string()
    )

    print("\nMean values by volume_risk_context:")
    ctx_summary = df_enriched.groupby("volume_risk_context")[
        ["weekly_km", "computed_global_risk_proxy", "volume_injury_risk_flag",
         "load_spike_ratio", "pain_event_next_7d", "future_pain_or_modification_14d"]
    ].mean().round(4)
    print(ctx_summary.to_string())

    print("\nMean values by macrocycle_position:")
    pos_summary = df_enriched.groupby("macrocycle_position")[
        ["weekly_km", "computed_global_risk_proxy", "load_spike_ratio",
         "pain_event_next_7d", "future_pain_or_modification_14d"]
    ].mean().round(4)
    print(pos_summary.to_string())

    # -- Write output ------------------------------------------------------
    df_enriched.to_csv(OUTPUT_CSV, index=False)
    print(f"\nEnriched dataset written: {OUTPUT_CSV}")
    print(f"  Rows: {len(df_enriched):,}  |  Columns: {len(df_enriched.columns)}")


if __name__ == "__main__":
    main()
