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
    CSI[Normalized CSI Frames] --> FE[Feature Extraction]
    FE --> PM[Proxy Metric Models]
    FE --> PI[Pose Inference Adapter]
    PM --> MS[MetricSnapshot]
    PI --> MF[InferredMotionFrame]
    MS --> WS[WebSocket]
    MF --> WS
    WS --> UI[Web UI]
```

## Service Boundaries

| Service | Responsibility | Does NOT own |
|---------|---------------|--------------|
| **firmware/** | CSI collection, serial output | Domain logic, persistence |
| **apps/gateway/** | Ingestion, realtime metrics, WebSocket streaming | Long-term storage, auth |
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

- **Proxy metrics**: computed directly in TypeScript from CSI feature windows
- **Pose inference**: delegated to a Python service via HTTP or loaded as ONNX in Node.js

For v1, proxy metrics run in-process. Pose inference uses a mock adapter that generates demo skeletal data, clearly marked as synthetic.

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
