# Demo Mode — Testing Without ESP32 Hardware

The platform includes a comprehensive simulation mode for testing the full pipeline
without any physical ESP32 sensors.

## Quick Start

```bash
# Install dependencies (first time only)
make setup

# Start gateway in demo mode + web app
make demo
```

Then open [http://localhost:3000](http://localhost:3000) — the dashboard will show
live simulated data with a **Demo Mode** badge.

## What Gets Simulated

| Signal Layer | What's Generated |
|---|---|
| CSI packets | 32 subcarriers × I/Q pairs at 100 Hz |
| Gait dynamics | Speed-adaptive cadence, stride length, vertical oscillation |
| Breathing | Rate adapts from ~15 BPM (rest) to ~30 BPM (sprint) |
| Heart rate | Ramps from ~70 BPM (rest) with speed, incline, and fatigue |
| Signal quality | RSSI fluctuations, optional noise bursts |
| Fatigue | Progressive cadence variability, asymmetry drift, contact time increase |
| Pose skeleton | Animated 17-keypoint COCO skeleton phase-locked to gait |

## Athlete Profiles

Three preset profiles simulate different runner types:

| Profile | Cadence | Asymmetry | Fatigue Resistance | Use Case |
|---|---|---|---|---|
| `elite-runner` | 170–200 SPM | 2% | High (0.8) | Pro / trained athletes |
| `recreational` | 160–190 SPM | 4% | Moderate (0.5) | Average gym runners |
| `rehab-patient` | 140–170 SPM | 7% | Low (0.3) | Rehabilitation / gait retraining |

## Treadmill Protocols

Three predefined protocols for structured testing:

| Protocol | Stages | Description |
|---|---|---|
| `progressive-5k` | 5 × 5 min | 6 → 8 → 10 → 12 → 14 km/h, 0% incline |
| `vo2max-ramp` | 8 × 2 min | Start 8 km/h, +1 km/h per stage, 1% incline |
| `interval-training` | 8 stages | Alternating 12 km/h (2 min) / 6 km/h (1 min) |

## Controlling the Demo

### From the Frontend

When demo mode is active, a **Demo Control Panel** appears at the top of the dashboard:

- **Profile selector** — switch between athlete profiles
- **Protocol selector** — start/stop predefined protocols
- **Speed/incline sliders** — manual treadmill control
- **Fatigue rate slider** — accelerate or disable fatigue progression
- **Signal noise selector** — clean / moderate / noisy
- **Reset** — restart simulation from zero

### From the REST API

```bash
# Check simulation status
curl http://localhost:3001/api/v1/demo/status | python3 -m json.tool

# List available profiles
curl http://localhost:3001/api/v1/demo/profiles

# Switch to rehab patient profile
curl -X POST http://localhost:3001/api/v1/demo/profile \
  -H 'Content-Type: application/json' \
  -d '{"name": "rehab-patient"}'

# Start a protocol
curl -X POST http://localhost:3001/api/v1/demo/protocol \
  -H 'Content-Type: application/json' \
  -d '{"name": "progressive-5k"}'

# Add noise to the signal
curl -X POST http://localhost:3001/api/v1/demo/noise \
  -H 'Content-Type: application/json' \
  -d '{"level": "noisy"}'

# Speed up fatigue (0 = none, 1 = fast)
curl -X POST http://localhost:3001/api/v1/demo/fatigue \
  -H 'Content-Type: application/json' \
  -d '{"rate": 0.8}'

# Reset everything
curl -X POST http://localhost:3001/api/v1/demo/reset
```

### From WebSocket

Connect to `/live` namespace and emit `demo-control`:

```javascript
socket.emit('demo-control', { action: 'set-profile', payload: { name: 'elite-runner' } });
socket.emit('demo-control', { action: 'start-protocol', payload: { name: 'vo2max-ramp' } });
socket.emit('demo-control', { action: 'set-fatigue', payload: { rate: 0.5 } });
socket.emit('demo-control', { action: 'set-noise', payload: { level: 'moderate' } });
socket.emit('demo-control', { action: 'reset' });
```

The gateway broadcasts `demo-state` every 2 seconds with full simulation state.

## Physiological Models

The simulator uses simplified but physiologically plausible models:

- **Gait frequency**: `0.5 + speedKmh × 0.2` Hz (maps to 120–220 SPM range)
- **Breathing**: resting rate + speed factor + fatigue factor
- **Heart rate**: resting + speed kernel + incline component + fatigue component
- **Fatigue**: sigmoid ramp starting ~5 min, modulated by profile resistance
- **Asymmetry**: baseline asymmetry + (fatigue × 0.04)
- **Signal quality**: Gaussian RSSI noise scaled by noise level setting

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DEMO_MODE` | `false` | Enable demo simulation |
| `SERIAL_PORT` | `/dev/ttyUSB0` | Ignored when `DEMO_MODE=true` |

## Testing Without Frontend

The gateway runs standalone in demo mode:

```bash
make demo-gateway
```

Then use curl or wscat to verify:

```bash
# Health check
make health

# Latest sensing data
make sensing

# Vital signs
make vitals

# Demo status
curl http://localhost:3001/api/v1/demo/status | python3 -m json.tool
```

## Scientific Disclaimer

All demo data is **synthetically generated** and marked with:
- `validationStatus: 'experimental'`
- `experimental: true` on pose frames
- `confidenceLevel` computed from simulated signal quality
- Mandatory disclaimer on all inferred motion outputs

Demo mode exists for development, testing, and demonstration purposes.
It does not represent real biomechanical measurements.
