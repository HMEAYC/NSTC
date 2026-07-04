#include "websocket_client.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "esp_log.h"
#include "esp_timer.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "WSClient";

#define WS_URI           CONFIG_HMEAYC_WS_URI
#define DEVICE_ID        CONFIG_HMEAYC_DEVICE_ID
#define RECONNECT_DELAY_MS  1000
#define MIN_RECONNECT_INTERVAL_MS 5000

static esp_websocket_client_handle_t ws_client = NULL;
static bool ws_connected = false;
static bool ws_reconnect_pending = false;
static int64_t last_reconnect_ms = 0;
static int send_fail_count = 0;
#define MAX_SEND_FAILURES 3

static void ws_event_handler(void *arg, esp_event_base_t base,
                             int32_t id, void *data) {
    esp_websocket_event_data_t *evt = (esp_websocket_event_data_t *)data;

    switch (id) {
        case WEBSOCKET_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WebSocket connected to %s", WS_URI);
            ws_connected = true;
            ws_reconnect_pending = false;
            send_fail_count = 0;
            break;
        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "WebSocket disconnected");
            ws_connected = false;
            ws_reconnect_pending = true;
            break;
        case WEBSOCKET_EVENT_ERROR:
            ESP_LOGE(TAG, "WebSocket error");
            ws_connected = false;
            ws_reconnect_pending = true;
            break;
        default:
            break;
    }
}

void websocket_request_reconnect(void) {
    ws_reconnect_pending = true;
}

bool websocket_reconnect_pending(void) {
    return ws_reconnect_pending;
}

bool websocket_should_reconnect(void) {
    if (!ws_reconnect_pending) return false;
    int64_t now = esp_timer_get_time() / 1000;
    return (now - last_reconnect_ms >= MIN_RECONNECT_INTERVAL_MS);
}

esp_err_t websocket_client_init(void) {
    esp_websocket_client_config_t cfg = {
        .uri = WS_URI,
        .task_stack = 4096,
        .keep_alive_enable = true,
        .keep_alive_idle = 10,
        .network_timeout_ms = 5000,
        .disable_auto_reconnect = true,
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

esp_err_t websocket_reconnect(void) {
    last_reconnect_ms = esp_timer_get_time() / 1000;
    ws_reconnect_pending = false;
    if (ws_client) {
        esp_websocket_client_stop(ws_client);
        esp_websocket_client_destroy(ws_client);
        ws_client = NULL;
    }
    ws_connected = false;
    vTaskDelay(pdMS_TO_TICKS(RECONNECT_DELAY_MS));
    return websocket_client_init();
}

bool websocket_is_connected(void) {
    return ws_connected;
}

esp_err_t websocket_send_json(const imu_data_t *data) {
    if (!ws_client || !data) return ESP_ERR_INVALID_STATE;
    if (!ws_connected) return ESP_ERR_INVALID_STATE;

    int64_t ts = esp_timer_get_time() / 1000;  // ms since boot
    char buf[256];
    int len = snprintf(buf, sizeof(buf),
        "{"
        "\"type\":\"imu\","
        "\"ts\":%lld,"
        "\"device_id\":\"%s\","
        "\"ax\":%.4f,\"ay\":%.4f,\"az\":%.4f,"
        "\"gx\":%.2f,\"gy\":%.2f,\"gz\":%.2f"
        "}",
        (long long)ts, DEVICE_ID,
        data->accel_x, data->accel_y, data->accel_z,
        data->gyro_x, data->gyro_y, data->gyro_z);

    int ret = esp_websocket_client_send_text(ws_client, buf, len, pdMS_TO_TICKS(100));
    if (ret < 0) {
        if (ws_connected && ++send_fail_count >= MAX_SEND_FAILURES) {
            ws_connected = false;
            ws_reconnect_pending = true;
        }
    } else {
        send_fail_count = 0;
    }
    return ESP_OK;
}
