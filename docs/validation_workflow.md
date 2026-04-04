# Validation Workflow

## Purpose

Validation compares Wi-Fi CSI-derived metrics against external reference data to quantify accuracy and move metrics from `experimental` to `externally_validated`.

## Supported Reference Formats

| Source | Format | Typical Metrics |
|--------|--------|-----------------|
| Treadmill console | CSV export | Speed, incline, time |
| IMU sensors | CSV | Accelerometer, gyroscope, step events |
| Video-derived | CSV | Keypoints, joint angles, cadence |
| Pressure insoles | CSV | Contact time, pressure distribution |
| Force plates | CSV | Ground reaction forces, COP |

## Workflow

### 1. Import Reference Data

```
POST /api/validations/import
Body: { sessionId, referenceType, file (multipart) }
```

The system parses the file, extracts timestamps and metrics, and stores the imported dataset.

### 2. Time Alignment

Reference data and CSI-derived data may have different:
- Sampling rates
- Clock offsets
- Start/end times

The validation engine:
- Identifies common time range
- Resamples to common timestamps
- Applies configurable offset correction (manual or cross-correlation)

### 3. Metric Comparison

For each comparable metric:

| Comparison | Method |
|-----------|--------|
| Cadence | MAE, RMSE, Pearson correlation |
| Step Interval | MAE, Bland-Altman |
| Contact Time | MAE, Bland-Altman |
| Symmetry | Correlation, bias |

### 4. Report Generation

Validation reports include:
- Per-metric error summaries
- Scatter plots (estimated vs. reference)
- Bland-Altman analysis
- Time series overlay
- Data quality notes
- Confidence and signal quality during validation window
- Validation status recommendation

### 5. Status Update

Based on results, the session's validation status can be upgraded:
- `unvalidated` → `experimental` (initial ML-based estimation)
- `experimental` → `station_validated` (consistent with station baseline)
- `station_validated` → `externally_validated` (matches external reference within tolerance)

**Status downgrades are automatic if re-validation shows degraded accuracy.**

## Important Rules

- Reference data is stored separately — never merged with CSI-derived data
- Original timestamps and values are preserved
- Transformations and alignment methods are documented per run
- Validation results do not retroactively change raw metric values
- Experimental and validated outputs are never silently mixed
