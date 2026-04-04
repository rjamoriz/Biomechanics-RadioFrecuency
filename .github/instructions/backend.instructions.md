# Backend-specific Copilot instructions

These instructions apply primarily to the Java backend under `apps/backend`.

## Purpose

The backend is the source of truth for the treadmill biomechanics platform.

It owns:
- auth and authorization,
- athlete and coach domain data,
- station and treadmill inventory,
- sessions and protocol templates,
- calibration records,
- derived metric storage,
- inferred motion metadata storage,
- validation workflows,
- reports,
- auditability,
- historical analytics orchestration.

## Required stack

Prefer:
- Java 21
- Spring Boot
- Spring Web
- Spring Security
- Spring Data JPA
- Bean Validation
- Flyway
- PostgreSQL
- springdoc-openapi
- Actuator

Use Lombok sparingly and only when it improves clarity.

## Architectural role

The backend is the durable system of record.
It is not the place for serial CSI ingestion or low-level packet parsing.
It is not the place for heavy UI formatting concerns.
It should receive normalized events and structured data from the gateway and persist them cleanly.

## Domain modeling rules

Model the domain explicitly and professionally.

Typical entities include:
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

Prefer clear aggregates and service boundaries over anemic, blob-like entities.

## Scientific honesty rules in backend APIs

Do not expose ambiguous or misleading field names.

Allowed domain language:
- estimated metric
- proxy metric
- inferred pose
- inferred body model
- synthetic motion view
- confidence
- validation status
- calibration status
- signal quality

Forbidden or misleading language:
- true video view
- real rear camera
- exact joint mechanics without validation
- medical diagnosis
- exact force values without validation

### Required separation of output classes
Keep these concepts separate at entity, DTO, and API levels:
1. direct signal measurements
2. derived proxy metrics
3. inferred motion outputs

Do not blur them into a single generic payload.

## Validation rules

Validation state must be explicit and consistent:

- UNVALIDATED
- EXPERIMENTAL
- STATION_VALIDATED
- EXTERNALLY_VALIDATED

Do not infer stronger validation states automatically.
Do not silently merge experimental and validated outputs.

## API design rules

Prefer:
- explicit request and response DTOs
- versionable contracts
- pagination for list endpoints
- clear filtering semantics
- consistent error payloads
- OpenAPI annotations where appropriate

Avoid:
- exposing JPA entities directly
- huge controller classes
- business rules inside controllers
- ambiguous field naming
- action-heavy endpoints when resource modeling works better

## Persistence rules

Use PostgreSQL with Flyway migrations.

### Store raw vs derived vs inferred data distinctly
Persist:
- session metadata
- raw capture file metadata
- derived metric series
- inferred motion metadata and frame series
- validation runs
- imported reference dataset metadata
- report artifact metadata
- station health snapshots

Do not store inferred motion as if it were raw camera footage.
Store it as inferred structured data with:
- frame timestamps
- schema version
- confidence
- model version
- experimental flag
- signal quality context

## Session and protocol rules

A Session should support:
- athlete
- station
- treadmill
- protocol template
- stage definitions
- speed and incline context
- notes and events
- operator identity
- confidence series
- validation status
- calibration linkage where applicable

Protocol and stage modeling should make treadmill context explicit.

## Security rules

Implement:
- role-based access control
- secure password hashing
- JWT or session-based auth, consistently
- audit logging for critical actions
- minimal exposure of personal data
- safe defaults for local deployment

Roles should include at least:
- admin
- coach
- operator

## Service-layer rules

Keep business logic in services or domain-level orchestrators.
Controllers should:
- validate input
- call services
- map responses

Services should:
- enforce business rules
- coordinate repositories
- publish or process domain events where useful
- remain testable

Repositories should:
- stay focused on data access
- avoid hidden business rules

## Analytics and reporting rules

Backend analytics should:
- compute or persist stage summaries
- compare sessions longitudinally
- keep model version metadata
- preserve uncertainty and validation context
- distinguish direct data from estimated data
- distinguish estimated data from inferred motion data

Reports must:
- include confidence and data quality context
- include disclaimers for inferred motion where applicable
- avoid overclaiming metric certainty

## Validation workflow rules

Support workflows that compare Wi-Fi-derived outputs with imported references such as:
- treadmill console exports
- IMU CSV
- video-derived CSV
- pressure insole CSV
- force plate CSV

Validation code should:
- preserve timestamps and alignment assumptions
- document transformations
- expose errors and limitations
- generate reproducible summaries

## Naming rules

Prefer names like:
- estimatedCadence
- stepIntervalEstimate
- symmetryProxy
- contactTimeProxy
- fatigueDriftScore
- signalQualityScore
- metricConfidence
- inferredMotionSeries
- validationState

Avoid:
- exactCadence
- realRearView
- trueKneeAngle
- actualForcePlateEquivalent

## Testing guidance

Add or update:
- controller tests
- service tests
- repository tests
- mapper tests where useful
- Flyway migration tests
- Testcontainers PostgreSQL integration tests
- validation workflow tests
- authorization tests

Prioritize testing:
- domain invariants
- validation-state handling
- inferred-motion persistence contracts
- session/protocol relationships
- audit and permission-sensitive behavior

## Documentation expectations

If backend behavior changes, update relevant docs:
- `docs/architecture.md`
- `docs/validation_workflow.md`
- `docs/sensing_limitations.md`
- `docs/inferred_views.md`
- `docs/deployment.md`

## Final rule

The backend must be conservative, explicit, and auditable.
When in doubt, choose clearer domain modeling and more honest semantics over convenience.
