#include "device_registry.h"

#include <stdio.h>
#include <string.h>

#include "esp_http_client.h"
#include "esp_log.h"

static const char *TAG = "DeviceRegistry";

esp_err_t device_registry_upsert(
    const char *base_url,
    const device_registry_info_t *info
) {
    if (!base_url || !info || !info->device_id) {
        return ESP_ERR_INVALID_ARG;
    }

    char url[256];
    int url_len = snprintf(url, sizeof(url), "%s/devices", base_url);
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
        "\"ip_address\":\"%s\""
        "}",
        info->device_id,
        info->name ? info->name : info->device_id,
        info->firmware_version ? info->firmware_version : "",
        info->wifi_ssid ? info->wifi_ssid : "",
        info->wifi_rssi,
        info->ip_address ? info->ip_address : ""
    );
    if (body_len < 0 || body_len >= (int)sizeof(body)) {
        return ESP_ERR_INVALID_SIZE;
    }

    ESP_LOGI(TAG, "registering device via %s", url);

    esp_http_client_config_t cfg = {
        .url = url,
        .timeout_ms = 5000,
        .keep_alive_enable = false,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        return ESP_FAIL;
    }

    esp_http_client_set_method(client, HTTP_METHOD_POST);
    esp_http_client_set_header(client, "Content-Type", "application/json");
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

    ESP_LOGI(TAG, "device registration succeeded for %s", info->device_id);
    return ESP_OK;
}
