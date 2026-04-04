# Hardware Setup

## Overview

The v1 sensing station uses two ESP32 development boards:

```
    ┌─────────┐        Wi-Fi        ┌─────────┐       USB        ┌──────────┐
    │ ESP32 TX│ ◄──────────────────►│ ESP32 RX│ ───────────────► │ Host PC  │
    │   (AP)  │    CSI-bearing      │(Collector)  Serial UART    │ (Gateway)│
    └─────────┘    traffic          └─────────┘                  └──────────┘
```

## Bill of Materials

| Item | Quantity | Purpose |
|------|----------|---------|
| ESP32 DevKit v1 (or similar) | 2 | TX and RX nodes |
| USB cables (micro-USB or USB-C) | 2 | Flashing + serial monitor |
| Host computer | 1 | Running the gateway service |
| Treadmill | 1 | Running surface for athlete |

## ESP32 Requirements

- Must support Wi-Fi CSI callback (classic ESP32, ESP32-S2, ESP32-S3, ESP32-C3)
- ESP-IDF 5.x recommended
- Both boards must be on the same Wi-Fi channel

## Wiring

1. **TX (AP) node**: powered via USB or external 5V supply. Positioned on one side of the treadmill.
2. **RX (Collector) node**: connected to host computer via USB serial. Positioned on the opposite side.

No additional wiring required for v1 — both boards use built-in PCB antennas.

## Flashing

### Prerequisites
- ESP-IDF 5.x installed ([installation guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/))
- `idf.py` available in PATH

### Flash TX (AP)
```bash
cd firmware/tx_ap
idf.py set-target esp32
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

### Flash RX (Collector)
```bash
cd firmware/rx_csi_collector
idf.py set-target esp32
idf.py build
idf.py -p /dev/ttyUSB1 flash monitor
```

## Serial Output

The RX node emits CSV lines at the configured baud rate (default 115200):

```
CSI,<timestamp>,<rssi>,<channel>,<mac>,<csi_len>,<val1>,<val2>,...,<valN>
```

The gateway's serial parser expects this exact format. See `apps/gateway/src/serial/serial.parser.ts`.

## Monitoring

```bash
# Direct serial monitor
idf.py -p /dev/ttyUSB1 monitor

# Or with the gateway
SERIAL_PORT=/dev/ttyUSB1 make gateway
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No serial output | Check USB connection, verify correct port, check baud rate |
| CSI callback not firing | Ensure TX is generating traffic, verify same Wi-Fi channel |
| Garbled output | Baud rate mismatch between firmware config and gateway |
| Permission denied on serial port | Add user to `dialout` group (Linux) or check macOS permissions |
