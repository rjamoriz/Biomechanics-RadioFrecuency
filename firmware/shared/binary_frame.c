/**
 * Binary Frame Protocol — Implementation
 *
 * CRC-CCITT (0xFFFF initial, polynomial 0x1021) and frame packing.
 */

#include "binary_frame.h"
#include <string.h>

/* ---------- CRC-CCITT ---------- */

uint16_t frame_compute_crc16(const uint8_t *data, size_t len)
{
    uint16_t crc = 0xFFFF;

    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (int bit = 0; bit < 8; bit++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }

    return crc;
}

/* ---------- Frame packing ---------- */

/**
 * Write a 16-bit big-endian value to buffer.
 */
static void put_be16(uint8_t *buf, uint16_t val)
{
    buf[0] = (uint8_t)(val >> 8);
    buf[1] = (uint8_t)(val & 0xFF);
}

/**
 * Write a 32-bit big-endian value to buffer.
 */
static void put_be32(uint8_t *buf, uint32_t val)
{
    buf[0] = (uint8_t)(val >> 24);
    buf[1] = (uint8_t)(val >> 16);
    buf[2] = (uint8_t)(val >> 8);
    buf[3] = (uint8_t)(val & 0xFF);
}

int frame_pack(const frame_data_t *data, uint8_t *out_buf, size_t *out_len)
{
    if (!data || !out_buf || !out_len) {
        return -1;
    }

    if (data->num_subcarriers > FRAME_MAX_SUBCARRIERS) {
        return -1;
    }

    uint16_t payload_bytes = (uint16_t)(data->num_subcarriers * 2);
    size_t total = FRAME_HEADER_SIZE + payload_bytes + FRAME_CRC_SIZE;
    size_t pos = 0;

    /* Sync word */
    out_buf[pos++] = FRAME_SYNC_0;
    out_buf[pos++] = FRAME_SYNC_1;

    /* Version */
    out_buf[pos++] = FRAME_VERSION;

    /* Frame type */
    out_buf[pos++] = data->frame_type;

    /* Sequence (big-endian) */
    put_be16(&out_buf[pos], data->sequence);
    pos += 2;

    /* Timestamp (big-endian) */
    put_be32(&out_buf[pos], data->timestamp_ms);
    pos += 4;

    /* Payload length (big-endian) */
    put_be16(&out_buf[pos], payload_bytes);
    pos += 2;

    /* Station ID (first 4 bytes of MAC) */
    memcpy(&out_buf[pos], data->station_id, 4);
    pos += 4;

    /* RSSI */
    out_buf[pos++] = (uint8_t)data->rssi;

    /* Channel */
    out_buf[pos++] = data->channel;

    /* Noise floor */
    out_buf[pos++] = (uint8_t)data->noise_floor;

    /* Num subcarriers */
    out_buf[pos++] = data->num_subcarriers;

    /* Payload: I,Q pairs as signed int8 */
    memcpy(&out_buf[pos], data->payload, payload_bytes);
    pos += payload_bytes;

    /* CRC over VERSION..end of payload (skip SYNC_WORD) */
    uint16_t crc = frame_compute_crc16(
        &out_buf[FRAME_CRC_START_OFFSET],
        pos - FRAME_CRC_START_OFFSET
    );
    put_be16(&out_buf[pos], crc);
    pos += 2;

    *out_len = total;
    return 0;
}
