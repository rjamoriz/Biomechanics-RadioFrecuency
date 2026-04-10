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

## Quantum Computation Layer

The platform explores quantum-enhanced signal processing and machine learning to push the boundaries of Wi-Fi CSI biomechanics estimation. Quantum routines run as hybrid classical-quantum pipelines — the classical gateway preprocesses CSI data, quantum circuits extract features or optimize model parameters, and results feed back into the standard metric pipeline.

### Quantum Architecture Overview

```mermaid
graph TB
    subgraph Hardware["🔌 Hardware Layer"]
        TX["ESP32 TX<br/>CSI Transmitter"]
        RX["ESP32 RX<br/>CSI Receiver"]
    end

    subgraph Classical["⚙️ Classical Preprocessing"]
        GW["Gateway<br/>NestJS"]
        NORM["CSI Normalization<br/>& Feature Extraction"]
        BUF["Bounded Buffer<br/>Rolling Window"]
    end

    subgraph Quantum["⚛️ Quantum Processing"]
        ENC["Quantum State<br/>Encoding"]
        QFT["Quantum Fourier<br/>Transform"]
        VQC["Variational Quantum<br/>Circuit"]
        MEAS["Measurement &<br/>Tomography"]
    end

    subgraph PostProcess["📊 Post-Processing"]
        DECODE["Classical<br/>Decoding"]
        METRICS["Proxy Metric<br/>Estimation"]
        CONF["Confidence &<br/>Validation"]
    end

    subgraph Visualization["🖥️ D3.js Visualization"]
        BLOCH["Bloch Sphere<br/>State Viewer"]
        CIRC["Circuit Diagram<br/>Renderer"]
        PROB["Probability<br/>Distribution"]
    end

    TX -->|CSI packets| RX
    RX -->|serial USB| GW
    GW --> NORM
    NORM --> BUF
    BUF --> ENC
    ENC --> QFT
    ENC --> VQC
    QFT --> MEAS
    VQC --> MEAS
    MEAS --> DECODE
    DECODE --> METRICS
    METRICS --> CONF
    CONF --> BLOCH
    CONF --> CIRC
    CONF --> PROB

    style Quantum fill:#7c3aed,stroke:#5b21b6,color:#fff
    style Classical fill:#2563eb,stroke:#1d4ed8,color:#fff
    style Hardware fill:#059669,stroke:#047857,color:#fff
    style PostProcess fill:#d97706,stroke:#b45309,color:#fff
    style Visualization fill:#e11d48,stroke:#be123c,color:#fff
```

### Quantum Signal Processing Pipeline

The CSI subcarrier amplitudes are encoded into quantum states via amplitude encoding. A Quantum Fourier Transform (QFT) extracts periodic gait features (cadence, step intervals) with exponential speedup over classical DFT for high-dimensional subcarrier spaces.

```mermaid
flowchart LR
    subgraph Input["CSI Input"]
        RAW["Raw CSI<br/>52 subcarriers × N frames"]
    end

    subgraph Encode["Amplitude Encoding"]
        direction TB
        A1["|ψ⟩ = Σ αᵢ|i⟩"]
        A2["Normalize amplitudes<br/>to unit vector"]
        A3["Log₂(52) ≈ 6 qubits<br/>per frame"]
    end

    subgraph QFT_Block["Quantum Fourier Transform"]
        direction TB
        H["Hadamard<br/>Gates"]
        CR["Controlled<br/>Rotation"]
        SW["SWAP<br/>Network"]
        Q1["Extract gait<br/>periodicity"]
    end

    subgraph Measure["Measurement"]
        direction TB
        M1["Computational<br/>basis measurement"]
        M2["Frequency bin<br/>probabilities"]
        M3["Peak detection<br/>→ cadence estimate"]
    end

    RAW --> A2 --> A1 --> A3
    A3 --> H --> CR --> SW --> Q1
    Q1 --> M1 --> M2 --> M3

    style QFT_Block fill:#7c3aed,stroke:#5b21b6,color:#fff
    style Encode fill:#2563eb,stroke:#1d4ed8,color:#fff
    style Measure fill:#d97706,stroke:#b45309,color:#fff
```

### Variational Quantum Classifier (VQC) for Gait Phase Detection

A parameterized quantum circuit classifies gait phases (stance vs. swing, left vs. right) from CSI feature vectors. The circuit is trained with a classical optimizer in a hybrid loop.

```mermaid
flowchart TB
    subgraph Training["Hybrid Training Loop"]
        direction LR
        FEAT["CSI Feature<br/>Vector x"]
        PARAM["Parameters θ"]

        subgraph Circuit["Parameterized Quantum Circuit"]
            direction TB
            RY1["Rᵧ(x₁)"] --> CX1["CNOT"]
            RY2["Rᵧ(x₂)"] --> CX1
            CX1 --> RZ1["Rᵤ(θ₁)"]
            CX1 --> RZ2["Rᵤ(θ₂)"]
            RZ1 --> CX2["CNOT"]
            RZ2 --> CX2
            CX2 --> RY3["Rᵧ(θ₃)"]
            CX2 --> RY4["Rᵧ(θ₄)"]
        end

        MEAS2["Measure<br/>⟨Z⟩"]
        LOSS["Cross-Entropy<br/>Loss"]
        OPT["Classical<br/>Optimizer<br/>(COBYLA)"]

        FEAT --> RY1
        FEAT --> RY2
        PARAM --> RZ1
        PARAM --> RZ2
        RY3 --> MEAS2
        RY4 --> MEAS2
        MEAS2 --> LOSS
        LOSS --> OPT
        OPT -->|"update θ"| PARAM
    end

    subgraph Output["Classification Output"]
        STANCE["Stance Phase<br/>P(|0⟩)"]
        SWING["Swing Phase<br/>P(|1⟩)"]
        SYM["Symmetry Proxy<br/>|P_left - P_right|"]
    end

    MEAS2 --> STANCE
    MEAS2 --> SWING
    STANCE --> SYM
    SWING --> SYM

    style Circuit fill:#7c3aed,stroke:#5b21b6,color:#fff
    style Training fill:#1e293b,stroke:#334155,color:#fff
    style Output fill:#059669,stroke:#047857,color:#fff
```

### Quantum State Tomography for Signal Quality Assessment

Quantum state tomography reconstructs the density matrix ρ of the encoded CSI signal. The purity Tr(ρ²) serves as a quantum-derived signal quality indicator — high purity means coherent gait signal, low purity indicates noise or multi-person interference.

```mermaid
graph LR
    subgraph Prep["State Preparation"]
        S1["Encode CSI<br/>window |ψ⟩"]
    end

    subgraph Tomo["Tomography Protocol"]
        direction TB
        MX["Measure in<br/>X basis"]
        MY["Measure in<br/>Y basis"]
        MZ["Measure in<br/>Z basis"]
    end

    subgraph Reconstruct["Density Matrix Reconstruction"]
        RHO["ρ = Σ rᵢⱼ |i⟩⟨j|"]
        PUR["Purity = Tr(ρ²)"]
        ENT["Von Neumann<br/>Entropy S(ρ)"]
    end

    subgraph Quality["Signal Quality Mapping"]
        HI["Purity > 0.8<br/>✅ High Quality"]
        MED["0.5 < Purity < 0.8<br/>⚠️ Moderate"]
        LO["Purity < 0.5<br/>🔴 Low Quality"]
    end

    S1 --> MX & MY & MZ
    MX & MY & MZ --> RHO
    RHO --> PUR
    RHO --> ENT
    PUR --> HI & MED & LO

    style Tomo fill:#7c3aed,stroke:#5b21b6,color:#fff
    style Reconstruct fill:#2563eb,stroke:#1d4ed8,color:#fff
    style Quality fill:#d97706,stroke:#b45309,color:#fff
```

### Quantum-Enhanced Anomaly Detection (Fatigue Drift)

A quantum kernel method maps CSI time series into a high-dimensional Hilbert space where gait degradation patterns become linearly separable. The quantum kernel $K(x_i, x_j) = |\langle\phi(x_i)|\phi(x_j)\rangle|^2$ captures nonlinear fatigue signatures that classical kernels miss.

```mermaid
flowchart TB
    subgraph DataStream["Streaming CSI Windows"]
        W1["Window t₁<br/>Baseline"]
        W2["Window t₂"]
        W3["Window t₃"]
        WN["Window tₙ<br/>Current"]
    end

    subgraph QuantumKernel["Quantum Kernel Estimation"]
        direction TB
        PHI1["|φ(x₁)⟩ = U(x₁)|0⟩"]
        PHI2["|φ(x₂)⟩ = U(x₂)|0⟩"]
        SWAP_TEST["SWAP Test<br/>Circuit"]
        KERNEL["K(x₁,x₂) = |⟨φ(x₁)|φ(x₂)⟩|²"]
    end

    subgraph Detection["Anomaly Detection"]
        DRIFT["Kernel Distance<br/>from Baseline"]
        THRESH["Adaptive<br/>Threshold"]
        FATIGUE["Fatigue Drift<br/>Score"]
    end

    W1 --> PHI1
    WN --> PHI2
    PHI1 --> SWAP_TEST
    PHI2 --> SWAP_TEST
    SWAP_TEST --> KERNEL
    KERNEL --> DRIFT
    DRIFT --> THRESH
    THRESH --> FATIGUE

    style QuantumKernel fill:#7c3aed,stroke:#5b21b6,color:#fff
    style Detection fill:#e11d48,stroke:#be123c,color:#fff
```

### D3.js Interactive Visualizations

The web frontend (`apps/web`) includes D3.js-powered interactive visualizations for the quantum computation layer, available in the observatory dashboard:

| Visualization | D3.js Component | Description |
|--------------|-----------------|-------------|
| **Bloch Sphere** | `d3-bloch-sphere` | 3D interactive qubit state visualization with rotation and zoom |
| **Circuit Diagram** | `d3-quantum-circuit` | Gate-level circuit rendering with depth and qubit annotations |
| **Probability Histogram** | `d3-prob-distribution` | Measurement outcome probabilities with confidence intervals |
| **Kernel Heatmap** | `d3-kernel-matrix` | Quantum kernel similarity matrix with fatigue drift highlighting |
| **Purity Timeline** | `d3-purity-chart` | Real-time quantum purity (signal quality) over session duration |
| **State Tomography** | `d3-density-matrix` | Density matrix magnitude visualization as color-mapped grid |

### Quantum Circuit Notation Reference

```mermaid
graph LR
    subgraph Gates["Quantum Gate Library"]
        direction TB
        G1["H — Hadamard<br/>Creates superposition"]
        G2["Rᵧ(θ) — Y-Rotation<br/>Amplitude encoding"]
        G3["Rᵤ(θ) — Z-Rotation<br/>Phase encoding"]
        G4["CNOT — Entanglement<br/>2-qubit correlation"]
        G5["SWAP — State exchange<br/>Network routing"]
        G6["QFT — Quantum Fourier<br/>Frequency extraction"]
    end

    subgraph Metrics["Biomechanics Mapping"]
        direction TB
        M1["QFT peak → Cadence"]
        M2["VQC output → Gait phase"]
        M3["Kernel distance → Fatigue"]
        M4["State purity → Signal quality"]
        M5["Entanglement entropy → Complexity"]
    end

    G1 --> M1
    G2 --> M2
    G4 --> M3
    G5 --> M4
    G6 --> M5

    style Gates fill:#7c3aed,stroke:#5b21b6,color:#fff
    style Metrics fill:#059669,stroke:#047857,color:#fff
```

### Running Quantum Experiments

```bash
# Run quantum simulation locally (no quantum hardware needed)
cd ml && python -m quantum.simulate --input sample_csi.npy

# Train variational quantum classifier
cd ml && python -m quantum.train_vqc --epochs 50 --qubits 6

# Evaluate quantum kernel anomaly detection
cd ml && python -m quantum.eval_kernel --baseline session_001.npy --test session_042.npy

# Export quantum circuit to OpenQASM 3.0
cd ml && python -m quantum.export_qasm --circuit vqc_gait --output circuit.qasm
```

> **Note:** Quantum routines run on simulators by default. For real quantum hardware execution via IBM Quantum or Azure Quantum, configure credentials in `.env`. All quantum-derived metrics carry an `experimental` validation status until externally validated.

---

## Documentation

See [docs/](docs/) for detailed guides:

- [Architecture](docs/architecture.md)
- [Product Scope](docs/product_scope.md)
- [Quantum & Bloch Sphere Analysis](docs/quantum_bloch_sphere_analysis.md)
- [Sensing Limitations](docs/sensing_limitations.md)
- [Inferred Views](docs/inferred_views.md)
- [Hardware Setup](docs/hardware_setup.md)
- [Calibration Protocol](docs/calibration_protocol.md)
- [Validation Workflow](docs/validation_workflow.md)
- [Privacy & Security](docs/privacy_and_security.md)

## License

MIT — see [LICENSE](LICENSE)
