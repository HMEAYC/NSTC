#include "device_registry.h"

#include <stdio.h>
#include <string.h>

#include "esp_http_client.h"
#include "esp_log.h"
#include "ca_cert.h"
#include "wifi_config_nvs.h"

static const char *TAG = "DeviceRegistry";

typedef struct {
    char *data;
    int len;
    int capacity;
} response_buf_t;

static esp_err_t _client_event_handler(esp_http_client_event_t *evt) {
    if (evt->event_id == HTTP_EVENT_ON_DATA && evt->data_len > 0) {
        response_buf_t *buf = (response_buf_t *)evt->user_data;
        if (buf && buf->len + evt->data_len < buf->capacity) {
            memcpy(buf->data + buf->len, evt->data, evt->data_len);
            buf->len += evt->data_len;
            buf->data[buf->len] = '\0';
        }
    }
    return ESP_OK;
}

void device_auth_set_header(esp_http_client_handle_t client) {
    static char token[512];
    if (device_token_load(token, sizeof(token)) == ESP_OK && token[0] != '\0') {
        static char auth[580];
        snprintf(auth, sizeof(auth), "Bearer %s", token);
        esp_http_client_set_header(client, "Authorization", auth);
    } else {
        esp_http_client_set_header(client, "X-API-Key", CONFIG_HMEAYC_API_KEY);
    }
}

static esp_err_t _parse_device_token(const char *json, char *token, size_t token_len) {
    const char *key = "\"device_token\":\"";
    const char *start = strstr(json, key);
    if (!start) return ESP_ERR_NOT_FOUND;
    start += strlen(key);
    int i = 0;
    while (*start && *start != '"' && i < (int)token_len - 1)
        token[i++] = *start++;
    token[i] = '\0';
    return ESP_OK;
}

static void _try_save_token(const char *resp) {
    char token[512];
    if (_parse_device_token(resp, token, sizeof(token)) == ESP_OK && token[0] != '\0') {
        device_token_save(token);
        ESP_LOGI(TAG, "device JWT saved to NVS (len=%d)", (int)strlen(token));
    }
}

esp_err_t device_registry_upsert(
    const char *base_url,
    const device_registry_info_t *info
) {
    if (!base_url || !info || !info->device_id) {
        return ESP_ERR_INVALID_ARG;
    }

    char url[256];
    int url_len = snprintf(url, sizeof(url), "%s/api/devices", base_url);
    if (url_len < 0 || url_len >= (int)sizeof(url)) {
        return ESP_ERR_INVALID_SIZE;
    }

    char body[512];
    int body_len = snprintf(
        body,
        sizeof(body),
        "{"
        "\"device_id\":\"%s\","
        "\"name\":\"%s\","
        "\"firmware_version\":\"%s\","
        "\"wifi_ssid\":\"%s\","
        "\"wifi_rssi\":%d,"
        "\"ip_address\":\"%s\","
        "\"mac_address\":\"%s\""
        "}",
        info->device_id,
        info->name ? info->name : info->device_id,
        info->firmware_version ? info->firmware_version : "",
        info->wifi_ssid ? info->wifi_ssid : "",
        info->wifi_rssi,
        info->ip_address ? info->ip_address : "",
        info->mac_address ? info->mac_address : ""
    );
    if (body_len < 0 || body_len >= (int)sizeof(body)) {
        return ESP_ERR_INVALID_SIZE;
    }

    ESP_LOGI(TAG, "registering device via %s", url);

    static char resp_buf[2048];
    response_buf_t resp = { .data = resp_buf, .len = 0, .capacity = sizeof(resp_buf) };
    resp_buf[0] = '\0';

    esp_http_client_config_t cfg = {
        .url = url,
        .timeout_ms = 5000,
        .keep_alive_enable = false,
        .cert_pem = isrg_root_x1_pem,
        .event_handler = _client_event_handler,
        .user_data = &resp,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        return ESP_FAIL;
    }

    esp_http_client_set_method(client, HTTP_METHOD_POST);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-API-Key", CONFIG_HMEAYC_API_KEY);
    esp_http_client_set_post_field(client, body, body_len);

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "device registration failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (status != 200 && status != 201) {
        ESP_LOGW(TAG, "device registration returned HTTP %d", status);
        return ESP_FAIL;
    }

    if (resp.len > 0) {
        _try_save_token(resp_buf);
    }

    ESP_LOGI(TAG, "device registration succeeded for %s", info->device_id);
    return ESP_OK;
}

esp_err_t device_registry_heartbeat(
    const char *base_url,
    const char *device_id
) {
    if (!base_url || !device_id) return ESP_ERR_INVALID_ARG;

    char url[256];
    snprintf(url, sizeof(url), "%s/api/devices", base_url);

    char body[256];
    snprintf(body, sizeof(body), "{\"device_id\":\"%s\"}", device_id);

    static char hb_resp_buf[2048];
    response_buf_t resp = { .data = hb_resp_buf, .len = 0, .capacity = sizeof(hb_resp_buf) };
    hb_resp_buf[0] = '\0';

    esp_http_client_config_t cfg = {
        .url = url,
        .timeout_ms = 3000,
        .keep_alive_enable = false,
        .cert_pem = isrg_root_x1_pem,
        .event_handler = _client_event_handler,
        .user_data = &resp,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return ESP_FAIL;

    esp_http_client_set_method(client, HTTP_METHOD_POST);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    device_auth_set_header(client);
    esp_http_client_set_post_field(client, body, strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);

    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        return ESP_FAIL;
    }

    if (status == 401) {
        ESP_LOGW(TAG, "device token rejected (401), clearing JWT for re-registration");
        device_token_clear();
        esp_http_client_cleanup(client);
        return ESP_FAIL;
    }

    esp_http_client_cleanup(client);

    if (status != 200 && status != 201) {
        return ESP_FAIL;
    }

    if (resp.len > 0) {
        _try_save_token(hb_resp_buf);
    }

    return ESP_OK;
}
