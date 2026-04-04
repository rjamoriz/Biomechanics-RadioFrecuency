---
name: csi-realtime-pipeline
description: Implement or refactor the ESP32 CSI ingestion path, serial parser, normalization layer, bounded buffers, websocket events, and realtime proxy-metric pipeline. Use this when working on apps/gateway, firmware packet contracts, or end-to-end CSI flow reliability.
---

# CSI Realtime Pipeline

Use this skill when the task involves:
- ESP32 CSI serial output design
- gateway serial parsing
- normalized CSI event contracts
- bounded buffering and reconnects
- websocket streaming
- low-latency proxy metric estimation
- packet-throughput or parser reliability
- firmware-to-host compatibility

## Objective

Keep the realtime path robust, observable, and conservative.

The realtime pipeline should:
1. ingest CSI-related lines from the ESP32 receiver,
2. validate and normalize them,
3. preserve timestamps and metadata,
4. compute rolling realtime metrics,
5. attach signal quality and confidence,
6. stream compact typed payloads to the web app,
7. forward structured events to the Java backend.

## Source of truth by layer

- Firmware owns the raw machine-readable serial format.
- Gateway owns parsing, normalization, buffering, reconnect logic, and rolling metrics.
- Backend owns durable persistence and domain history.
- Frontend owns rendering and operator workflows.

Do not move low-level serial parsing into the web app.
Do not treat the gateway as the permanent database.

## Required semantics

Keep these separate:
- direct signal measurements
- derived proxy metrics
- inferred motion outputs

Do not mix them into a single ambiguous payload.

## Packet handling process

When changing the pipeline, follow this order:

1. Inspect the current firmware output contract.
2. Validate whether the host parser already depends on field ordering or delimiters.
3. Keep the serial format deterministic and line-based.
4. Reject malformed lines with structured error handling.
5. Normalize parsed fields into a typed CSI frame DTO.
6. Push validated data into bounded buffers only.
7. Compute rolling metrics from normalized windows, not raw unparsed text.
8. Stream typed websocket events with explicit timestamps.
9. Preserve signal quality and confidence in every downstream metric payload.
10. Update fixtures and tests for every contract change.

## Parser rules

Parsers should be:
- strict enough to reject corrupt input
- tolerant enough to survive serial noise
- fixture-driven
- explicit about missing fields
- easy to version if the format evolves

Avoid:
- regex-only giant parsers that are hard to debug
- hidden assumptions about field presence
- ad hoc text splitting without validation
- silently defaulting bad numeric fields to zero

## Realtime metric rules

Allowed metric names:
- estimatedCadence
- stepIntervalEstimate
- symmetryProxy
- contactTimeProxy
- flightTimeProxy
- fatigueDriftScore
- signalQualityScore
- metricConfidence

Do not expose:
- exactGroundReactionForce
- trueRearView
- exactKneeAngle
- cameraFromWifi

## Websocket event design

Prefer separate event families such as:
- station.health
- csi.packet-stats
- csi.metric-snapshot
- csi.calibration-progress
- csi.inferred-motion-frame
- session.event

Each payload should include:
- timestamp
- stationId when available
- sessionId when available
- schema or version field when relevant
- confidence and quality context if a derived output is present

## Changes that require extra care

Be especially cautious when modifying:
- serial delimiters
- field ordering
- timestamp semantics
- subcarrier payload shape
- buffer sizes
- reconnect timing
- websocket DTO schemas

These are interface changes, not local refactors.

## Always update

When using this skill, update as needed:
- gateway parser tests
- websocket schema tests
- firmware format docs
- docs/architecture.md
- docs/hardware_setup.md
- docs/calibration_protocol.md

## Deliverable standard

A good result from this skill:
- keeps serial contracts stable
- improves resilience
- adds typed DTOs
- adds or updates fixtures
- preserves scientific honesty
- makes degraded mode visible
- does not overcomplicate the path
