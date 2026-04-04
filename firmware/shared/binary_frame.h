/**
 * Binary Frame Protocol for ESP32 CSI Communication (ADR-001)
 *
 * Frame layout:
 *   [SYNC_WORD:       2 bytes  (0xBE, 0xEF)]
 *   [VERSION:         1 byte   (0x01)]
 *   [FRAME_TYPE:      1 byte   (0x01=CSI, 0x02=heartbeat, 0x03=calibration)]
 *   [SEQUENCE:        2 bytes  big-endian, wrapping counter]
 *   [TIMESTAMP_MS:    4 bytes  big-endian, millis since boot]
 *   [PAYLOAD_LEN:     2 bytes  big-endian, byte count of payload]
 *   [STATION_ID:      4 bytes  first 4 octets of MAC]
 *   [RSSI:            1 byte   signed]
 *   [CHANNEL:         1 byte   unsigned]
 *   [NOISE_FLOOR:     1 byte   signed]
 *   [NUM_SUBCARRIERS: 1 byte   unsigned]
 *   [PAYLOAD:         NUM_SUBCARRIERS * 2 bytes (I,Q as signed int8 pairs)]
 *   [CRC16:           2 bytes  CRC-CCITT over VERSION..end of PAYLOAD]
 *
 * Fixed header: 20 bytes (including SYNC_WORD)
 * Variable payload: NUM_SUBCARRIERS * 2 bytes
 * CRC: 2 bytes
 * Total: 22 + NUM_SUBCARRIERS * 2
 */

#ifndef BINARY_FRAME_H
#define BINARY_FRAME_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ---------- Constants ---------- */

#define FRAME_SYNC_0          0xBE
#define FRAME_SYNC_1          0xEF
#define FRAME_VERSION         0x01

#define FRAME_TYPE_CSI        0x01
#define FRAME_TYPE_HEARTBEAT  0x02
#define FRAME_TYPE_CALIBRATION 0x03

/** Fixed header size: SYNC(2) + VERSION(1) + TYPE(1) + SEQ(2) + TS(4) +
 *  PAYLOAD_LEN(2) + STATION_ID(4) + RSSI(1) + CHANNEL(1) + NOISE(1) + NSUB(1)
 */
#define FRAME_HEADER_SIZE     20

/** CRC field size */
#define FRAME_CRC_SIZE        2

/** Maximum subcarriers we support */
#define FRAME_MAX_SUBCARRIERS 128

/** Maximum complete frame size */
#define FRAME_MAX_SIZE        (FRAME_HEADER_SIZE + (FRAME_MAX_SUBCARRIERS * 2) + FRAME_CRC_SIZE)

/** Offset of VERSION byte (CRC starts here) */
#define FRAME_CRC_START_OFFSET 2

/* ---------- Data structures ---------- */

typedef struct {
    uint8_t  frame_type;
    uint16_t sequence;
    uint32_t timestamp_ms;
    uint8_t  station_id[4];
    int8_t   rssi;
    uint8_t  channel;
    int8_t   noise_floor;
    uint8_t  num_subcarriers;
    int8_t   payload[FRAME_MAX_SUBCARRIERS * 2];  /* I,Q pairs */
} frame_data_t;

/* ---------- Functions ---------- */

/**
 * Compute CRC-CCITT (0xFFFF initial, polynomial 0x1021) over a byte buffer.
 *
 * @param data  Pointer to buffer
 * @param len   Number of bytes
 * @return      16-bit CRC
 */
uint16_t frame_compute_crc16(const uint8_t *data, size_t len);

/**
 * Pack a frame_data_t into a binary frame buffer.
 *
 * @param data       Source frame data
 * @param out_buf    Output buffer (must be at least FRAME_MAX_SIZE bytes)
 * @param out_len    On return, number of bytes written to out_buf
 * @return           0 on success, -1 on invalid input
 */
int frame_pack(const frame_data_t *data, uint8_t *out_buf, size_t *out_len);

#ifdef __cplusplus
}
#endif

#endif /* BINARY_FRAME_H */
