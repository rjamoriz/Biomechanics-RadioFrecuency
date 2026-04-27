---
name: validation-import-alignment
description: Implement or improve reference-data imports, timestamp alignment, validation workflows, error summaries, and experiment tracking for treadmill, IMU, video-derived, pressure, or force-plate comparisons. Use this when working on validation pipelines or import tools.
---

# Validation Import Alignment

Use this skill when the task involves:
- importing reference CSV files
- timestamp alignment
- validation runs
- session comparison workflows
- error summary reports
- experimental vs validated labeling
- mapping external data to internal sessions

## Objective

Make validation workflows reproducible, explicit, and scientifically honest.

Reference systems may include:
- treadmill console exports
- IMU CSV
- video-derived CSV
- pressure insole CSV
- force plate CSV

These data sources differ in:
- timestamps
- sampling frequency
- coordinate systems
- units
- derived metrics
- noise characteristics

Validation logic must preserve those differences instead of hiding them.

## Workflow

When implementing validation:
1. Import and store raw metadata for the external dataset.
2. Link the import to the session and station context.
3. Parse timestamps and units explicitly.
4. Document any assumptions used for alignment.
5. Compute comparable summaries only for metrics that are meaningfully comparable.
6. Generate validation reports with errors, caveats, and confidence context.
7. Preserve whether the output remains experimental or becomes station_validated / externally validated.

## Comparison rules

Good comparisons include:
- cadence estimate vs cadence reference
- step interval estimate vs reference timing metric
- session trend vs session trend
- stage summary vs stage summary

Avoid forcing false precision on comparisons that are not directly comparable.

## Required outputs

A validation run should capture:
- sessionId
- reference source type
- import timestamp
- alignment method
- preprocessing notes
- compared metric definitions
- error summaries
- validation outcome
- model version
- caveats

## Scientific rules

Do not treat:
- a rough agreement plot
- a single session correlation
- an imported CSV without time alignment

as proof of broad validity.

The workflow must make limitations visible.

## Always update

When using this skill, review:
- backend validation entities and services
- docs/validation_workflow.md
- docs/sensing_limitations.md
- report-generation logic
- tests for alignment and import parsing
