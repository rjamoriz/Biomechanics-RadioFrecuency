# Gateway-specific Copilot instructions

These instructions apply primarily to the realtime gateway under `apps/gateway`.

## Purpose

The gateway is the realtime edge service between ESP32 CSI hardware and the rest of the platform.

It is responsible for:
- serial ingestion from ESP32 CSI collectors,
- packet parsing,
- normalization,
- buffering,
- reconnect logic,
- rolling feature extraction,
- realtime proxy metric estimation,
- signal quality and confidence estimation,
- optional inferred motion inference adapters,
- websocket streaming to the frontend,
- forwarding normalized events to the backend.

## Required stack

Prefer:
- Node.js
- NestJS
- TypeScript
- WebSocket support
- modular services
- schema validation at input boundaries

## Architectural role

The gateway is the low-latency realtime layer.

It should own:
- hardware-facing host logic
- serial device communication
- packet normalization
- short-horizon rolling analysis
- live event publishing
- inference integration boundaries

It should not become:
- the long-term system of record
- the main domain backend
- a giant monolith mixing ingestion, analytics, persistence, and UI formatting everywhere

## Input assumptions

The gateway ingests CSI data from ESP32-based hardware, typically over serial.

Expect:
- malformed lines
- partial lines
- dropped packets
- serial disconnects
- inconsistent timing
- noisy environments
- station drift
- interference from nearby people or equipment

Code defensively.

## Scientific honesty rules

Do not overclaim what gateway-derived realtime metrics represent.

Allowed terms:
- estimatedCadence
- stepIntervalEstimate
- symmetryProxy
- contactTimeProxy
- flightTimeProxy
- fatigueDriftScore
- signalQualityScore
- metricConfidence
- inferredPose
- inferredMotionFrame

Do not use:
- exactCadence
- exactGroundForce
- cameraViewFromWifi
- trueRearView
- exactJointAngle without explicit validation context

## Realtime processing rules

The gateway should prioritize:
1. correctness
2. robustness to bad input
3. observability
4. low-latency streaming
5. maintainable architecture

Implement:
- line-based parsing
- packet validation
- monotonic timestamp handling where useful
- bounded buffers
- reconnect and retry logic
- backpressure-aware streaming
- health reporting
- structured logs

Avoid:
- unbounded in-memory queues
- tight hidden loops
- implicit packet assumptions
- giant services doing everything
- silently dropped errors without telemetry

## Packet parsing rules

Build parsers that are:
- strict enough to reject bad data
- tolerant enough to handle realistic serial noise
- testable with fixtures
- versionable if packet formats evolve

When packet format changes:
- update parser tests
- update docs
- keep backward compatibility where practical
- document schema version assumptions

## Rolling analytics rules

The gateway may compute low-latency proxy metrics such as:
- packet rate
- amplitude envelope behavior
- periodicity detection
- estimated cadence
- step interval estimate
- symmetry proxy
- contact-time proxy
- flight-time proxy
- fatigue drift trend
- signal quality score
- metric confidence

Important:
- keep formulas or estimators modular
- separate preprocessing from estimation
- preserve units and assumptions
- avoid magical constants without explanation
- surface quality and confidence alongside metrics

## Inferred motion rules

The gateway may integrate optional inferred motion models.

If it does:
- keep a clean inference adapter boundary
- accept rolling windows or feature tensors
- return typed outputs
- preserve model version
- preserve confidence
- preserve experimental flag
- preserve validation state when available

Remember:
- front/rear/lateral renders are synthetic projections of an inferred model
- they are not true camera views

The gateway must stream inferred motion with labels that make this explicit.

## WebSocket rules

WebSocket payloads should be:
- typed
- versionable
- small enough for smooth streaming
- explicit about timestamps
- explicit about confidence and quality

Stream categories can include:
- raw packet stats
- station health
- realtime metric snapshots
- calibration progress
- session events
- inferred motion frames

Do not mix unrelated payloads into vague blob messages.

## Backend forwarding rules

When sending data to the backend:
- send normalized, structured events
- preserve traceability
- preserve timestamps
- preserve model version metadata
- do not hide whether outputs are estimated or inferred
- do not silently discard confidence or validation context

If backend is unavailable:
- buffer responsibly
- expose degraded mode
- avoid pretending persistence succeeded

## Health and observability rules

Provide:
- serial connection health
- packet throughput metrics
- parser error counts
- inference service health
- backend connectivity health
- station signal quality health
- structured logs with useful context

Prefer:
- concise structured logging
- clear health endpoints
- counters for repeated parse failures
- warnings for degraded mode

## Naming rules

Prefer:
- serialPacket
- normalizedCsiFrame
- rollingWindow
- estimatedCadence
- symmetryProxy
- contactTimeProxy
- signalQualityScore
- metricConfidence
- inferredMotionFrame
- inferenceAdapter

Avoid:
- magicPacket
- trueView
- realPoseCamera
- exactBiomechanics

## Testing guidance

Add or update tests for:
- parser behavior
- malformed serial lines
- reconnect logic
- bounded buffering
- rolling feature extraction
- metric estimator outputs
- websocket event schemas
- backend forwarding contracts
- inferred motion adapter contracts

Use fixtures generously for packet parsing and normalization.

## Documentation expectations

If gateway behavior changes, update:
- `docs/architecture.md`
- `docs/hardware_setup.md`
- `docs/calibration_protocol.md`
- `docs/sensing_limitations.md`
- `docs/inferred_views.md`

## Final rule

The gateway must be resilient, observable, and scientifically conservative.
It is the platform’s realtime nervous system, so correctness and clarity matter more than cleverness.
