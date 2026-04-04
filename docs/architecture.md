# Architecture

## System Overview

```mermaid
graph LR
    subgraph Hardware
        TX[ESP32 TX/AP]
        RX[ESP32 RX/CSI]
    end
    subgraph Host
        GW[Gateway - NestJS]
        BE[Backend - Spring Boot]
        DB[(PostgreSQL)]
        WEB[Web UI - Next.js]
    end

    TX -->|Wi-Fi traffic| RX
    RX -->|USB Serial| GW
    GW -->|WebSocket| WEB
    GW -->|HTTP| BE
    BE -->|JPA| DB
    WEB -->|HTTP/REST| BE
```

## CSI Ingestion Pipeline

```mermaid
sequenceDiagram
    participant ESP32 as ESP32 RX
    participant Serial as Serial Parser
    participant Norm as Normalizer
    participant Buf as Ring Buffer
    participant Metrics as Metric Estimators
    participant WS as WebSocket Gateway
    participant UI as Web UI

    ESP32->>Serial: CSV line over UART
    Serial->>Norm: CsiPacket
    Norm->>Buf: NormalizedCsiFrame
    Buf->>Metrics: Rolling window
    Metrics->>WS: MetricSnapshot
    WS->>UI: Real-time update
```

## Realtime Inference Flow

```mermaid
graph TD
    CSI[Normalized CSI Frames] --> SP[Signal Processing]
    SP --> HF[Hampel Filter]
    SP --> PU[Phase Unwrap + Detrend]
    SP --> SC[Subcarrier Selection]
    HF --> FE[Feature Extraction]
    PU --> VS[Vital Signs Extraction]
    SC --> FE
    PU --> BVP[Body Velocity Profile]
    VS --> BP[Bandpass + FFT → Breathing / Heart Rate]
    FE --> PM[Proxy Metric Models]
    FE --> PI[Pose Inference Adapter]
    BVP --> PM
    PM --> MS[MetricSnapshot]
    PI --> MF[InferredMotionFrame]
    BP --> VSS[VitalSignsSnapshot]
    MS --> WS[WebSocket]
    MF --> WS
    VSS --> WS
    WS --> UI[Web UI]
    MS --> REST[REST /api/v1/sensing/*]
    VSS --> REST
```

## Service Boundaries

| Service | Responsibility | Does NOT own |
|---------|---------------|--------------|
| **firmware/** | CSI collection, serial output | Domain logic, persistence |
| **apps/gateway/** | Ingestion, signal processing, realtime metrics, vital signs, WebSocket streaming, REST API | Long-term storage, auth |
| **apps/backend/** | Domain data, auth, persistence, validation, reports | Realtime processing, serial I/O |
| **apps/web/** | UI, visualization, user interaction | Business rules, signal processing |
| **ml/** | Training, evaluation, model export | Runtime serving (gateway handles inference) |

## Data Flow

1. **ESP32 TX** generates controlled Wi-Fi traffic
2. **ESP32 RX** captures CSI and emits CSV lines over serial
3. **Gateway** parses, normalizes, buffers, estimates metrics, optionally infers pose
4. **Gateway** streams to **Web UI** via WebSocket and pushes batches to **Backend** via HTTP
5. **Backend** persists sessions, metrics, validation runs, reports in **PostgreSQL**
6. **Web UI** renders dashboards, live sessions, replay, reports, and optional inferred motion views

## Inference Architecture Decision

The gateway integrates inference via an adapter pattern:

- **Signal processing**: Hampel filter, phase unwrapping, bandpass IIR, subcarrier selection, Body Velocity Profile — all in TypeScript
- **Proxy metrics**: computed directly in TypeScript from CSI feature windows
- **Vital signs**: breathing BPM and heart rate BPM estimated from CSI phase via FFT peak detection (experimental)
- **Pose inference**: delegated to a Python service via HTTP or loaded as ONNX in Node.js
- **REST API**: GET endpoints at `/api/v1/sensing/*` for polling access to latest metrics, vital signs, and signal quality

For v1, proxy metrics and vital signs run in-process. Pose inference uses a mock adapter that generates demo skeletal data, clearly marked as synthetic.

## API Surface

### WebSocket Events (Socket.IO, namespace `/live`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `metrics` | server → client | Realtime proxy metrics at ~10 Hz |
| `vital-signs` | server → client | Breathing + heart rate estimates at ~1 Hz |
| `inferred-motion` | server → client | Inferred pose/skeleton frames |
| `treadmill-state` | server → client | Treadmill speed/incline changes |
| `connection-ack` | server → client | Connection acknowledgment with gateway version |
| `set-treadmill` | client → server | Manual speed/incline update |
| `start-protocol` | client → server | Start a treadmill protocol |
| `stop-protocol` | client → server | Stop current protocol |

### REST Endpoints (Gateway)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | System health check with pipeline status |
| GET | `/api/v1/sensing/latest` | Latest metric snapshot |
| GET | `/api/v1/sensing/vital-signs` | Breathing + heart rate estimates |
| GET | `/api/v1/sensing/signal-quality` | Signal quality details |
| GET | `/api/v1/sensing/status` | Sensing pipeline status summary |

### REST Endpoints (Gateway — Demo Mode Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/demo/status` | Current simulation state |
| POST | `/api/v1/demo/profile` | Switch athlete profile |
| POST | `/api/v1/demo/protocol` | Start a treadmill protocol |
| POST | `/api/v1/demo/fatigue` | Set fatigue rate (0–1) |
| POST | `/api/v1/demo/noise` | Set signal noise level |
| POST | `/api/v1/demo/reset` | Reset simulation to zero |
| GET | `/api/v1/demo/profiles` | List available athlete profiles |
| GET | `/api/v1/demo/protocols` | List available protocols |

## Demo Simulation Mode

For development and testing without physical ESP32 hardware, the gateway supports
a full simulation mode activated by `DEMO_MODE=true`.

```mermaid
graph LR
    subgraph DemoModule
        DS[DemoSimulatorService] -->|synthetic CsiPacket| SP[SerialService.packets$]
        DPG[DemoPoseGenerator] -->|animated skeleton| PA[PoseInferenceAdapter]
        DC[DemoController] -->|REST control| DS
    end
    SP --> Pipeline[Normal Processing Pipeline]
    PA --> WS[WebSocket]
    Pipeline --> WS
    WS --> UI[Web UI + DemoControlPanel]
```

Key characteristics:
- **Injected via `@Optional()`** — production code has zero awareness of demo logic
- **Physiological models** — gait, breathing, heart rate adapt to speed/incline/fatigue
- **Three athlete profiles** — elite, recreational, rehab patient
- **Three protocols** — progressive 5K, VO₂ max ramp, interval training
- **Dual control** — REST API (`/api/v1/demo/*`) and WebSocket (`demo-control` events)
- **Animated pose** — 17 COCO keypoints phase-locked to gait cycle

See [docs/demo-mode.md](demo-mode.md) for full usage guide.

## Session Replay

```mermaid
graph LR
    DB[(PostgreSQL)] --> BE[Backend API]
    BE --> WEB[Replay UI]
    WEB --> Charts[Metric Charts]
    WEB --> Motion[Inferred Motion Player]
    WEB --> Events[Event Timeline]
```

Replay loads persisted metric series and optional inferred motion series from the backend, rendering them with confidence overlays and stage markers.
