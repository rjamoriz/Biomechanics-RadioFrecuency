# Inferred Motion Views

## What Are Inferred Motion Views?

Inferred motion views are **synthetic visual representations** of a body model that has been estimated from Wi-Fi Channel State Information (CSI) data using machine learning. They are NOT camera footage.

When the platform displays a front, rear, or lateral view of a running figure, that figure is:
- A **model-based rendering** of estimated joint positions
- Generated from **radio-frequency signal features**, not optical images
- Subject to **model uncertainty** that varies with signal quality and calibration

## Why They Are Synthetic

Traditional motion capture uses cameras or depth sensors that directly observe body geometry. Wi-Fi CSI measures how radio signals are affected by body movement — a fundamentally different sensing modality.

The process:
1. ESP32 hardware captures CSI (complex channel response values)
2. Signal processing extracts amplitude/phase features over time
3. An ML model maps these features to estimated body keypoints
4. A renderer draws the estimated skeleton from a chosen viewpoint

At no point does the system "see" the athlete optically. The rendered views are geometric projections of an **inferred pose estimate**.

## Camera View vs. Inferred Body Model

| Aspect | Camera/Optical | Wi-Fi Inferred |
|--------|---------------|----------------|
| Sensing | Photons → pixels | RF propagation → CSI |
| Resolution | High spatial detail | Coarse body-level features |
| Occlusion | Affected by line-of-sight | Less affected (RF penetrates) |
| Privacy | Captures identifiable imagery | No visual imagery |
| Accuracy | Sub-centimeter (mocap) | Experimental, unvalidated |
| Output | Real image/video | Synthetic model rendering |

## Confidence and Uncertainty

Every inferred motion frame includes:
- **Overall confidence** — how trustworthy the pose estimate is
- **Per-joint confidence** — which joints are better estimated
- **Signal quality** — underlying CSI data quality
- **Calibration status** — whether station environment is well-characterized

Low-confidence frames should be visually distinguished (transparency, desaturation, warnings).

## Validation Implications

Inferred motion outputs start as `experimental`. To improve status:
- Compare against synchronized camera-based motion capture
- Compute per-joint error metrics
- Document test conditions and athlete population
- Achieve reproducible accuracy thresholds

Until validated, inferred views must display:
> "This is a synthetic model-based rendering inferred from Wi-Fi sensing. It is not a true camera or optical motion capture view."

## Correct Terminology

### Use These
- Inferred pose
- Inferred body model
- Synthetic motion view
- Rendered front/rear/lateral view
- Estimated keypoints
- Model-based rendering

### Never Use These
- Real camera view
- True front view
- Actual rear view
- Optical motion capture (unless comparing to a reference)
- Exact joint angles (without validation)

## Marketing Language Guidance

When promoting or describing the inferred motion feature:

✅ "See a synthetic visualization of estimated running form inferred from Wi-Fi sensing"
✅ "AI-generated body model rendering based on radio-frequency measurements"
✅ "Experimental motion estimation — not a camera view"

❌ "Watch your athlete's running form in real time" (implies camera)
❌ "Full-body motion capture from Wi-Fi" (overclaims accuracy)
❌ "Clinical-grade gait analysis" (unvalidated)
