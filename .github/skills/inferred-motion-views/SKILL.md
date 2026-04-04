---
name: inferred-motion-views
description: Build or refine the inferred motion layer, including synthetic front/rear/lateral renderings, model-confidence UX, inferred-motion DTOs, and safety language. Use this when working on 2D/3D motion rendering, replay, or advanced Wi-Fi pose features.
---

# Inferred Motion Views

Use this skill when the task involves:
- 2D keypoint rendering
- 3D skeleton rendering
- synthetic front / rear / lateral view UI
- inferred motion DTOs
- replay with inferred motion
- uncertainty overlays
- model-confidence presentation
- experimental pose features from Wi-Fi sensing

## Objective

Support advanced motion visualization without implying the system is a camera.

These views are:
- synthetic
- model-based
- inferred from Wi-Fi-derived signals
- uncertainty-sensitive
- experimental unless validated

They are not:
- optical footage
- true camera views
- motion-capture truth

## Mandatory user-facing language

Whenever synthetic motion is shown, include language equivalent to:
- "This is a synthetic model-based rendering inferred from Wi-Fi sensing."
- "It is not a true camera or optical motion capture view."

Also surface:
- confidence
- validation state
- signal quality
- model version where useful

## View design rules

Allow view selection for:
- front
- rear
- left lateral
- right lateral
- orbit / free view when available

Make uncertainty visible with:
- opacity shifts
- confidence badges
- warning banners
- subdued styling for low-confidence frames

## Data model rules

Store and stream inferred motion as structured inferred data:
- frame timestamp
- keypoint/joint schema version
- confidence
- model version
- experimental flag
- validationState
- source signal quality summary

Do not store it as camera media or label it as video.

## Implementation guidance

When building inferred motion features:
1. Keep the inference adapter separate from UI rendering.
2. Keep the renderer separate from the model output schema.
3. Provide typed DTOs for 2D and 3D outputs.
4. Preserve model version and schema version.
5. Add obvious empty, loading, and low-confidence states.
6. Ensure replay timelines stay aligned with session timestamps.
7. Keep the feature disable-able if the installation is not validated for it.

## Scientific rules

Do not claim:
- exact joint kinematics
- exact foot strike geometry
- exact rear-view camera biomechanics
- optical equivalence

If the model is trained using cross-modality supervision, document that clearly.

## Always update

When using this skill, review:
- docs/inferred_views.md
- docs/sensing_limitations.md
- apps/web inferred-motion screens
- apps/gateway inferred-motion adapters
- backend inferred-motion persistence and APIs
- tests for warning banners and DTO schemas
