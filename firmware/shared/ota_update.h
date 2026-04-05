/**
 * OTA Update Module for ESP32 CSI Nodes
 *
 * Provides over-the-air firmware updates using ESP-IDF esp_https_ota API.
 * Supports:
 * - URL from UART command (OTA:<url>)
 * - URL from NVS configuration
 * - SHA256 hash verification
 * - Progress reporting via serial heartbeat frames
 * - Rollback on boot failure
 *
 * Assumptions:
 * - TLS certificates are provisioned in the firmware partition
 * - OTA partition scheme configured in sdkconfig (factory + ota_0 + ota_1)
 * - Serial baud rate: 921600
 */

#ifndef OTA_UPDATE_H
#define OTA_UPDATE_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ---------- Constants ---------- */

/** NVS namespace for OTA configuration */
#define OTA_NVS_NAMESPACE     "ota_cfg"

/** NVS key for firmware URL */
#define OTA_NVS_KEY_URL       "fw_url"

/** NVS key for expected SHA256 hash (hex string, 64 chars) */
#define OTA_NVS_KEY_SHA256    "fw_sha256"

/** Maximum URL length */
#define OTA_MAX_URL_LEN       256

/** Default check interval (6 hours in milliseconds) */
#define OTA_CHECK_INTERVAL_MS (6UL * 60UL * 60UL * 1000UL)

/** UART command prefix for manual OTA trigger */
#define OTA_UART_PREFIX       "OTA:"

/** Serial progress reporting frame type (extends binary_frame.h types) */
#define FRAME_TYPE_OTA_PROGRESS 0x04

/* ---------- Structures ---------- */

/** OTA progress state reported via serial */
typedef struct {
    uint8_t  progress_pct;   /**< 0-100 download progress */
    uint8_t  state;          /**< 0=idle, 1=downloading, 2=verifying, 3=done, 4=failed */
    uint32_t bytes_written;  /**< Bytes written to OTA partition so far */
    uint32_t total_size;     /**< Total firmware image size (0 if unknown) */
} ota_progress_t;

/** OTA states */
typedef enum {
    OTA_STATE_IDLE        = 0,
    OTA_STATE_DOWNLOADING = 1,
    OTA_STATE_VERIFYING   = 2,
    OTA_STATE_DONE        = 3,
    OTA_STATE_FAILED      = 4,
} ota_state_t;

/* ---------- API ---------- */

/**
 * Initialize OTA subsystem.
 * - Validates current running partition (marks as valid if booted successfully)
 * - Reads OTA URL from NVS if available
 *
 * @return ESP_OK on success
 */
esp_err_t ota_init(void);

/**
 * Start OTA update from the given URL.
 * Blocks until the update is complete or fails.
 * On success, the device should reboot via esp_restart().
 *
 * @param url  HTTPS URL of the firmware binary
 * @return ESP_OK on success, error code on failure
 */
esp_err_t ota_start(const char *url);

/**
 * Set the expected SHA256 hash for verification.
 *
 * @param sha256_hex  64-character hex string (NULL to skip verification)
 */
void ota_set_expected_hash(const char *sha256_hex);

/**
 * Get current OTA progress.
 */
ota_progress_t ota_get_progress(void);

/**
 * Parse a UART line for OTA commands.
 * Recognizes "OTA:<url>" format.
 *
 * @param line  Null-terminated UART line
 * @return true if an OTA command was detected and queued
 */
bool ota_parse_uart_command(const char *line);

/**
 * Save an OTA URL to NVS for periodic checking.
 *
 * @param url  HTTPS URL to store (NULL to clear)
 * @return ESP_OK on success
 */
esp_err_t ota_save_url_to_nvs(const char *url);

/**
 * FreeRTOS task that periodically checks for updates.
 * Call via xTaskCreate. Stack size: 8192 recommended.
 */
void ota_periodic_check_task(void *arg);

#ifdef __cplusplus
}
#endif

#endif /* OTA_UPDATE_H */
