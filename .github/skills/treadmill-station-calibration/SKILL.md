---
name: treadmill-station-calibration
description: Build or improve treadmill station calibration workflows, calibration UI, calibration persistence, baseline collection, and station health logic. Use this when working on calibration screens, station setup, environment baselines, or signal-quality workflows.
---

# Treadmill Station Calibration

Use this skill when the task involves:
- station setup workflows
- calibration wizard screens
- baseline data capture
- treadmill-off / treadmill-on baselines
- athlete warm-up baselines
- calibration persistence
- signal quality scoring
- recalibration recommendations

## Objective

Treat calibration as a first-class product workflow.

The system is being deployed around treadmills in real gyms, so station behavior can drift due to:
- equipment movement
- nearby people
- reflective surfaces
- treadmill state changes
- wireless interference
- changing athlete position

Calibration must make these conditions explicit.

## Required calibration phases

Support these baseline phases whenever possible:
1. Environment baseline with treadmill OFF and no athlete
2. Treadmill ON baseline with no athlete at selected speeds
3. Athlete warm-up baseline
4. Station quality check
5. Recalibration trigger assessment

## Product rules

Calibration results should influence:
- signalQualityScore
- metricConfidence
- station health summaries
- warnings shown during live sessions
- session metadata and reporting context

Do not hide failed or degraded calibration states.

## Implementation guidance

When implementing calibration:
1. Model calibration runs explicitly in backend domain entities and DTOs.
2. Store baseline artifacts and summary metrics, not just a pass/fail boolean.
3. Make the frontend wizard step-based and operator-friendly.
4. Let the gateway expose enough runtime quality signals to support calibration decisions.
5. Add clear recommendations when recalibration is needed.
6. Link sessions to the calibration profile used at collection time.

## UX rules

Calibration screens should show:
- current step
- station identity
- treadmill identity
- signal-quality status
- progress
- pass/warn/fail result
- clear operator instructions
- timestamp of last successful calibration

Avoid vague “green means good” experiences with no explanation.

## Scientific rules

Calibration does not prove biomechanical validity.
Calibration only establishes station quality and repeatability for the sensing setup.

Do not imply:
- clinical accuracy
- optical motion capture equivalence
- validated joint kinematics

## Always update

When using this skill, update as needed:
- docs/calibration_protocol.md
- docs/station_placement.md
- docs/hardware_setup.md
- backend calibration entities and DTOs
- frontend calibration flows
- gateway quality-scoring logic
