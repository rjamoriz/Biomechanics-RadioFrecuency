/**
 * ESP32 Transmitter — Access Point with periodic packet transmission.
 *
 * Operates as a Wi-Fi AP and sends periodic UDP packets to generate
 * stable CSI frames on the receiver node.
 *
 * Transmission rate: ~100 Hz (10 ms interval)
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
#include "lwip/sockets.h"

static const char *TAG = "tx_beacon";

#define WIFI_SSID       CONFIG_WIFI_SSID
#define WIFI_PASSWORD   CONFIG_WIFI_PASSWORD
#define WIFI_CHANNEL    CONFIG_WIFI_CHANNEL
#define MAX_STA_CONN    CONFIG_MAX_STA_CONN

/* UDP beacon config */
#define BEACON_PORT     5000
#define BEACON_DEST     "255.255.255.255"
#define BEACON_INTERVAL_MS  10   /* ~100 Hz */

/**
 * Wi-Fi AP event handler.
 */
static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                                int32_t event_id, void *event_data)
{
    if (event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t *event = (wifi_event_ap_staconnected_t *)event_data;
        ESP_LOGI(TAG, "Station connected — MAC: %02x:%02x:%02x:%02x:%02x:%02x",
                 event->mac[0], event->mac[1], event->mac[2],
                 event->mac[3], event->mac[4], event->mac[5]);
    } else if (event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t *event = (wifi_event_ap_stadisconnected_t *)event_data;
        ESP_LOGI(TAG, "Station disconnected — MAC: %02x:%02x:%02x:%02x:%02x:%02x",
                 event->mac[0], event->mac[1], event->mac[2],
                 event->mac[3], event->mac[4], event->mac[5]);
    }
}

/**
 * Initialize Wi-Fi as access point.
 */
static void wifi_init_ap(void)
{
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_config = {
        .ap = {
            .ssid = WIFI_SSID,
            .ssid_len = strlen(WIFI_SSID),
            .channel = WIFI_CHANNEL,
            .password = WIFI_PASSWORD,
            .max_connection = MAX_STA_CONN,
            .authmode = WIFI_AUTH_WPA2_PSK,
        },
    };

    if (strlen(WIFI_PASSWORD) == 0) {
        wifi_config.ap.authmode = WIFI_AUTH_OPEN;
    }

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "AP started — SSID: %s, Channel: %d", WIFI_SSID, WIFI_CHANNEL);
}

/**
 * Beacon task — sends periodic UDP broadcast packets.
 */
static void beacon_task(void *arg)
{
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) {
        ESP_LOGE(TAG, "Failed to create socket");
        vTaskDelete(NULL);
        return;
    }

    /* Enable broadcast */
    int broadcast = 1;
    setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast));

    struct sockaddr_in dest_addr;
    memset(&dest_addr, 0, sizeof(dest_addr));
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(BEACON_PORT);
    inet_aton(BEACON_DEST, &dest_addr.sin_addr);

    uint32_t seq = 0;
    char beacon_data[64];

    ESP_LOGI(TAG, "Beacon task started — %d ms interval", BEACON_INTERVAL_MS);

    while (1) {
        int len = snprintf(beacon_data, sizeof(beacon_data),
                          "BIOMECH_BEACON,%u,%u",
                          seq++, (uint32_t)(esp_timer_get_time() / 1000));

        sendto(sock, beacon_data, len, 0,
               (struct sockaddr *)&dest_addr, sizeof(dest_addr));

        vTaskDelay(pdMS_TO_TICKS(BEACON_INTERVAL_MS));
    }
}

void app_main(void)
{
    /* Initialize NVS */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* Initialize networking */
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    /* Start AP */
    wifi_init_ap();

    /* Start beacon transmission */
    xTaskCreate(beacon_task, "beacon", 4096, NULL, 5, NULL);
}
