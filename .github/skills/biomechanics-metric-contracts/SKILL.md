---
name: biomechanics-metric-contracts
description: Enforce scientifically honest naming, DTO contracts, confidence fields, validation status, and proxy-metric semantics across frontend, backend, gateway, ML, and reports. Use this when adding or refactoring metrics, APIs, labels, or reports.
---

# Biomechanics Metric Contracts

Use this skill when the task involves:
- naming biomechanics-related outputs
- adding DTOs or schemas
- changing reports
- changing backend entities for metrics
- updating chart labels
- deciding whether an output is direct, proxy, or inferred

## Objective

Keep the codebase scientifically honest and internally consistent.

Every metric must belong clearly to one category:
1. Direct signal measurement
2. Derived proxy metric
3. Inferred motion output

Do not blur these categories.

## Required terminology

Prefer:
- estimatedCadence
- stepIntervalEstimate
- symmetryProxy
- contactTimeProxy
- flightTimeProxy
- fatigueDriftScore
- signalQualityScore
- metricConfidence
- validationState

Avoid:
- exactCadence
- trueRearView
- exactForce
- actualKneeAngle
- cameraEquivalentMotion

## Mandatory metadata

Every derived metric should carry, when appropriate:
- timestamp
- sessionId
- stationId
- signalQualityScore
- metricConfidence
- validationState
- modelVersion if model-derived
- calibrationProfile or calibration context if relevant

## Validation state rules

Use explicit states consistently:
- unvalidated
- experimental
- station-validated
- externally validated

Do not auto-upgrade states without evidence and workflow support.

## UI/report rules

In user-facing surfaces:
- call proxy metrics “estimated” or “proxy” when appropriate
- show confidence and validation where meaningful
- include signal quality context when a metric could be degraded
- keep labels human-readable without becoming misleading

## Refactor process

When refactoring metrics:
1. Find every layer that uses the metric name.
2. Update shared types or API contracts first.
3. Update storage entities and migrations if needed.
4. Update frontend labels and chart legends.
5. Update tests and snapshots.
6. Update docs if meaning changed.

## Always update

When using this skill, review:
- apps/backend DTOs and entities
- apps/gateway event schemas
- apps/web labels and charts
- packages/shared-types
- docs/sensing_limitations.md
- docs/validation_workflow.md
- docs/inferred_views.md
