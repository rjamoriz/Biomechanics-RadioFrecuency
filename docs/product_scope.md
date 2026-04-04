# Product Scope — v1

## Mission

A station-based treadmill analytics platform that estimates running biomechanics from ESP32 Wi-Fi CSI, with optional inferred synthetic motion views.

## v1 Metrics

| Metric | Type | Source |
|--------|------|--------|
| Cadence (steps/min) | Proxy | CSI amplitude periodicity |
| Step Interval (ms) | Proxy | Peak-to-peak timing |
| Step Interval Variability | Proxy | CV of step intervals |
| Symmetry Proxy | Proxy | L/R step interval ratio |
| Contact Time Proxy (ms) | Proxy | Amplitude envelope duty cycle |
| Flight Time Proxy (ms) | Proxy | Complement of contact time |
| Form Stability Score | Derived | Composite of variability metrics |
| Fatigue Drift Score | Derived | Metric degradation trend |
| Signal Quality Score | Direct | Packet rate + RSSI stability |
| Model Confidence | Derived | Signal quality + estimation stability |

## v1 Features

- Live dashboard with active station monitoring
- Athlete profile management
- Treadmill protocol templates with speed/incline stages
- Live session screen with realtime metric charts
- Session events (speed change, shoe change, fatigue onset, etc.)
- Station calibration wizard (5-step flow)
- Session replay with metric charts and stage overlays
- Basic session summary reports
- Validation import workflow (IMU CSV, treadmill console, etc.)

## Advanced Mode (Experimental)

Optional research mode providing:
- Inferred 2D keypoint trajectories
- Inferred 3D skeleton
- Simplified body model rendering
- Synthetic front/rear/lateral/orbit views

**Clearly marked as:** experimental, model-inferred, not equivalent to camera-based biomechanics capture.

## Hardware Topology (v1)

- 1x ESP32 as Wi-Fi AP / traffic source (TX)
- 1x ESP32 as CSI receiver / collector (RX)
- 1x host computer connected via USB serial
- Support for future multi-receiver and hybrid validation modes

## Sensing Modes

1. **Proxy Analytics Mode** — metrics only, no skeleton, safest for deployments
2. **Inferred Motion View Mode** — ML-based skeletal estimation, synthetic rendering, experimental
