#include "websocket_client.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_timer.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "WSClient";

#define WS_URI           CONFIG_HMEAYC_WS_URI
#define DEVICE_ID        CONFIG_HMEAYC_DEVICE_ID
#define RECONNECT_DELAY_MS  3000
#define MIN_RECONNECT_INTERVAL_MS 10000

static esp_websocket_client_handle_t ws_client = NULL;
static bool ws_connected = false;
static bool ws_reconnect_pending = false;
static int64_t last_reconnect_ms = 0;
static int64_t connected_since_ms = 0;
static int send_fail_count = 0;
#define MAX_SEND_FAILURES 3

// Dynamic session support
static char ws_base_uri[128] = {0};
static char current_session_id[64] = "default";

static void parse_ws_uri(void) {
    // Parse CONFIG_HMEAYC_WS_URI (e.g. "ws://host:port/ws/default")
    // into ws_base_uri ("ws://host:port") and current_session_id ("default")
    if (ws_base_uri[0] != '\0') {
        return;  // already parsed
    }
    const char *p = strstr(WS_URI, "/ws/");
    if (!p) {
        // No /ws/ found, use full URI as base and session "default"
        strncpy(ws_base_uri, WS_URI, sizeof(ws_base_uri) - 1);
        strncpy(current_session_id, "default", sizeof(current_session_id) - 1);
        return;
    }
    size_t base_len = p - WS_URI;
    if (base_len >= sizeof(ws_base_uri)) base_len = sizeof(ws_base_uri) - 1;
    strncpy(ws_base_uri, WS_URI, base_len);
    ws_base_uri[base_len] = '\0';

    const char *sid = p + 4;  // skip "/ws/"
    strncpy(current_session_id, sid, sizeof(current_session_id) - 1);
    current_session_id[sizeof(current_session_id) - 1] = '\0';
}

void websocket_parse_base_uri(void) {
    parse_ws_uri();
}

static void build_ws_uri(char *buf, size_t buf_size) {
    snprintf(buf, buf_size, "%s/ws/%s", ws_base_uri, current_session_id);
}

static void ws_event_handler(void *arg, esp_event_base_t base,
                             int32_t id, void *data) {
    (void)data;

    switch (id) {
        case WEBSOCKET_EVENT_CONNECTED: {
            char uri[256];
            build_ws_uri(uri, sizeof(uri));
            ESP_LOGI(TAG, "WebSocket connected to %s", uri);
            ws_connected = true;
            connected_since_ms = esp_timer_get_time() / 1000;
            ws_reconnect_pending = false;
            send_fail_count = 0;
            break;
        }
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

void websocket_set_session_id(const char *session_id) {
    if (!session_id || session_id[0] == '\0') {
        session_id = "default";
    }
    if (strcmp(current_session_id, session_id) == 0) {
        return;  // unchanged
    }
    ESP_LOGI(TAG, "session changed: '%s' -> '%s'", current_session_id, session_id);
    strncpy(current_session_id, session_id, sizeof(current_session_id) - 1);
    current_session_id[sizeof(current_session_id) - 1] = '\0';
    if (ws_client) {
        websocket_request_reconnect();
    }
}

esp_err_t websocket_client_init(void) {
    parse_ws_uri();

    char uri[256];
    build_ws_uri(uri, sizeof(uri));

    esp_websocket_client_config_t cfg = {
        .uri = uri,
        .task_stack = 16384,
        .keep_alive_enable = false,
        .network_timeout_ms = 10000,
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

    ESP_LOGI(TAG, "connecting to %s ...", uri);
    return ESP_OK;
}

esp_err_t websocket_reconnect(void) {
    last_reconnect_ms = esp_timer_get_time() / 1000;
    ws_reconnect_pending = false;
    if (ws_client) {
        esp_websocket_client_stop(ws_client);
        ws_client = NULL;
    }
    ws_connected = false;
    vTaskDelay(pdMS_TO_TICKS(RECONNECT_DELAY_MS));

    char uri[256];
    build_ws_uri(uri, sizeof(uri));

    esp_websocket_client_config_t cfg = {
        .uri = uri,
        .task_stack = 16384,
        .keep_alive_enable = false,
        .network_timeout_ms = 10000,
        .disable_auto_reconnect = true,
    };

    ws_client = esp_websocket_client_init(&cfg);
    if (!ws_client) {
        ESP_LOGE(TAG, "websocket client re-init failed");
        return ESP_FAIL;
    }

    esp_err_t ret = esp_websocket_register_events(ws_client,
                     WEBSOCKET_EVENT_ANY, ws_event_handler, NULL);
    if (ret != ESP_OK) return ret;

    ret = esp_websocket_client_start(ws_client);
    if (ret != ESP_OK) return ret;

    ESP_LOGI(TAG, "reconnecting to %s ...", uri);
    return ESP_OK;
}

bool websocket_is_connected(void) {
    return ws_connected;
}

int64_t websocket_connected_since_ms(void) {
    return connected_since_ms;
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

    int ret = esp_websocket_client_send_text(ws_client, buf, len, pdMS_TO_TICKS(10000));
    if (ret > 0) {
        send_fail_count = 0;
    } else {
        ESP_LOGE(TAG, "send_text returned %d (fail_count=%d)",
                 ret, send_fail_count + 1);
        // ret == 0 means timeout (EAGAIN), don't count as hard failure
        if (ret < 0 && ws_connected && ++send_fail_count >= MAX_SEND_FAILURES) {
            ESP_LOGW(TAG, "too many send failures, disconnecting");
            ws_connected = false;
            ws_reconnect_pending = true;
        }
    }
    return ESP_OK;
}
