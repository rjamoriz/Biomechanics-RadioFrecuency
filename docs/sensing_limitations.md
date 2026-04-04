# Sensing Limitations

This document separates what the platform can measure, estimate, infer, and what it cannot claim.

## 1. Direct Signal Measurements

These are physically measured by the ESP32 hardware:

| Measurement | Source | Reliability |
|------------|--------|-------------|
| CSI packet stream | ESP32 RX Wi-Fi callback | Hardware-dependent |
| RSSI | Per-packet signal strength | Noisy but real |
| Packet rate | Packets per second received | Direct count |
| Channel | Wi-Fi channel number | Configured |
| MAC address | Source device identifier | Direct |

These are ground truth for the sensing layer. They do not require ML models.

## 2. Derived Proxy Metrics

These are computed from CSI features using signal processing and/or trained ML models:

| Metric | Method | Confidence Level |
|--------|--------|-----------------|
| Cadence | CSI amplitude periodicity (autocorrelation / peak detection) | Moderate when signal quality is good |
| Step Interval | Peak-to-peak timing in CSI envelope | Moderate |
| Step Interval Variability | Statistical dispersion of step intervals | Moderate |
| Symmetry Proxy | Ratio of alternating step intervals | Low-to-moderate |
| Contact Time Proxy | Duty cycle of CSI amplitude envelope | Low-to-moderate |
| Flight Time Proxy | Complement of contact time proxy | Low-to-moderate |
| Fatigue Drift Score | Trend analysis of metric degradation | Experimental |
| Form Stability Score | Composite variability score | Experimental |

**These are proxy estimates**, not exact biomechanical measurements. Accuracy depends on station calibration, signal quality, and environmental conditions.

## 3. Inferred Motion Outputs

These are ML model outputs that reconstruct body pose from Wi-Fi features:

| Output | Method | Status |
|--------|--------|--------|
| 2D Keypoints | CNN/Transformer on CSI feature tensors | Experimental |
| 3D Skeleton | Lifting network from 2D or direct 3D regression | Experimental |
| Body Model | Simplified mesh from joint positions | Experimental |
| Synthetic Views | Rendered projections of inferred skeleton | Experimental |

**These are model-inferred approximations.** They require cross-modality supervision (camera labels, IMU, depth sensors) for training. Wi-Fi alone cannot produce camera-equivalent body tracking.

## 4. What We Cannot Claim

The following claims are NOT supported by Wi-Fi CSI sensing:

- ❌ True optical front/rear/lateral camera views
- ❌ Exact joint angles without external validation
- ❌ Exact ground reaction forces
- ❌ Exact plantar pressure distribution
- ❌ Exact center of pressure trajectory
- ❌ Medical diagnosis of any kind
- ❌ Injury risk diagnosis
- ❌ Clinical-grade gait analysis without external validation

## 5. Environmental Constraints

Wi-Fi CSI sensing is affected by:

- **Multipath**: reflections from walls, metal structures, treadmill frame
- **Interference**: other Wi-Fi networks, gym equipment, Bluetooth
- **People**: nearby humans cause CSI variation even if not on treadmill
- **Placement**: TX/RX distance, height, angle relative to treadmill
- **Drift**: environmental changes over time (temperature, humidity, furniture moves)

## 6. Validation Requirements

To move any metric from `experimental` to `externally_validated`:

1. Collect synchronized reference data (IMU, force plate, video, etc.)
2. Align timestamps between CSI-derived and reference data
3. Compute error metrics (MAE, correlation, Bland-Altman)
4. Document conditions, limitations, and sample size
5. Update validation status in the system

No metric should be automatically promoted from experimental to validated.
