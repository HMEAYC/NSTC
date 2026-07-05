#include "session_config_nvs.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_http_client.h"
#include "nvs_flash.h"

static const char *TAG = "SessionNVS";

#define NVS_NAMESPACE "session_cfg"
#define NVS_KEY_SID   "session_id"

esp_err_t session_config_load(char *session_id, size_t max_len) {
    if (!session_id || max_len == 0) return ESP_ERR_INVALID_ARG;
    session_id[0] = '\0';

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        if (err == ESP_ERR_NVS_NOT_FOUND) {
            ESP_LOGW(TAG, "no session config in NVS");
        }
        return err;
    }

    size_t len = max_len;
    err = nvs_get_str(handle, NVS_KEY_SID, session_id, &len);
    nvs_close(handle);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "loaded session_id='%s' from NVS", session_id);
    }
    return err;
}

esp_err_t session_config_save(const char *session_id) {
    if (!session_id) return ESP_ERR_INVALID_ARG;

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    err = nvs_set_str(handle, NVS_KEY_SID, session_id);
    if (err != ESP_OK) {
        nvs_close(handle);
        return err;
    }

    err = nvs_commit(handle);
    nvs_close(handle);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "saved session_id='%s' to NVS", session_id);
    }
    return err;
}

esp_err_t session_config_fetch_remote(const char *base_url, const char *device_id) {
    if (!base_url) return ESP_ERR_INVALID_ARG;

    char url[512];
    snprintf(url, sizeof(url), "%s/session?device_id=%s", base_url, device_id);

    ESP_LOGI(TAG, "fetching session config from %s", url);

    esp_http_client_config_t cfg = {
        .url = url,
        .timeout_ms = 5000,
        .keep_alive_enable = false,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return ESP_FAIL;

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        return err;
    }

    int content_len = esp_http_client_fetch_headers(client);
    if (content_len <= 0 || content_len > 512) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return ESP_ERR_INVALID_SIZE;
    }

    char buf[512];
    int read_len = esp_http_client_read_response(client, buf, sizeof(buf) - 1);
    buf[read_len] = '\0';
    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    ESP_LOGI(TAG, "remote session config: %s", buf);

    // Parse JSON: {"session_id":"..."} or {"session_id":null}
    const char *key = "\"session_id\":\"";
    const char *val_start = strstr(buf, key);
    if (!val_start) {
        const char *null_key = "\"session_id\":null";
        if (strstr(buf, null_key)) {
            ESP_LOGI(TAG, "no session assigned (null)");
            return session_config_save("");
        }
        ESP_LOGW(TAG, "unexpected response format");
        return ESP_FAIL;
    }
    val_start += strlen(key);

    char remote[64];
    int i = 0;
    while (*val_start && *val_start != '"' && i < (int)sizeof(remote) - 1)
        remote[i++] = *val_start++;
    remote[i] = '\0';

    // Compare with current NVS
    char current[64] = "";
    session_config_load(current, sizeof(current));

    if (strcmp(current, remote) == 0) {
        ESP_LOGI(TAG, "session config unchanged, skipping");
        return ESP_OK;
    }

    ESP_LOGI(TAG, "new session config: session_id='%s'", remote);
    return session_config_save(remote);
}
