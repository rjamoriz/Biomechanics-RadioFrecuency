You are a principal software architect, senior full-stack engineer, Java backend architect, Node.js realtime systems engineer, Next.js/React frontend lead, ML systems engineer, and Wi-Fi sensing product engineer.

Build me a complete, production-style monorepo for a gym-installed treadmill running analytics platform that uses ESP32 Wi-Fi CSI as the primary sensing modality for contactless running biomechanics estimation.

This is NOT a generic HAR demo.
This is a professional application for coaches, sports scientists, lab operators, and gym performance centers.

## Product mission
Create a station-based treadmill analytics platform that can:
1. monitor live treadmill running sessions,
2. estimate running biomechanics proxy metrics from Wi-Fi CSI,
3. infer a 2D/3D body model from Wi-Fi data when enabled,
4. render synthetic front, rear, and lateral motion views from the inferred model,
5. manage athlete profiles and treadmill protocols,
6. calibrate the sensing station,
7. replay sessions,
8. compare sessions longitudinally,
9. validate estimated metrics against external references,
10. generate professional reports.

## Critical scientific and product guardrails
Design the product honestly and professionally.

### Non-negotiable language rules
- Wi-Fi-derived views are NOT camera views.
- Front / rear / lateral displays are synthetic renderings of an inferred body model.
- The system does NOT produce true visual footage.
- The system estimates motion from RF/Wi-Fi measurements.
- Every metric and every rendered motion view must have:
  - confidence
  - validation status
  - station quality context

### Required terminology
Use precise labels in UI, API, and docs:
- estimated metric
- proxy metric
- inferred pose
- inferred body model
- synthetic motion view
- rendered lateral view
- rendered rear view
- rendered front view
- confidence
- validation status
- signal quality
- calibration status

### Unsupported claims
Do NOT claim:
- true optical front/rear/lateral views
- exact joint kinematics without validation
- exact ground reaction forces
- exact plantar pressure
- exact center of pressure
- medical diagnosis
- injury diagnosis
- clinical-grade gait analysis without external validation

## Product scope for v1
v1 should prioritize these metrics:
- cadence
- step frequency
- step interval
- step interval variability
- symmetry proxy
- contact-time proxy
- flight-time proxy
- form stability score
- fatigue drift score
- signal quality score
- model confidence
- stage-based summaries by treadmill speed and incline

### Optional advanced mode
Support an optional research mode for:
- inferred 2D keypoint trajectories
- inferred 3D skeleton
- inferred body mesh abstraction
- synthetic rendered motion views from:
  - lateral
  - rear
  - front
  - free orbit camera
This mode must be clearly marked:
- experimental
- model-inferred
- not equivalent to camera-based biomechanics capture

## Sensing and model architecture stance
Use an affordable ESP32 CSI prototype architecture for v1.

### Hardware topology
- one ESP32 as traffic source / AP / transmitter
- one ESP32 as CSI receiver / collector
- one host computer connected over USB serial
- optional future support for more receivers, but v1 must work with the affordable 2-node setup

### Important sensing abstraction
Create a sensing abstraction boundary so the app can support:
1. low-cost CSI proxy estimation mode
2. future multi-receiver pose estimation mode
3. future hybrid validation mode with optional camera, IMU, or pressure data import

### Pose inference stance
The application must support two modes:
1. Proxy Analytics Mode
   - no inferred skeleton required
   - metrics only
   - safest and most practical for early deployments

2. Inferred Motion View Mode
   - uses ML to estimate 2D/3D skeletal/body-model representations from Wi-Fi-derived features
   - renders synthetic front/rear/lateral views
   - marked clearly as inferred and experimental unless validated

## Chosen stack

### Frontend
- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query
- TanStack Table
- Recharts
- three.js or react-three-fiber for 3D synthetic motion rendering
- dark/light mode
- professional desktop-first responsive design

### Realtime gateway
- Node.js
- NestJS
- TypeScript
- WebSocket support
- serial ingestion from ESP32
- optional UDP abstraction for future hardware
- low-latency stream processing
- model-serving adapter for realtime inference
- resilient buffering and reconnects

### Domain and analytics backend
- Java 21
- Spring Boot
- Spring Web
- Spring Security
- Spring Data JPA
- Bean Validation
- Actuator
- springdoc-openapi
- Flyway
- PostgreSQL

### ML / inference layer
Implement inside the realtime gateway or as a dedicated local service package:
- Python 3.11
- PyTorch
- ONNX export support or local inference adapter
- offline training pipeline
- realtime inference interface
- model registry metadata

Use whichever integration is cleaner:
- local Python service called by gateway
or
- exported ONNX model invoked from Node
Choose a clean architecture and document the decision.

## Monorepo structure
Create this structure:

gym-wifi-treadmill-biomechanics/
  README.md
  LICENSE
  .gitignore
  .editorconfig
  .env.example
  docker-compose.yml
  Makefile
  AGENTS.md

  docs/
    architecture.md
    product_scope.md
    sensing_limitations.md
    inferred_views.md
    hardware_setup.md
    station_placement.md
    calibration_protocol.md
    treadmill_protocols.md
    validation_workflow.md
    privacy_and_security.md
    troubleshooting.md
    deployment.md

  firmware/
    README.md
    rx_csi_collector/
      README.md
      sdkconfig.defaults
      CMakeLists.txt
      main/
        CMakeLists.txt
        app_main.c
        csi_handler.c
        csi_handler.h
        serial_output.c
        serial_output.h
        config.h
    tx_ap/
      README.md
      sdkconfig.defaults
      CMakeLists.txt
      main/
        CMakeLists.txt
        app_main.c
        wifi_ap.c
        wifi_ap.h
        traffic_gen.c
        traffic_gen.h
        config.h

  apps/
    web/
      package.json
      tsconfig.json
      next.config.ts
      src/
        app/
          layout.tsx
          page.tsx
          login/page.tsx
          dashboard/page.tsx
          athletes/page.tsx
          athletes/[id]/page.tsx
          stations/page.tsx
          stations/[id]/page.tsx
          sessions/page.tsx
          sessions/[id]/page.tsx
          sessions/[id]/live/page.tsx
          sessions/[id]/replay/page.tsx
          sessions/[id]/inferred-motion/page.tsx
          reports/page.tsx
          calibration/page.tsx
          protocols/page.tsx
          settings/page.tsx
        components/
        features/
          auth/
          dashboard/
          athletes/
          stations/
          sessions/
          reports/
          calibration/
          protocols/
          inferred-motion/
          shared/
        lib/
        hooks/
        types/
        styles/
      public/

    gateway/
      package.json
      tsconfig.json
      nest-cli.json
      src/
        main.ts
        app.module.ts
        config/
        common/
        serial/
          serial.module.ts
          serial.service.ts
          serial.parser.ts
          serial.types.ts
          serial.health.ts
        ingestion/
          ingestion.module.ts
          ingestion.service.ts
          packet-normalizer.ts
          ring-buffer.ts
          event-bus.ts
        metrics/
          realtime-metrics.service.ts
          cadence-estimator.ts
          asymmetry-proxy.ts
          contact-time-proxy.ts
          fatigue-drift.ts
          confidence.service.ts
          signal-quality.service.ts
        pose/
          pose.module.ts
          pose.service.ts
          pose.types.ts
          pose-inference.adapter.ts
          synthetic-view.renderer-metadata.ts
        treadmill/
          treadmill.module.ts
          treadmill.service.ts
          treadmill.types.ts
          manual-input.adapter.ts
          mock-protocol.adapter.ts
        websocket/
          websocket.gateway.ts
          websocket.dto.ts
        backend-client/
          backend-client.module.ts
          backend-client.service.ts
        health/
          health.controller.ts
        tests/

    backend/
      build.gradle.kts
      settings.gradle.kts
      src/
        main/
          java/com/acme/biomech/
            BiomechApplication.java
            config/
            security/
            athlete/
            station/
            treadmill/
            session/
            protocol/
            calibration/
            analytics/
            inferredmotion/
            validation/
            report/
            ingestion/
            common/
          resources/
            application.yml
            db/migration/
        test/
          java/com/acme/biomech/

  ml/
    pyproject.toml
    requirements.txt
    src/
      data/
      preprocessing/
      features/
      models/
        proxy_metrics/
        pose_inference/
      training/
      inference/
      export/
      evaluation/
    notebooks/
      01_explore_csi.ipynb
      02_build_proxy_dataset.ipynb
      03_train_proxy_models.ipynb
      04_pose_inference_experiments.ipynb

  packages/
    shared-types/
      package.json
      src/
        index.ts
        athlete.ts
        station.ts
        session.ts
        metrics.ts
        inferred-motion.ts
        websocket.ts

  scripts/
    setup.sh
    dev.sh
    start-web.sh
    start-gateway.sh
    start-backend.sh
    start-ml.sh
    flash-rx.sh
    flash-tx.sh
    monitor-rx.sh
    train-proxy.sh
    train-pose.sh
    run-demo.sh
    create-admin.sh

  storage/
    raw-csi/.gitkeep
    processed/.gitkeep
    models/.gitkeep
    reports/.gitkeep
    imports/.gitkeep

  tests/
    e2e/
    fixtures/

## Core product features

### 1. Live dashboard
Show:
- active stations
- current athlete
- cadence
- step interval
- contact-time proxy
- symmetry proxy
- fatigue drift
- signal quality
- calibration status
- model confidence
- alerts
- current protocol stage
- treadmill speed/incline

### 2. Live session screen
Provide:
- scrolling live charts
- realtime metric cards
- confidence indicators beside every metric
- treadmill speed/incline manual input
- stage progress
- event markers:
  - speed change
  - incline change
  - shoe change
  - fatigue onset
  - discomfort note
  - calibration issue
- optional inferred motion panel
- start / pause / stop session controls

### 3. Inferred motion screen
This is critical.

Build a dedicated screen for synthetic motion visualization:
- 2D skeletal timeline view
- 3D skeleton or simplified body model
- selectable render viewpoints:
  - front
  - rear
  - left lateral
  - right lateral
  - orbit
- playback scrubber
- model confidence overlay
- signal quality overlay
- clear badge:
  - "Synthetic inferred motion view"
  - "Not a camera view"
  - "Estimated from Wi-Fi sensing"

This screen must visually separate:
- direct metrics
- inferred motion
- validation overlays

### 4. Athlete profile
Include:
- athlete demographics
- sport profile
- shoe notes
- previous treadmill sessions
- longitudinal trends
- metric trend comparisons
- validation history
- inferred motion availability by session

### 5. Calibration screen
Create a wizard for:
1. environment baseline
2. treadmill ON / no athlete baseline
3. athlete warm-up baseline
4. station quality check
5. recalibration recommendations

### 6. Session replay
Support:
- timeline scrubber
- charts by metric
- stage overlays
- confidence overlays
- event markers
- optional inferred motion playback
- validation comparison overlays

### 7. Reports
Generate:
- session summary
- stage summary
- key observations
- data quality summary
- confidence summary
- trend vs prior sessions
- explicit note if inferred views were used
- explicit note that rendered motion views are synthetic model outputs

## Realtime gateway requirements

### Ingestion
Implement:
- serial device detection
- configurable baud rate
- line-based parsing
- malformed packet rejection
- timestamping
- packet normalization
- reconnect logic
- local buffering

### Realtime proxy analytics
Implement low-latency rolling estimation for:
- packet rate
- signal quality score
- cadence
- step interval
- step interval variability
- symmetry proxy
- contact-time proxy
- flight-time proxy
- fatigue drift score
- metric confidence

### Realtime pose / body-model inference abstraction
Create a clean interface for inferred motion:
- accepts rolling windows or feature tensors
- returns:
  - 2D keypoints or null
  - 3D joint coordinates or null
  - simplified body-model representation or null
  - per-frame confidence
  - model version
  - experimental flag
- gateway should stream inferred motion frames to frontend over websocket

Even if the first implementation uses mock or simplified inferred motion, structure it professionally and clearly mark synthetic/demo outputs.

## Backend requirements
The Java backend is the system of record.

### Domain entities
Include:
- Facility
- GymZone
- Station
- Treadmill
- Athlete
- CoachUser
- Session
- SessionStage
- ProtocolTemplate
- CalibrationProfile
- DeviceHealthSnapshot
- RawCaptureFile
- DerivedMetricSeries
- InferredMotionSeries
- ValidationRun
- ImportedReferenceDataset
- ReportArtifact

### Session model
A session must support:
- athlete
- station
- treadmill
- date/time
- protocol template
- stage definitions
- speed and incline per stage
- operator notes
- estimated metrics series
- inferred motion metadata
- confidence series
- validation status

### Inferred motion persistence
Persist:
- model version
- inference mode
- whether output is experimental
- frame timestamps
- confidence series
- keypoint schema version
- body-model schema version
- source signal quality summary

Do not store this as if it were camera footage.
Store it as inferred motion data.

## ML requirements

### Proxy metrics models
Implement baseline pipelines for:
- cadence estimation
- symmetry proxy estimation
- contact-time proxy estimation
- fatigue drift scoring
- confidence scoring

### Inferred motion models
Implement the repo scaffolding for:
- 2D pose estimation from Wi-Fi-derived tensors
- 3D pose inference from Wi-Fi-derived features
- optional simplified body mesh / stick figure renderer input

This can begin with:
- modular data pipeline
- training entry points
- inference adapter
- mock/demo checkpoints if real model weights are unavailable

The architecture must assume that pose models may be trained with cross-modality supervision from:
- synchronized camera labels
- depth labels
- IMU-assisted labels
- reference biomechanics systems

Document this clearly in code and docs.

### Confidence and validation
Every inferred motion frame or clip should expose:
- inference confidence
- signal quality score
- calibration quality score
- validation state:
  - unvalidated
  - experimental
  - station-validated
  - externally validated

## Validation workflow
Support imports for:
- treadmill console exports
- IMU CSV
- video-derived CSV
- pressure insole CSV
- force plate CSV

The validation UI and backend must compare:
- estimated cadence vs reference cadence
- estimated timing metrics vs reference timing metrics
- inferred motion outputs vs reference kinematic summaries when available

Generate validation reports and error summaries.
Do not silently merge experimental outputs into validated outputs.

## Frontend UX requirements for inferred views
This is important.

Whenever showing synthetic front/rear/lateral rendered motion:
- include a visible banner stating:
  - "This is a synthetic model-based rendering inferred from Wi-Fi sensing."
  - "It is not a true camera or optical motion capture view."
- show confidence and validation state inline
- allow toggling between:
  - metrics only
  - 2D inferred skeleton
  - 3D inferred skeleton
  - simplified body model
- support transparency overlays for uncertainty
- use subtle visual cues for low-confidence regions or frames
- provide a help tooltip explaining:
  - direct measurement vs proxy vs inferred model

## Security and privacy
Implement:
- local auth
- roles:
  - admin
  - coach
  - operator
- JWT auth
- password hashing
- audit logging
- privacy-first language
- no cloud dependency by default
- no camera dependency by default

## Docs requirements

### docs/inferred_views.md
Write a serious document explaining:
- what inferred motion views are
- why front/rear/lateral renders are synthetic
- difference between camera view and inferred body model
- confidence and uncertainty
- validation implications
- correct marketing language

### docs/sensing_limitations.md
Explicitly separate:
- direct signal measurements
- derived proxy metrics
- inferred pose/body model
- validated metrics
- unsupported claims

### docs/architecture.md
Include Mermaid diagrams for:
- system architecture
- CSI ingestion
- realtime inference
- session replay with inferred motion

## Demo mode
Implement a realistic demo mode:
- synthetic CSI-like stream
- synthetic inferred motion outputs
- clearly marked as synthetic
- supports end-to-end UI walkthroughs
- never disguises demo data as validated real data

## Makefile commands
Include at least:
- make setup
- make dev
- make lint
- make format
- make test
- make db-up
- make db-down
- make web
- make gateway
- make backend
- make ml
- make flash-rx
- make flash-tx
- make demo

## Testing
Add:
- frontend component tests
- one Playwright end-to-end flow
- gateway parser tests
- gateway websocket tests
- backend controller/service/repository tests
- Testcontainers for PostgreSQL
- tests for inferred motion DTO schemas
- tests ensuring banners/warnings are shown on synthetic motion screens

## Implementation order
Perform the work in this order:
1. create monorepo structure
2. write README and docs skeletons with meaningful content
3. implement backend domain model and Flyway migrations
4. implement gateway serial ingestion and websocket streaming
5. implement web app skeleton and live dashboard
6. implement proxy metric services
7. implement inferred motion abstraction and UI screens
8. implement validation workflow
9. implement firmware scaffolds
10. add tests, CI, and polish

## Final output requirements
After coding, provide:
1. concise summary of what was created
2. exact local commands to run first
3. assumptions made
4. known sensing limitations
5. inferred-view limitations
6. hardware validation risks
7. next recommended steps for treadmill validation

Be decisive, professional, and realistic.
Do not ask unnecessary questions.
Make the repository runnable.