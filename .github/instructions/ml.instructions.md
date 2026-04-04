# ML-specific Copilot instructions

These instructions apply primarily to the machine learning code under `ml`.

## Purpose

The ML layer supports:
- preprocessing of Wi-Fi CSI data,
- dataset building,
- feature extraction,
- training of proxy-metric models,
- optional inferred motion models,
- evaluation,
- model export,
- inference contracts for local integration.

This repository is for treadmill running biomechanics estimation using Wi-Fi sensing.

## Scientific scope

The ML system must be honest about what it is learning.

### Primary v1 objectives
Prioritize models for:
- cadence estimation
- step interval estimation
- symmetry proxy estimation
- contact-time proxy estimation
- flight-time proxy estimation
- fatigue drift scoring
- signal quality scoring
- confidence scoring

### Optional advanced objectives
Support scaffolding for:
- 2D pose inference from Wi-Fi-derived features
- 3D skeleton inference
- simplified body-model inference
- synthetic motion rendering inputs

These advanced outputs are:
- inferred
- model-dependent
- uncertainty-sensitive
- experimental unless explicitly validated

## Scientific guardrails

Do not frame model outputs as direct measurements unless they truly are.

Keep these categories separate:
1. direct signal measurements
2. derived proxy metrics
3. inferred motion outputs

Never describe inferred pose/body-model outputs as true camera footage.
Synthetic front/rear/lateral renderings must be treated as model-based projections of inferred structure.

## Data rules

### Dataset design
Prefer datasets organized by:
- facility
- station
- treadmill
- athlete
- session
- protocol stage
- speed
- incline
- calibration profile
- label source
- validation state
- model target type

### Prevent leakage
Be careful about:
- splitting by packets instead of sessions
- leaking stage metadata into labels improperly
- letting athlete identity dominate generalization
- mixing calibration and evaluation data inappropriately
- accidentally training on data aligned too directly with annotations

Prefer train/validation/test splits by:
- session
- athlete
- station
- day
depending on the experiment goal

### Metadata matters
Preserve:
- hardware config
- station geometry
- treadmill state
- session notes
- calibration status
- reference source
- preprocessing version
- model version

## Preprocessing rules

Implement preprocessing as explicit, testable steps.

Possible steps include:
- malformed sample rejection
- packet alignment
- subcarrier selection
- amplitude extraction
- phase-derived features if justified
- filtering and denoising
- windowing and segmentation
- normalization
- feature extraction

Rules:
- no hidden transformations
- document assumptions
- preserve reproducibility
- keep schemas explicit
- log preprocessing versions

## Model design rules

### Proxy models
Start with simple, strong baselines:
- feature-based models
- small CNNs
- temporal models only when justified

Do not jump to heavy architectures prematurely.

### Inferred motion models
Scaffold for:
- 2D keypoint inference
- 3D joint inference
- simplified body-model inference

Document that such models may require cross-modality supervision from:
- synchronized camera labels
- depth labels
- IMU-assisted labels
- reference biomechanics systems

Do not imply that Wi-Fi alone automatically yields validated pose quality.

## Confidence and uncertainty rules

Every model output should expose, when feasible:
- prediction confidence
- uncertainty estimate or proxy
- signal quality context
- calibration context
- validation state
- model version

Confidence must not be treated as proof of correctness.
Low signal quality should reduce trust in outputs.

## Evaluation rules

Evaluate with scientifically meaningful protocols.

For proxy metrics:
- MAE / RMSE when applicable
- correlation where useful
- agreement summaries where appropriate
- per-session performance
- per-athlete performance
- per-station performance
- robustness across speeds and inclines

For classification-style tasks:
- F1
- precision
- recall
- confusion matrix
- calibration of probabilities when relevant

For inferred motion tasks:
- use appropriate kinematic/pose metrics
- separate experimental vs validated evaluation
- report dataset and supervision assumptions clearly

Do not report a single flattering metric without context.

## Export and inference rules

Export models in a form suitable for local deployment:
- PyTorch checkpoints
- ONNX when useful
- explicit inference schema definitions

Inference interfaces should clearly state:
- expected input tensor shape
- expected preprocessing version
- output schema
- confidence fields
- model version
- whether output is experimental

## Code quality rules

Use:
- Python 3.11
- type hints
- dataclasses or pydantic-style schemas when useful
- modular pipelines
- reproducible configs
- deterministic seeds where practical
- testable dataset and model interfaces

Avoid:
- notebook-only logic
- giant training scripts
- silent preprocessing drift
- hidden constants
- unreproducible experiments
- ambiguous target naming

## Naming rules

Prefer:
- estimatedCadence
- stepIntervalEstimate
- symmetryProxyTarget
- contactTimeProxyTarget
- signalQualityScore
- metricConfidence
- inferredPose
- inferredSkeleton3D
- inferredBodyModel
- syntheticViewCondition

Avoid:
- truePose
- exactKneeAngle
- actualRearView
- cameraEquivalentOutput

## Experiment tracking rules

Even in local-only workflows, keep experiments organized:
- model config
- seed
- preprocessing version
- dataset version
- train/val/test split definition
- metrics summary
- artifact paths

Do not leave model provenance unclear.

## Testing guidance

Add or update tests for:
- preprocessing functions
- dataset schemas
- windowing logic
- feature extraction
- model input/output shapes
- inference adapters
- export correctness
- confidence field presence
- evaluation pipeline contracts

## Documentation expectations

If ML behavior changes, update:
- `docs/sensing_limitations.md`
- `docs/inferred_views.md`
- `docs/validation_workflow.md`
- `docs/calibration_protocol.md`
- model cards or evaluation docs when available

Documentation must state:
- what was predicted
- what was inferred
- what labels were used
- what supervision assumptions exist
- what remains experimental
- what has actually been validated

## Final rule

The ML layer must prefer reproducibility, honest uncertainty, and clean experimental design over flashy claims.
A smaller trustworthy model is better than an impressive but misleading one.
