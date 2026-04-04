---
name: treadmill-session-replay-reporting
description: Build or refine session replay, event timelines, stage overlays, printable reports, and longitudinal summaries for treadmill sessions. Use this when working on replay views, report generation, trend comparisons, or export surfaces.
---

# Treadmill Session Replay and Reporting

Use this skill when the task involves:
- session replay screens
- timeline scrubbing
- stage overlays
- event markers
- report generation
- longitudinal athlete comparisons
- printable summaries
- export-friendly metric views

## Objective

Make sessions reviewable, coach-friendly, and faithful to the data actually collected.

Replay and reporting should preserve:
- treadmill protocol stages
- speed and incline changes
- operator notes
- manual event markers
- confidence context
- signal quality context
- inferred-motion warnings when applicable

## Replay rules

Replay should:
- stay aligned to session time
- show protocol stage transitions clearly
- show event markers such as shoe change or fatigue onset
- support chart overlays
- preserve data gaps and degraded periods rather than hiding them

## Report rules

Reports should:
- summarize the session and each stage
- compare to prior sessions when available
- note calibration and signal quality context
- show confidence for important outputs
- explicitly mark inferred-motion outputs as synthetic and model-based
- avoid overclaiming certainty

## Product language

Prefer:
- session summary
- stage summary
- estimated metric
- proxy metric
- inferred motion rendering
- validation status
- confidence summary

Avoid:
- definitive diagnosis
- exact mechanics unless validated
- true camera replay

## Always update

When using this skill, review:
- apps/web replay and reports pages
- backend report metadata and APIs
- docs/validation_workflow.md
- docs/inferred_views.md
- tests for replay timelines and report disclaimers
