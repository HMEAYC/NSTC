#include "wifi_config_nvs.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_http_client.h"
#include "nvs_flash.h"

static const char *TAG = "WiFiNVS";

#define NVS_NAMESPACE "wifi_cfg"
#define NVS_KEY_SSID   "ssid"
#define NVS_KEY_PASS   "password"

esp_err_t wifi_config_load(wifi_creds_t *creds) {
    if (!creds) return ESP_ERR_INVALID_ARG;
    memset(creds, 0, sizeof(*creds));

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        if (err == ESP_ERR_NVS_NOT_FOUND) {
            ESP_LOGW(TAG, "no WiFi config in NVS");
        }
        return err;
    }

    size_t len = sizeof(creds->ssid);
    err = nvs_get_str(handle, NVS_KEY_SSID, creds->ssid, &len);
    if (err != ESP_OK) {
        nvs_close(handle);
        return err;
    }

    len = sizeof(creds->password);
    err = nvs_get_str(handle, NVS_KEY_PASS, creds->password, &len);
    nvs_close(handle);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "loaded WiFi config from NVS: SSID='%s'", creds->ssid);
    }
    return err;
}

esp_err_t wifi_config_save(const wifi_creds_t *creds) {
    if (!creds) return ESP_ERR_INVALID_ARG;

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    err = nvs_set_str(handle, NVS_KEY_SSID, creds->ssid);
    if (err != ESP_OK) {
        nvs_close(handle);
        return err;
    }

    err = nvs_set_str(handle, NVS_KEY_PASS, creds->password);
    if (err != ESP_OK) {
        nvs_close(handle);
        return err;
    }

    err = nvs_commit(handle);
    nvs_close(handle);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "saved WiFi config to NVS: SSID='%s'", creds->ssid);
    }
    return err;
}

esp_err_t wifi_config_fetch_remote(const char *base_url, const char *device_id) {
    if (!base_url) return ESP_ERR_INVALID_ARG;

    char url[512];
    if (device_id) {
        snprintf(url, sizeof(url), "%s/wifi?include_password=true&device_id=%s", base_url, device_id);
    } else {
        snprintf(url, sizeof(url), "%s/wifi?include_password=true", base_url);
    }

    ESP_LOGI(TAG, "fetching WiFi config from %s", url);

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

    ESP_LOGI(TAG, "remote WiFi config: %s", buf);

    // Parse JSON: {"ssid":"...","password":"..."} (password is optional for dashboard, present for firmware fetch)
    const char *ssid_key = "\"ssid\":\"";
    const char *ssid_start = strstr(buf, ssid_key);
    if (!ssid_start) {
        ESP_LOGW(TAG, "no ssid in response");
        return ESP_FAIL;
    }
    ssid_start += strlen(ssid_key);

    wifi_creds_t current;
    esp_err_t current_err = wifi_config_load(&current);

    const char *pass_key = "\"password\":\"";
    const char *pass_start = strstr(buf, pass_key);

    wifi_creds_t remote;
    memset(&remote, 0, sizeof(remote));

    int i = 0;
    while (*ssid_start && *ssid_start != '"' && i < (int)sizeof(remote.ssid) - 1)
        remote.ssid[i++] = *ssid_start++;

    if (pass_start) {
        pass_start += strlen(pass_key);
        i = 0;
        while (*pass_start && *pass_start != '"' && i < (int)sizeof(remote.password) - 1)
            remote.password[i++] = *pass_start++;
    } else if (current_err == ESP_OK) {
        strncpy(remote.password, current.password, sizeof(remote.password) - 1);
    }

    // Compare with current NVS

    if (current_err == ESP_OK &&
        strcmp(current.ssid, remote.ssid) == 0 &&
        strcmp(current.password, remote.password) == 0) {
        ESP_LOGI(TAG, "WiFi config unchanged, skipping");
        return ESP_OK;
    }

    ESP_LOGI(TAG, "new WiFi config from server: SSID='%s'", remote.ssid);
    err = wifi_config_save(&remote);
    if (err != ESP_OK) return err;

    ESP_LOGW(TAG, "WiFi config updated, rebooting in 3 seconds...");
    vTaskDelay(pdMS_TO_TICKS(3000));
    esp_restart();
    return ESP_OK;
}

esp_err_t wifi_config_clear(void) {
    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    err = nvs_erase_all(handle);
    if (err == ESP_OK) err = nvs_commit(handle);
    nvs_close(handle);

    ESP_LOGW(TAG, "WiFi config cleared from NVS");
    return err;
}
