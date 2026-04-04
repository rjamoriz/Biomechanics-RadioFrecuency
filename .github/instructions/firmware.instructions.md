# Firmware-specific Copilot instructions

These instructions apply primarily to the ESP32 CSI firmware under `firmware/`.

## Purpose

The firmware layer is responsible for the hardware-side Wi-Fi sensing foundation of the treadmill biomechanics platform.

It must provide:
- stable Wi-Fi traffic generation,
- CSI collection on supported ESP32 hardware,
- deterministic and parseable serial output,
- predictable runtime behavior,
- configuration clarity,
- compatibility with the host/gateway parser and calibration workflow.

The firmware is not responsible for:
- domain business logic,
- long-term persistence,
- rich analytics dashboards,
- historical reporting,
- high-level athlete/session management.

## Primary firmware architecture

The repository firmware is expected to include two applications:

1. `tx_ap`
   - creates a stable Wi-Fi AP or traffic source
   - generates controlled packet traffic to stimulate a repeatable CSI stream
   - exposes channel and traffic configuration clearly

2. `rx_csi_collector`
   - connects to the AP / traffic source
   - enables CSI collection
   - emits stable, parseable serial output
   - reports metadata needed by the host/gateway

Preserve this separation.
Do not collapse transmitter and receiver logic into one confusing firmware application unless there is a compelling, documented reason.

## Scientific honesty and product language

Firmware comments, README files, packet field names, and logs must never imply that the device directly captures camera-like motion.

Allowed concepts:
- CSI
- signal measurement
- packet metadata
- RSSI
- channel
- source MAC
- CSI length
- Wi-Fi sensing
- measurement stream
- signal quality inputs

Avoid misleading language such as:
- camera view
- optical angle
- real rear view
- exact biomechanics
- exact joint angle
- exact force

The firmware produces sensing inputs.
It does not produce validated biomechanics by itself.

## Hardware and compatibility stance

Prefer practical support for:
- classic ESP32 development boards used in ESP32 CSI workflows
- ESP-IDF-compatible projects with clearly documented version assumptions
- stable UART/serial transport for v1

When hardware assumptions are required, document them explicitly in:
- firmware README files
- config headers
- serial format docs
- host parser docs if packet format changes

## Core firmware responsibilities

### `tx_ap`
Must support:
- configurable SSID
- configurable password where needed
- configurable channel
- stable AP startup
- controlled packet generation
- repeatable traffic behavior
- simple runtime diagnostics

### `rx_csi_collector`
Must support:
- connection to configured AP
- CSI callback handling
- stable extraction of available metadata
- structured serial output
- compile-time control of verbose logging
- robust behavior under packet loss or noise

## Serial output rules

This is critical.

The serial format is a contract with the host and gateway.
Treat it as a versioned interface.

Serial output should be:
- line-based
- deterministic
- documented
- parseable with low ambiguity
- stable across runs
- explicit about missing values when fields are unavailable

Include metadata when available, such as:
- timestamp
- channel
- RSSI
- rate
- source MAC
- CSI length
- CSI values
- packet type or source classification if available

### Format design rules
- choose one clear format and document it
- prefer CSV-like or structured text with stable field ordering
- do not emit random human-only debug text on the same stream used for parsing
- keep machine-readable and human-readable output separated where possible
- if the format changes, update host parser tests and docs

### Backward compatibility rule
Do not break parser compatibility casually.
If a format change is necessary:
- document the change
- version it if appropriate
- update parser tests
- update firmware and host docs together

## Timing and buffering rules

Be careful with:
- interrupt/callback pressure
- serial bandwidth limits
- blocking operations in hot paths
- dropped packets under high throughput
- memory fragmentation
- watchdog-triggering behavior

Prefer:
- lightweight callbacks
- bounded buffers where needed
- explicit flushing strategy
- minimal dynamic allocation in hot paths
- predictable control flow

## Code quality rules

Firmware code should be:
- modular
- readable
- comment-light but well explained where hardware behavior is subtle
- defensive about nulls, lengths, and configuration assumptions
- easy to inspect by embedded developers

Prefer:
- small C modules by responsibility
- clear header ownership
- compile-time configuration for important toggles
- explicit constants with names
- narrow, testable helper functions where practical

Avoid:
- giant `app_main.c` files
- hidden global state
- magic constants
- deeply intertwined logging and data formatting logic
- hardware behavior hidden in macros without explanation

## Configuration rules

Use configuration that is:
- explicit
- documented
- easy to audit
- consistent across tx and rx applications

Configuration may include:
- SSID
- password
- Wi-Fi channel
- UART baud rate
- output verbosity
- packet generation interval
- feature flags for verbose metadata
- compile-time sensing toggles

Document defaults and safe assumptions.

## Logging rules

Separate operational logs from machine-readable serial output whenever possible.

Preferred approach:
- one predictable machine-readable stream for host parsing
- optional debug logging controlled by compile-time or runtime configuration

Avoid:
- mixing free-form logs into the packet stream
- excessive logging in high-frequency callbacks
- logs that imply validated biomechanics or camera-like outputs

## Error-handling rules

Handle failures explicitly, including:
- Wi-Fi connection failures
- AP startup failures
- UART init failures
- malformed CSI lengths
- unsupported states
- reconnection cases where applicable

When failures occur:
- emit useful diagnostics
- avoid silent failure
- avoid reboot loops unless clearly justified
- preserve debuggability

## Host and gateway contract rules

Always remember that the firmware feeds:
- the host serial capture layer
- the realtime gateway parser
- calibration workflows
- downstream analytics

Therefore:
- parser compatibility matters
- timestamp consistency matters
- field naming matters
- channel/rate metadata matters
- station reproducibility matters

Do not change packet semantics without updating downstream contracts.

## Calibration and deployment context

The firmware will be used in treadmill environments where the system may face:
- nearby people
- reflective structures
- varying treadmill speeds
- station repositioning
- gym Wi-Fi interference
- environmental drift

Firmware should therefore support:
- repeatable startup
- stable channel selection
- predictable traffic generation
- enough metadata to diagnose degraded sensing conditions

## Naming rules

Prefer names like:
- csi_handler
- serial_output
- wifi_ap
- traffic_gen
- packet_metadata
- csi_frame
- source_mac
- output_record
- uart_writer

Avoid names like:
- camera_stream
- motion_view
- real_pose
- exact_biomech
- magic_data

## Documentation expectations

When firmware changes, update relevant docs:
- `firmware/README.md`
- `firmware/rx_csi_collector/README.md`
- `firmware/tx_ap/README.md`
- `docs/hardware_setup.md`
- `docs/calibration_protocol.md`
- `docs/architecture.md`
- any serial format documentation used by the host/gateway

Documentation must explain:
- board assumptions
- ESP-IDF assumptions
- serial format
- configuration variables
- flashing steps
- monitoring steps
- packet format changes
- known hardware limitations

## Testing and verification guidance

Firmware may not have full automated tests, but changes should still be verified carefully.

When possible:
- keep parsing-sensitive output deterministic
- create serial output examples/fixtures for host-side parser tests
- validate compile-time configuration combinations
- verify that output remains stable under sustained streaming

If a hardware-dependent behavior cannot be fully verified:
- document the assumption
- keep the code conservative
- avoid claiming the behavior is proven if it is not

## Performance and safety priorities

Optimize in this order:
1. serial format stability
2. runtime correctness
3. predictable behavior under load
4. parser compatibility
5. debuggability
6. throughput
7. code neatness

Do not micro-optimize at the expense of clarity unless there is a demonstrated bottleneck.

## Final rule

The firmware must be boring in the best possible way:
stable, predictable, documented, and easy for the rest of the system to trust.

It is the sensing foundation of the platform, so any change that affects serial output,
timing, packet meaning, or configuration must be treated as an interface change, not just
a local implementation detail.
