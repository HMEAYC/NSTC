#include "ota_client.h"

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "esp_app_desc.h"
#include "esp_err.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "OTA";

#define OTA_VERSION_URL  CONFIG_HMEAYC_OTA_BASE_URL "/version"
#define OTA_DOWNLOAD_URL CONFIG_HMEAYC_OTA_BASE_URL "/download"
#define OTA_ACK_URL      CONFIG_HMEAYC_OTA_BASE_URL "/ack"
#define OTA_BUFSIZE      1024

esp_err_t ota_init(void) {
    ESP_LOGI(TAG, "OTA client initialized, version: %s", FIRMWARE_VERSION);
    return ESP_OK;
}

void ota_mark_boot_successful(void) {
    esp_ota_img_states_t state;
    const esp_partition_t *running = esp_ota_get_running_partition();
    if (running && esp_ota_get_state_partition(running, &state) == ESP_OK) {
        if (state == ESP_OTA_IMG_PENDING_VERIFY) {
            ESP_LOGI(TAG, "new firmware booted OK, marking valid");
            esp_ota_mark_app_valid_cancel_rollback();
        }
    }
}

static esp_err_t http_get_json(const char *url, char *buf, size_t buf_size) {
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
    if (content_len < 0 || (size_t)content_len >= buf_size) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return ESP_ERR_INVALID_SIZE;
    }

    int read_len = esp_http_client_read_response(client, buf, buf_size - 1);
    buf[read_len] = '\0';

    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return ESP_OK;
}

esp_err_t ota_check_update(ota_check_result_t *result) {
    if (!result) return ESP_ERR_INVALID_ARG;
    memset(result, 0, sizeof(*result));

    char url[512];
    snprintf(url, sizeof(url), "%s?current=%s", OTA_VERSION_URL, FIRMWARE_VERSION);

    char resp[512];
    esp_err_t err = http_get_json(url, resp, sizeof(resp));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "version check failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "version response: %s", resp);

    // Parse: {"update_available":true,"version":"0.2.0","url":"..."}
    result->update_available = strstr(resp, "\"update_available\":true") != NULL;
    if (result->update_available) {
        const char *v = strstr(resp, "\"version\":\"");
        if (v) {
            v += 10;
            int i = 0;
            while (*v && *v != '"' && i < (int)sizeof(result->latest_version) - 1)
                result->latest_version[i++] = *v++;
            result->latest_version[i] = '\0';
        }
        const char *u = strstr(resp, "\"url\":\"");
        if (u) {
            u += 6;
            int i = 0;
            while (*u && *u != '"' && i < (int)sizeof(result->download_url) - 1)
                result->download_url[i++] = *u++;
            result->download_url[i] = '\0';
        }
    }
    return ESP_OK;
}

esp_err_t ota_perform_update(const char *url) {
    ESP_LOGI(TAG, "starting OTA from %s", url);

    esp_http_client_config_t cfg = {
        .url = url,
        .timeout_ms = 30000,
        .keep_alive_enable = false,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return ESP_FAIL;

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        ESP_LOGE(TAG, "HTTP open failed: %s", esp_err_to_name(err));
        return err;
    }

    esp_http_client_fetch_headers(client);

    const esp_partition_t *update_partition = esp_ota_get_next_update_partition(NULL);
    if (!update_partition) {
        ESP_LOGE(TAG, "no OTA partition available");
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return ESP_ERR_NOT_SUPPORTED;
    }
    ESP_LOGI(TAG, "writing to partition %s at offset 0x%" PRIx32,
             update_partition->label, update_partition->address);

    esp_ota_handle_t ota_handle;
    err = esp_ota_begin(update_partition, OTA_SIZE_UNKNOWN, &ota_handle);
    if (err != ESP_OK) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        ESP_LOGE(TAG, "ota_begin failed: %s", esp_err_to_name(err));
        return err;
    }

    char buf[OTA_BUFSIZE];
    int total = 0;
    while (1) {
        int read_len = esp_http_client_read(client, buf, OTA_BUFSIZE);
        if (read_len < 0) {
            ESP_LOGE(TAG, "HTTP read error");
            esp_ota_abort(ota_handle);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return ESP_FAIL;
        }
        if (read_len == 0) break;

        err = esp_ota_write(ota_handle, buf, read_len);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "ota_write failed: %s", esp_err_to_name(err));
            esp_ota_abort(ota_handle);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return err;
        }
        total += read_len;
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    err = esp_ota_end(ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ota_end failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_ota_set_boot_partition(update_partition);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "set_boot_partition failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "OTA success! %d bytes written to %s, rebooting...", total, update_partition->label);
    vTaskDelay(pdMS_TO_TICKS(1000));
    esp_restart();
    return ESP_OK;
}
