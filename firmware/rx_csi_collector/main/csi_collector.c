/**
 * ESP32 CSI Collector — Receiver Node
 *
 * Connects to the transmitter AP as a Wi-Fi station, registers the CSI
 * callback, and outputs parsed CSI data over serial.
 *
 * Output modes (compile-time):
 *   CONFIG_BINARY_OUTPUT=1 (default) — Binary frame protocol (ADR-001)
 *   CONFIG_BINARY_OUTPUT=0           — CSV text format:
 *     CSI,<timestamp_ms>,<rssi>,<channel>,<mac>,<csi_len>,<val1>,...,<valN>
 *
 * Assumptions:
 * - Transmitter AP is broadcasting on the configured channel
 * - Serial baud rate: 921600
 * - CSI data contains interleaved [real, imag] subcarrier values
 */

#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "ota_update.h"

/* Default to binary output; set to 0 in sdkconfig to use CSV */
#ifndef CONFIG_BINARY_OUTPUT
#define CONFIG_BINARY_OUTPUT 1
#endif

#if CONFIG_BINARY_OUTPUT
#include "binary_frame.h"
static uint16_t s_sequence = 0;
#endif

static const char *TAG = "csi_collector";

/* Heartbeat interval in milliseconds */
#define HEARTBEAT_INTERVAL_MS 5000

/* Wi-Fi credentials — set via sdkconfig / menuconfig */
#define WIFI_SSID      CONFIG_WIFI_SSID
#define WIFI_PASSWORD  CONFIG_WIFI_PASSWORD

/**
 * CSI callback — invoked each time a CSI frame is received.
 * Outputs data via serial in binary frame or CSV format depending on config.
 */
static void csi_callback(void *ctx, wifi_csi_info_t *info)
{
    if (!info || !info->buf) {
        return;
    }

    uint32_t timestamp = (uint32_t)(esp_timer_get_time() / 1000);
    int8_t rssi = info->rx_ctrl.rssi;
    uint8_t channel = info->rx_ctrl.channel;
    int len = info->len;
    int8_t *buf = (int8_t *)info->buf;

#if CONFIG_BINARY_OUTPUT
    frame_data_t frame;
    memset(&frame, 0, sizeof(frame));
    frame.frame_type = FRAME_TYPE_CSI;
    frame.sequence = s_sequence++;
    frame.timestamp_ms = timestamp;
    frame.station_id[0] = info->mac[0];
    frame.station_id[1] = info->mac[1];
    frame.station_id[2] = info->mac[2];
    frame.station_id[3] = info->mac[3];
    frame.rssi = rssi;
    frame.channel = channel;
    frame.noise_floor = info->rx_ctrl.noise_floor;

    /* Clamp subcarrier count to max supported */
    int num_subcarriers = len / 2;
    if (num_subcarriers > FRAME_MAX_SUBCARRIERS) {
        num_subcarriers = FRAME_MAX_SUBCARRIERS;
    }
    frame.num_subcarriers = (uint8_t)num_subcarriers;
    memcpy(frame.payload, buf, num_subcarriers * 2);

    uint8_t out_buf[FRAME_MAX_SIZE];
    size_t out_len = 0;
    if (frame_pack(&frame, out_buf, &out_len) == 0) {
        fwrite(out_buf, 1, out_len, stdout);
        fflush(stdout);
    }
#else
    /* Format MAC address */
    char mac_str[18];
    snprintf(mac_str, sizeof(mac_str),
             "%02X:%02X:%02X:%02X:%02X:%02X",
             info->mac[0], info->mac[1], info->mac[2],
             info->mac[3], info->mac[4], info->mac[5]);

    /* Print header */
    printf("CSI,%u,%d,%u,%s,%d",
           timestamp, rssi, channel, mac_str, len);

    /* Print CSI values */
    for (int i = 0; i < len; i++) {
        printf(",%d", buf[i]);
    }
    printf("\n");
#endif
}

/**
 * Wi-Fi event handler — handles STA connection lifecycle.
 */
static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                                int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "Connecting to AP: %s", WIFI_SSID);
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Disconnected — reconnecting...");
        vTaskDelay(pdMS_TO_TICKS(1000));
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Connected — IP: " IPSTR, IP2STR(&event->ip_info.ip));
    }
}

/**
 * Initialize Wi-Fi as station and register CSI callback.
 */
static void wifi_init_sta(void)
{
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    /* Register event handlers */
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    /* Station config */
    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASSWORD,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));

    /* Enable CSI */
    wifi_csi_config_t csi_config = {
        .lltf_en = true,
        .htltf_en = true,
        .stbc_htltf2_en = true,
        .ltf_merge_en = true,
        .channel_filter_en = false,
        .manu_scale = false,
        .shift = false,
    };
    ESP_ERROR_CHECK(esp_wifi_set_csi_config(&csi_config));
    ESP_ERROR_CHECK(esp_wifi_set_csi_rx_cb(csi_callback, NULL));
    ESP_ERROR_CHECK(esp_wifi_set_csi(true));

    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "CSI collector initialized — waiting for packets");
}

#if CONFIG_BINARY_OUTPUT
/**
 * Heartbeat task — sends periodic heartbeat frames to confirm link health.
 */
static void heartbeat_task(void *arg)
{
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS));

        frame_data_t frame;
        memset(&frame, 0, sizeof(frame));
        frame.frame_type = FRAME_TYPE_HEARTBEAT;
        frame.sequence = s_sequence++;
        frame.timestamp_ms = (uint32_t)(esp_timer_get_time() / 1000);
        frame.num_subcarriers = 0;

        uint8_t out_buf[FRAME_HEADER_SIZE + FRAME_CRC_SIZE];
        size_t out_len = 0;
        if (frame_pack(&frame, out_buf, &out_len) == 0) {
            fwrite(out_buf, 1, out_len, stdout);
            fflush(stdout);
        }
    }
}
#endif

void app_main(void)
{
    /* Initialize NVS — required by Wi-Fi */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* Initialize networking and event loop */
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    /* Start Wi-Fi station with CSI */
    wifi_init_sta();

#if CONFIG_BINARY_OUTPUT
    ESP_LOGI(TAG, "Binary frame output enabled (ADR-001)");
    /* Start heartbeat task */
    xTaskCreate(heartbeat_task, "heartbeat", 2048, NULL, 3, NULL);
#else
    ESP_LOGI(TAG, "CSV text output enabled");
#endif

    /* Initialize OTA subsystem and start periodic check task */
    ota_init();
    xTaskCreate(ota_periodic_check_task, "ota_check", 8192, NULL, 2, NULL);
    ESP_LOGI(TAG, "OTA periodic check task started (interval: %lu ms)",
             (unsigned long)OTA_CHECK_INTERVAL_MS);
}
