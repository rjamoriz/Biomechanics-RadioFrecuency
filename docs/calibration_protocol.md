# Calibration Protocol

## Purpose

Calibration establishes environment and station baselines so the system can distinguish athlete-caused CSI changes from background noise and treadmill vibration.

## 5-Step Calibration Wizard

### Step 1: Environment Baseline

**Condition:** Treadmill OFF, no athlete, gym at normal activity level.

- Collect 60 seconds of CSI data
- Measure ambient signal quality, multipath profile, and noise floor
- Save as environment baseline

### Step 2: Treadmill-On Baseline

**Condition:** Treadmill ON at typical speed (e.g., 8 km/h), no athlete on belt.

- Collect 60 seconds of CSI data
- Measure treadmill motor and belt vibration effect on CSI
- Save as treadmill baseline

### Step 3: Athlete Warm-Up Baseline

**Condition:** Treadmill ON, athlete walking at warm-up pace (e.g., 4–5 km/h).

- Collect 60 seconds of CSI data
- Establish the amplitude range and periodicity for this athlete/station combo
- Save as athlete baseline

### Step 4: Station Quality Check

**Automated analysis:**
- Compare signal-to-noise ratio across baselines
- Check packet rate stability
- Verify periodicity detection is feasible
- Compute overall station quality score (0–100)

**Result:** PASS (proceed to sessions) or WARN (review placement, retry calibration)

### Step 5: Recalibration Recommendations

Display recommendations if quality is low:
- Adjust TX/RX placement
- Remove obstructions
- Reduce nearby Wi-Fi interference
- Check hardware connections
- Retry from Step 1

## Calibration Data Storage

Each calibration profile stores:
- Station ID
- Timestamp
- Operator who performed calibration
- Environment baseline data summary
- Treadmill baseline data summary
- Athlete baseline data summary (optional)
- Quality score
- Status: PENDING / COMPLETED / EXPIRED

## Expiration

Calibration profiles expire when:
- Station hardware is moved
- Equipment near the station changes
- A configurable time limit is reached (default: 24 hours)
- Signal quality degrades below threshold during a session

## API

- `POST /api/calibrations/{stationId}/start` — begin calibration flow
- `GET /api/calibrations/{stationId}/current` — get active calibration profile
- `GET /api/calibrations/{stationId}/history` — list past calibrations
