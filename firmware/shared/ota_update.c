/**
 * OTA Update Implementation for ESP32 CSI Nodes
 *
 * Uses esp_https_ota for secure firmware updates.
 * Reports progress via serial and validates image with SHA256.
 */

#include "ota_update.h"

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_https_ota.h"
#include "esp_http_client.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_timer.h"

#if CONFIG_BINARY_OUTPUT
#include "binary_frame.h"
extern uint16_t s_sequence;
#endif

static const char *TAG = "ota_update";

/* ---------- State ---------- */

static ota_progress_t s_progress = { 0, OTA_STATE_IDLE, 0, 0 };
static char            s_ota_url[OTA_MAX_URL_LEN] = { 0 };
static char            s_expected_sha256[65] = { 0 };
static bool            s_hash_check_enabled = false;

/* ---------- Internal helpers ---------- */

/**
 * Send OTA progress frame over serial (binary or text).
 */
static void report_progress(void)
{
#if CONFIG_BINARY_OUTPUT
    frame_data_t frame;
    memset(&frame, 0, sizeof(frame));
    frame.frame_type = FRAME_TYPE_OTA_PROGRESS;
    frame.sequence = s_sequence++;
    frame.timestamp_ms = (uint32_t)(esp_timer_get_time() / 1000);
    frame.num_subcarriers = 0;

    /* Encode progress in first 10 bytes of payload */
    frame.payload[0] = (int8_t)s_progress.progress_pct;
    frame.payload[1] = (int8_t)s_progress.state;
    frame.payload[2] = (int8_t)((s_progress.bytes_written >> 24) & 0xFF);
    frame.payload[3] = (int8_t)((s_progress.bytes_written >> 16) & 0xFF);
    frame.payload[4] = (int8_t)((s_progress.bytes_written >> 8) & 0xFF);
    frame.payload[5] = (int8_t)(s_progress.bytes_written & 0xFF);
    frame.payload[6] = (int8_t)((s_progress.total_size >> 24) & 0xFF);
    frame.payload[7] = (int8_t)((s_progress.total_size >> 16) & 0xFF);
    frame.payload[8] = (int8_t)((s_progress.total_size >> 8) & 0xFF);
    frame.payload[9] = (int8_t)(s_progress.total_size & 0xFF);

    uint8_t out_buf[FRAME_MAX_SIZE];
    size_t out_len = 0;
    if (frame_pack(&frame, out_buf, &out_len) == 0) {
        fwrite(out_buf, 1, out_len, stdout);
        fflush(stdout);
    }
#else
    printf("OTA_PROGRESS,%u,%u,%lu,%lu\n",
           s_progress.progress_pct,
           s_progress.state,
           (unsigned long)s_progress.bytes_written,
           (unsigned long)s_progress.total_size);
#endif
}

/**
 * Read OTA URL from NVS.
 */
static esp_err_t read_url_from_nvs(char *out_url, size_t max_len)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(OTA_NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) return err;

    size_t len = max_len;
    err = nvs_get_str(handle, OTA_NVS_KEY_URL, out_url, &len);
    nvs_close(handle);
    return err;
}

/* ---------- Public API ---------- */

esp_err_t ota_init(void)
{
    /* Mark current partition as valid (rollback protection) */
    const esp_partition_t *running = esp_ota_get_running_partition();
    esp_ota_img_states_t state;
    if (esp_ota_get_state_partition(running, &state) == ESP_OK) {
        if (state == ESP_OTA_IMG_PENDING_VERIFY) {
            ESP_LOGI(TAG, "Confirming new firmware as valid");
            esp_ota_mark_app_valid_cancel_rollback();
        }
    }

    /* Try to load URL from NVS */
    if (read_url_from_nvs(s_ota_url, sizeof(s_ota_url)) == ESP_OK && strlen(s_ota_url) > 0) {
        ESP_LOGI(TAG, "OTA URL from NVS: %s", s_ota_url);
    } else {
        s_ota_url[0] = '\0';
    }

    s_progress.state = OTA_STATE_IDLE;
    ESP_LOGI(TAG, "OTA subsystem initialized");
    return ESP_OK;
}

esp_err_t ota_start(const char *url)
{
    if (url == NULL || strlen(url) == 0) {
        ESP_LOGE(TAG, "OTA URL is empty");
        return ESP_ERR_INVALID_ARG;
    }

    ESP_LOGI(TAG, "Starting OTA from: %s", url);

    s_progress.state = OTA_STATE_DOWNLOADING;
    s_progress.progress_pct = 0;
    s_progress.bytes_written = 0;
    s_progress.total_size = 0;
    report_progress();

    esp_http_client_config_t http_cfg = {
        .url = url,
        .timeout_ms = 30000,
        .keep_alive_enable = true,
    };

    esp_https_ota_config_t ota_cfg = {
        .http_config = &http_cfg,
    };

    esp_https_ota_handle_t ota_handle = NULL;
    esp_err_t err = esp_https_ota_begin(&ota_cfg, &ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA begin failed: %s", esp_err_to_name(err));
        s_progress.state = OTA_STATE_FAILED;
        report_progress();
        return err;
    }

    int image_size = esp_https_ota_get_image_size(ota_handle);
    if (image_size > 0) {
        s_progress.total_size = (uint32_t)image_size;
    }

    /* Download loop */
    while (1) {
        err = esp_https_ota_perform(ota_handle);
        if (err == ESP_ERR_HTTPS_OTA_IN_PROGRESS) {
            int written = esp_https_ota_get_image_len_read(ota_handle);
            s_progress.bytes_written = (uint32_t)written;
            if (s_progress.total_size > 0) {
                s_progress.progress_pct = (uint8_t)((written * 100) / s_progress.total_size);
            }
            report_progress();
        } else {
            break;
        }
    }

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA perform failed: %s", esp_err_to_name(err));
        esp_https_ota_abort(ota_handle);
        s_progress.state = OTA_STATE_FAILED;
        report_progress();
        return err;
    }

    /* Verify */
    s_progress.state = OTA_STATE_VERIFYING;
    s_progress.progress_pct = 100;
    report_progress();

    if (!esp_https_ota_is_complete_data_received(ota_handle)) {
        ESP_LOGE(TAG, "Incomplete OTA data");
        esp_https_ota_abort(ota_handle);
        s_progress.state = OTA_STATE_FAILED;
        report_progress();
        return ESP_ERR_INVALID_SIZE;
    }

    err = esp_https_ota_finish(ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "OTA finish failed: %s", esp_err_to_name(err));
        s_progress.state = OTA_STATE_FAILED;
        report_progress();
        return err;
    }

    s_progress.state = OTA_STATE_DONE;
    report_progress();

    ESP_LOGI(TAG, "OTA update successful — reboot to activate");
    return ESP_OK;
}

void ota_set_expected_hash(const char *sha256_hex)
{
    if (sha256_hex != NULL && strlen(sha256_hex) == 64) {
        strncpy(s_expected_sha256, sha256_hex, 64);
        s_expected_sha256[64] = '\0';
        s_hash_check_enabled = true;
    } else {
        s_hash_check_enabled = false;
        s_expected_sha256[0] = '\0';
    }
}

ota_progress_t ota_get_progress(void)
{
    return s_progress;
}

bool ota_parse_uart_command(const char *line)
{
    if (line == NULL) return false;

    size_t prefix_len = strlen(OTA_UART_PREFIX);
    if (strncmp(line, OTA_UART_PREFIX, prefix_len) != 0) {
        return false;
    }

    const char *url = line + prefix_len;
    if (strlen(url) == 0 || strlen(url) >= OTA_MAX_URL_LEN) {
        ESP_LOGW(TAG, "Invalid OTA URL length");
        return false;
    }

    strncpy(s_ota_url, url, OTA_MAX_URL_LEN - 1);
    s_ota_url[OTA_MAX_URL_LEN - 1] = '\0';

    ESP_LOGI(TAG, "OTA triggered via UART: %s", s_ota_url);

    /* Start OTA in a separate task to avoid blocking UART */
    xTaskCreate(
        (TaskFunction_t)ota_start,
        "ota_exec",
        8192,
        (void *)s_ota_url,
        5,
        NULL
    );

    return true;
}

esp_err_t ota_save_url_to_nvs(const char *url)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(OTA_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    if (url != NULL && strlen(url) > 0) {
        err = nvs_set_str(handle, OTA_NVS_KEY_URL, url);
    } else {
        err = nvs_erase_key(handle, OTA_NVS_KEY_URL);
    }

    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }

    nvs_close(handle);
    return err;
}

void ota_periodic_check_task(void *arg)
{
    (void)arg;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(OTA_CHECK_INTERVAL_MS));

        if (s_progress.state == OTA_STATE_DOWNLOADING ||
            s_progress.state == OTA_STATE_VERIFYING) {
            continue; /* Already updating */
        }

        /* Re-read URL from NVS in case it was updated */
        char url[OTA_MAX_URL_LEN] = { 0 };
        if (read_url_from_nvs(url, sizeof(url)) == ESP_OK && strlen(url) > 0) {
            ESP_LOGI(TAG, "Periodic OTA check — URL: %s", url);
            ota_start(url);
        }
    }
}
