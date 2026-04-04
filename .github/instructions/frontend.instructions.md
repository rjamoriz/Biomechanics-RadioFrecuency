# Frontend-specific Copilot instructions

These instructions apply primarily to the web application under `apps/web`.

## Purpose

The frontend is the operator, coach, and sports-science UI for a treadmill running
biomechanics platform powered by ESP32 Wi-Fi CSI sensing.

The frontend must present:
- realtime proxy metrics,
- station and athlete management,
- calibration workflows,
- treadmill protocol context,
- session replay,
- reporting,
- optional synthetic inferred motion views.

## Core frontend responsibilities

Use `apps/web` for:
- dashboard screens,
- athlete and station CRUD screens,
- session setup and live monitoring,
- calibration wizard flows,
- session replay,
- reports,
- inferred synthetic motion rendering and playback.

Do not move domain business rules into the frontend when they belong in backend services.
Do not move realtime signal-processing logic into React components when it belongs in the gateway.

## Required stack

Prefer:
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
- react-three-fiber or three.js for synthetic motion views

## UX principles

The UI must look like a serious sports-tech / performance-lab product.

Always design for:
- desktop-first workflows
- tablet usability
- clear information hierarchy
- strong readability
- minimal clutter
- reliable loading states
- resilient empty states
- explicit error states
- keyboard accessibility
- operator-friendly controls during live sessions

Avoid:
- toy-like visuals
- unexplained charts
- hidden uncertainty
- misleading labels
- overloaded pages with too many competing widgets

## Scientific honesty in the UI

Never present Wi-Fi-derived outputs as if they were direct camera footage.

Allowed labels:
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

Forbidden labels:
- true front view
- true rear view
- camera view from Wi-Fi
- exact biomechanics
- exact force metrics
- exact joint angles without validation

## Mandatory warning behavior

Whenever the UI shows synthetic front/rear/lateral motion views, show text equivalent to:

- "This is a synthetic model-based rendering inferred from Wi-Fi sensing."
- "It is not a true camera or optical motion capture view."

Also show:
- confidence
- validation state
- signal quality context
- calibration status where relevant

## Page-level expectations

### Dashboard
Should show:
- active stations
- active sessions
- current athlete
- estimated cadence
- contactTimeProxy
- symmetryProxy
- fatigueDriftScore
- signalQualityScore
- station health
- current protocol stage

### Live session page
Should support:
- realtime charts
- session status controls
- manual event markers
- speed/incline context
- notes
- metric confidence
- alerts
- optional inferred motion side panel

### Inferred motion page
Must:
- clearly distinguish inferred motion from direct metrics
- allow front/rear/lateral/orbit render selection
- show uncertainty/confidence
- show validation state
- include visible warning banners
- support playback scrubber and timeline synchronization

### Replay and reports
Must:
- preserve stage overlays
- preserve event markers
- preserve data quality and confidence context
- never represent inferred views as camera recordings

## Frontend architecture rules

Prefer:
- feature-based folders
- reusable presentational components
- server/client boundaries that make sense
- typed DTO transformations at the edge
- query hooks for data fetching
- shared formatting utilities
- explicit state machines or reducers for complex live workflows when needed

Avoid:
- giant pages with embedded business logic
- ad hoc fetch calls spread everywhere
- implicit any types
- UI-only naming that conflicts with backend domain language

## State and data rules

- Use server state management through TanStack Query where possible.
- Keep transient UI state local unless it truly needs to be shared.
- Normalize websocket payloads before binding them to components.
- Do not put inference or metric formulas directly in UI components.
- Use typed view models when backend DTOs are not ergonomic enough for direct rendering.

## Charting and visualization rules

When rendering charts:
- label axes clearly
- show units when known
- mark estimated/proxy metrics clearly
- overlay confidence or quality bands when useful
- annotate protocol stage transitions
- annotate manual events such as shoe change or fatigue onset
- avoid over-smoothing if it obscures uncertainty

When rendering synthetic motion:
- use restrained styling
- make uncertainty visible
- highlight low-confidence frames subtly
- make the synthetic nature of the rendering obvious in labels and help text

## Forms and validation

Use:
- React Hook Form
- Zod schemas
- clear error messages
- field-level help text where domain ambiguity exists

Forms should exist for:
- athlete creation/editing
- station setup
- protocol creation
- session creation
- calibration steps
- manual event logging

## Naming rules

Prefer names like:
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
- syntheticViewType

Avoid:
- exactCadence
- trueRearView
- actualKneeAngle
- realCameraFromWifi

## Testing guidance

Add or update tests for:
- critical UI components
- warning banners on inferred motion screens
- page smoke tests
- form validation
- chart legend and metric labeling behavior
- websocket-driven live session states
- Playwright flows for key operator journeys

Prioritize tests that verify:
- synthetic motion warnings are always visible
- confidence and validation states are shown
- stage changes and manual events appear correctly
- data-loading and error states are robust

## Documentation expectations

If the frontend changes product meaning or user workflows, update relevant docs:
- `docs/architecture.md`
- `docs/inferred_views.md`
- `docs/sensing_limitations.md`
- `docs/calibration_protocol.md`
- `docs/validation_workflow.md`

## Final rule

Prefer a calm, premium, trustworthy UI that communicates uncertainty honestly.
The frontend must never overclaim what Wi-Fi sensing can observe directly.
