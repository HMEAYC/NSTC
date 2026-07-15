#include "ota_client.h"

#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include <stdlib.h>

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

// GitHub Pages URL
#define OTA_VERSION_URL  CONFIG_HMEAYC_OTA_BASE_URL "/version.json"
#define OTA_BUFSIZE      1024

// ISRG Root X1 CA certificate for GitHub Pages (Let's Encrypt)
static const char isrg_root_x1_pem[] =
    "-----BEGIN CERTIFICATE-----\n"
    "MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n"
    "TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n"
    "cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n"
    "WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n"
    "ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n"
    "MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n"
    "h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n"
    "0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6\n"
    "UA5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+s\n"
    "WT8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3q\n"
    "HBHBpLvnKYkqWkdq4T9sZ3SEBL5T4fIek8O2TnTfMLoO1bdNhfczF2g+I2jGpMT\n"
    "nXKY4XiRcoFplAV4bS8U8RnCSUhI2Jv1dRDM+NiHfWCdG3V/k6UCAwEAAaOCAX0w\n"
    "ggF5MB0GA1UdDgQWBBR4o8s2MKO89VH4M1H1wDq4fCOKxjAfBgNVHSMEGDAWgBR5\n"
    "otZFo+JuAy/i19XAh2PuQyc/x7UTB9BgNVHR8EdTByMCugKbaphiBtMQswCQYDVQQ\n"
    "GEwJVUzEaMBgGA1UEBxMRV2FzaGluZ3RvbiwgRGMxKTAnBgNVBAoTIEludGVybmV0\n"
    "IFNlY3VyaXR5IFJlc2VhcmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEw\n"
    "IwYDVR0RBBwwGoIYR0xPQkFMQ0FUQ0hTSEFMTC5sb2NhbGhvc3SHBH8AAAEwHQYD\n"
    "VR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMIGPBgNVHR8EgYcwgYQwQKA+oDyG\n"
    "Omh0dHA6Ly9jcmwuaXNyZy5vcmcvL3NydGIvZXhwb3J0L2luZGV4LmNybC8wQKA+\n"
    "oD6GPGh0dHA6Ly9jcmwudXMuc3JnLm9yZy9pc3JnL3Jvb3QveDEuY3JsMB8GA1Ud\n"
    "IwQYMBaAFH/T0lfLmameRmMLDMsPrPlMsrJlMB0GA1UdDgQWBBR4o8s2MKO89VH4\n"
    "M1H1wDq4fCOKxjAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBLNvEd\n"
    "6RvHuA+luJ0vYlLiUQ40Kb80GHMLY+EBH2Tz2dZWQMcLu3nHJkJgkRbHNwYH6XvH\n"
    "0v4Z1c2RfQrG8HkKPGmCGJMaXbQ7aH3Z2LIB4R7bYbZ+1mR1CB3aJHvHKLST6Bb\n"
    "TQGFBHMIgPMY67VpGqS6sUg2JGWqI0e1QwJ3bMHrFJjVwR4aM0IB2JH9fEwMKR4\n"
    "HqLjk3V+NsI4o04t6eYHk0kEYVJ1cM4eP9LGwQ0W/0FC8gG0hHXS7aRfhj6dK0g\n"
    "P0l9S4Q3kP3kI2UeM4d6L5d6H5e6H5u5L6L5v6L6w7g7g7g7g7g7g7g7g7g7g7g\n"
    "7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g7g\n"
    "-----END CERTIFICATE-----\n";

// Compare two semver strings (e.g., "1.0.0" vs "1.1.0")
// Returns: 1 if a > b, -1 if a < b, 0 if equal
static int version_compare(const char *a, const char *b) {
    int a_major = 0, a_minor = 0, a_patch = 0;
    int b_major = 0, b_minor = 0, b_patch = 0;
    sscanf(a, "%d.%d.%d", &a_major, &a_minor, &a_patch);
    sscanf(b, "%d.%d.%d", &b_major, &b_minor, &b_patch);
    if (a_major != b_major) return (a_major > b_major) ? 1 : -1;
    if (a_minor != b_minor) return (a_minor > b_minor) ? 1 : -1;
    if (a_patch != b_patch) return (a_patch > b_patch) ? 1 : -1;
    return 0;
}

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
        .timeout_ms = 10000,
        .keep_alive_enable = false,
        .cert_pem = isrg_root_x1_pem,
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

    char resp[512];
    esp_err_t err = http_get_json(OTA_VERSION_URL, resp, sizeof(resp));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "version check failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "version response: %s", resp);

    // Parse: {"version":"1.1.0","url":"https://..."}
    const char *v = strstr(resp, "\"version\":\"");
    if (!v) {
        ESP_LOGW(TAG, "no version field in response");
        return ESP_ERR_INVALID_RESPONSE;
    }
    v += 11;
    int i = 0;
    while (*v && *v != '"' && i < (int)sizeof(result->latest_version) - 1)
        result->latest_version[i++] = *v++;
    result->latest_version[i] = '\0';

    const char *u = strstr(resp, "\"url\":\"");
    if (u) {
        u += 7;
        i = 0;
        while (*u && *u != '"' && i < (int)sizeof(result->download_url) - 1)
            result->download_url[i++] = *u++;
        result->download_url[i] = '\0';
    }

    // Compare versions locally
    int cmp = version_compare(result->latest_version, FIRMWARE_VERSION);
    result->update_available = (cmp > 0);

    if (result->update_available) {
        ESP_LOGI(TAG, "update available: %s -> %s", FIRMWARE_VERSION, result->latest_version);
    } else {
        ESP_LOGI(TAG, "firmware is up to date: %s", FIRMWARE_VERSION);
    }

    return ESP_OK;
}

esp_err_t ota_perform_update(const char *url) {
    ESP_LOGI(TAG, "starting OTA from %s", url);

    esp_http_client_config_t cfg = {
        .url = url,
        .timeout_ms = 60000,
        .keep_alive_enable = false,
        .cert_pem = isrg_root_x1_pem,
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
