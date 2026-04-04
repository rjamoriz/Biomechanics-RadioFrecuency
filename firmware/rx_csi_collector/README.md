# ESP32 Receiver — CSI Collector

This firmware runs on the ESP32 receiver node in the treadmill sensing station.
It connects to the transmitter AP, collects Wi-Fi CSI (Channel State Information)
data, and outputs parsed CSI packets over the serial port.

## Serial Output Format

```
CSI,<timestamp_ms>,<rssi>,<channel>,<mac>,<csi_len>,<val1>,<val2>,...,<valN>
```

Fields:
- `timestamp_ms`: Device uptime in milliseconds
- `rssi`: Received Signal Strength Indicator (dBm)
- `channel`: Wi-Fi channel number
- `mac`: Transmitter MAC address
- `csi_len`: Number of CSI values following
- `val1..valN`: Interleaved real/imaginary CSI subcarrier values

## Build

Requires ESP-IDF v5.x.

```bash
cd firmware/rx_csi_collector
idf.py set-target esp32
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

## Configuration

Wi-Fi credentials and CSI config are set in `sdkconfig.defaults`.
Adjust `CONFIG_WIFI_SSID` and `CONFIG_WIFI_PASSWORD` to match the transmitter AP.
