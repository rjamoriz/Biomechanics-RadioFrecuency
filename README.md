# Biomechanics RadioFrequency Platform

Professional treadmill running biomechanics analytics powered by ESP32 Wi-Fi CSI sensing.

## What is this?

A station-based treadmill analytics platform that uses Wi-Fi Channel State Information (CSI) from affordable ESP32 hardware to estimate running biomechanics proxy metrics in real time — without cameras, wearables, or force plates.

> **Scientific honesty notice:** This system estimates motion from radio-frequency measurements. Front, rear, and lateral motion views are **synthetic renderings of an inferred body model**, not camera footage. Every metric includes confidence and validation status.

## Architecture

```
┌──────────┐    serial    ┌──────────┐   websocket   ┌──────────┐
│ ESP32 TX │───────────── │ Gateway  │──────────────── │  Web UI  │
│ ESP32 RX │    USB       │ (NestJS) │                │ (Next.js)│
└──────────┘              └────┬─────┘                └──────────┘
                               │ HTTP
                          ┌────▼─────┐
                          │ Backend  │
                          │ (Spring) │
                          └────┬─────┘
                          ┌────▼─────┐
                          │PostgreSQL│
                          └──────────┘
```

| Layer | Stack | Purpose |
|-------|-------|---------|
| **firmware/** | ESP-IDF / C | ESP32 CSI transmitter + receiver |
| **apps/gateway/** | NestJS / TypeScript | Serial ingestion, realtime metrics, WebSocket streaming |
| **apps/backend/** | Spring Boot / Java 21 | Domain API, persistence, auth, validation |
| **apps/web/** | Next.js / React / TypeScript | Operator dashboard, live sessions, replay, reports |
| **ml/** | Python 3.11 / PyTorch | Proxy metric models, optional pose inference |

## Quick Start

```bash
# 1. Clone and setup
git clone <repo-url> && cd biomechanics-radiofrequency
cp .env.example .env

# 2. Start database
make db-up

# 3. Start backend
make backend

# 4. Start gateway (demo mode if no ESP32 connected)
DEMO_MODE=true make gateway

# 5. Start web UI
make web

# 6. Open browser
open http://localhost:3000
```

## v1 Metrics

| Metric | Type | Description |
|--------|------|-------------|
| Cadence | Proxy | Steps per minute estimated from CSI periodicity |
| Step Interval | Proxy | Time between consecutive steps |
| Step Interval Variability | Proxy | Consistency of step timing |
| Symmetry Proxy | Proxy | Left/right step balance estimation |
| Contact Time Proxy | Proxy | Estimated ground contact duration |
| Flight Time Proxy | Proxy | Estimated aerial phase duration |
| Fatigue Drift Score | Derived | Trend in metric degradation over time |
| Signal Quality Score | Direct | CSI packet rate and signal stability |
| Model Confidence | Derived | Overall trust in current estimates |

## Output Classes (never mix these)

1. **Direct signal measurements** — CSI packets, RSSI, packet rate
2. **Derived proxy metrics** — cadence, symmetry proxy, contact-time proxy
3. **Inferred motion outputs** — 2D keypoints, 3D skeleton, synthetic renders

## Validation States

- `unvalidated` — no external reference comparison
- `experimental` — early-stage, limited testing
- `station_validated` — verified against station baseline
- `externally_validated` — compared against gold-standard reference

## Documentation

See [docs/](docs/) for detailed guides:

- [Architecture](docs/architecture.md)
- [Product Scope](docs/product_scope.md)
- [Sensing Limitations](docs/sensing_limitations.md)
- [Inferred Views](docs/inferred_views.md)
- [Hardware Setup](docs/hardware_setup.md)
- [Calibration Protocol](docs/calibration_protocol.md)
- [Validation Workflow](docs/validation_workflow.md)
- [Privacy & Security](docs/privacy_and_security.md)

## License

MIT — see [LICENSE](LICENSE)
