# ADR-001: Binary Frame Format for ESP32 CSI Communication

- **Status**: Accepted
- **Date**: 2026-04-04
- **Authors**: Biomechanics Platform Team

## Context

The ESP32 CSI receiver currently outputs serial data as CSV text lines:

```
CSI,<timestamp_ms>,<rssi>,<channel>,<mac>,<csi_len>,<val1>,<val2>,...
```

This works but has several limitations at production scale:

1. **Bandwidth**: Text encoding of 64-128 subcarrier I/Q pairs produces ~500-1000 byte lines. Binary encoding is ~50% smaller.
2. **Integrity**: No checksum — a single corrupt byte in a CSV line silently produces bad data or a parse failure.
3. **Framing**: Relies on newline characters. If a partial line arrives, the parser must buffer text until the delimiter. Binary framing with a sync word is more robust.
4. **Parsing cost**: `parseInt()` on hundreds of comma-separated values per line at 100 Hz adds unnecessary CPU overhead on the gateway.

## Decision

Implement a binary frame protocol as the **default** output format from the ESP32 CSI receiver, with CSV as a compile-time fallback.

### Frame Format

```
Offset  Size  Field            Description
──────  ────  ───────────────  ──────────────────────────────────────
 0      2     SYNC_WORD        0xBE 0xEF — frame start marker
 2      1     VERSION          Protocol version (0x01)
 3      1     FRAME_TYPE       0x01=CSI, 0x02=heartbeat, 0x03=calibration
 4      2     SEQUENCE         Big-endian wrapping counter (0–65535)
 6      4     TIMESTAMP_MS     Big-endian milliseconds since boot
10      2     PAYLOAD_LEN      Big-endian byte count of payload section
12      4     STATION_ID       First 4 octets of transmitter MAC
16      1     RSSI             Signed, dBm
17      1     CHANNEL          Wi-Fi channel number
18      1     NOISE_FLOOR      Signed, dBm
19      1     NUM_SUBCARRIERS  Number of subcarrier pairs in payload
20      N     PAYLOAD          NUM_SUBCARRIERS × 2 bytes (I, Q as int8)
20+N    2     CRC16            CRC-CCITT over bytes [2..20+N-1]
```

- **Fixed header**: 20 bytes
- **Payload**: 0 to 256 bytes (max 128 subcarriers × 2)
- **CRC**: 2 bytes (CRC-CCITT, 0xFFFF initial, polynomial 0x1021)
- **Total**: 22 + (NUM_SUBCARRIERS × 2) bytes

### Frame Types

| Value | Type        | Payload | Purpose |
|-------|-------------|---------|---------|
| 0x01  | CSI         | I/Q data | Primary CSI measurement frame |
| 0x02  | Heartbeat   | None     | Link health, sent every 5 seconds |
| 0x03  | Calibration | TBD      | Reserved for calibration data |

### Gateway Auto-Detection

The gateway serial service inspects the first 2 bytes of incoming data:

- If `0xBE 0xEF` → binary frame mode, using streaming state-machine parser
- Otherwise → CSV text mode (existing `ReadlineParser` + `parseCsiLine`)

Mode is logged at detection time.

### CRC Policy

- CRC is computed over all bytes from VERSION through end of PAYLOAD (excludes SYNC_WORD)
- Frames with CRC mismatch are dropped with a warning log
- The parser counts CRC errors in its stats for monitoring

### Sequence Tracking

- The parser tracks the last sequence number
- Gaps are detected and logged (indicates lost frames)
- Wrapping from 0xFFFF → 0 is handled correctly

## Firmware Configuration

- Compile-time flag: `CONFIG_BINARY_OUTPUT` (default: 1)
- When `CONFIG_BINARY_OUTPUT=1`: binary frame output via `frame_pack()`
- When `CONFIG_BINARY_OUTPUT=0`: original CSV text output via `printf()`

## Consequences

### Positive

- **Integrity**: Every frame is CRC-protected. Corrupt data is detected and dropped.
- **Efficiency**: ~50% bandwidth reduction over CSV. Lower parsing overhead.
- **Observability**: Sequence numbers enable frame-loss detection.
- **Health monitoring**: Heartbeat frames confirm link is alive even without CSI traffic.
- **Backward compatible**: CSV mode remains available as a compile-time option.

### Negative

- **Debugging**: Binary data is not human-readable on a serial terminal. Use `CONFIG_BINARY_OUTPUT=0` for debugging.
- **Complexity**: Gateway now has two parser paths (mitigated by auto-detection).

### Neutral

- Frame format is versioned — future changes increment VERSION byte.
- Calibration frame type is reserved but not yet implemented.

## Files

| File | Role |
|------|------|
| `firmware/shared/binary_frame.h` | Protocol constants and types |
| `firmware/shared/binary_frame.c` | CRC and frame_pack implementation |
| `firmware/rx_csi_collector/main/csi_collector.c` | Binary/CSV output with heartbeat |
| `apps/gateway/src/serial/binary-parser.ts` | Streaming binary frame parser |
| `apps/gateway/src/serial/serial.service.ts` | Auto-detection logic |
| `apps/gateway/test/binary-parser.spec.ts` | Parser test suite |
