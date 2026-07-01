#include "websocket_client.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_transport.h"
#include "esp_transport_ws.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "WSClient";

#define WS_URI CONFIG_HMEAYC_WS_URI

static esp_websocket_client_handle_t ws_client = NULL;
static bool ws_connected = false;

static void ws_event_handler(void *arg, esp_event_base_t base,
                             int32_t id, void *data) {
    esp_websocket_event_data_t *evt = (esp_websocket_event_data_t *)data;

    switch (id) {
        case WEBSOCKET_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WebSocket connected");
            ws_connected = true;
            break;
        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "WebSocket disconnected");
            ws_connected = false;
            break;
        case WEBSOCKET_EVENT_ERROR:
            ESP_LOGE(TAG, "WebSocket error");
            ws_connected = false;
            break;
        default:
            break;
    }
}

esp_err_t websocket_client_init(void) {
    esp_websocket_client_config_t cfg = {
        .uri = WS_URI,
        .task_stack = 4096,
        .keep_alive_sec = 10,
    };

    ws_client = esp_websocket_client_init(&cfg);
    if (!ws_client) {
        ESP_LOGE(TAG, "websocket client init failed");
        return ESP_FAIL;
    }

    esp_err_t ret = esp_websocket_register_events(ws_client,
                     WEBSOCKET_EVENT_ANY, ws_event_handler, NULL);
    if (ret != ESP_OK) return ret;

    ret = esp_websocket_client_start(ws_client);
    if (ret != ESP_OK) return ret;

    ESP_LOGI(TAG, "connecting to %s ...", WS_URI);
    return ESP_OK;
}

esp_err_t websocket_send_json(const imu_data_t *data) {
    if (!ws_connected || !ws_client || !data) return ESP_ERR_INVALID_STATE;

    char buf[192];
    int len = snprintf(buf, sizeof(buf),
        "{"
        "\"accel_x\":%.4f,\"accel_y\":%.4f,\"accel_z\":%.4f,"
        "\"gyro_x\":%.2f,\"gyro_y\":%.2f,\"gyro_z\":%.2f"
        "}",
        data->accel_x, data->accel_y, data->accel_z,
        data->gyro_x, data->gyro_y, data->gyro_z);

    return esp_websocket_client_send_text(ws_client, buf, len, pdMS_TO_TICKS(100));
}
