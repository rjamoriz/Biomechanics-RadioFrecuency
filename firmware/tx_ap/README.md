# ESP32 Transmitter — Access Point

This firmware runs on the ESP32 transmitter node in the treadmill sensing station.
It operates as a Wi-Fi access point that continuously transmits packets,
which the receiver node uses to collect CSI data.

## Operation

The transmitter broadcasts periodic ping packets at a stable rate (~100 Hz)
to generate consistent CSI frames on the receiver side.

## Build

Requires ESP-IDF v5.x.

```bash
cd firmware/tx_ap
idf.py set-target esp32
idf.py build
idf.py -p /dev/ttyUSB1 flash monitor
```

## Configuration

Set `CONFIG_WIFI_SSID` and `CONFIG_WIFI_PASSWORD` in `sdkconfig.defaults`.
These must match the receiver's configuration.
