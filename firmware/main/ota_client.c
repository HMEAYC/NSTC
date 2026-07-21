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
#include "mbedtls/sha256.h"
#include "mbedtls/platform_util.h"
#include "wifi_config_nvs.h"
#include "ca_cert.h"

static const char *TAG = "OTA";

#define OTA_BUFSIZE      1024

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
    if (read_len < 0) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return ESP_FAIL;
    }
    buf[read_len] = '\0';

    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return ESP_OK;
}

esp_err_t ota_check_update(ota_check_result_t *result) {
    if (!result) return ESP_ERR_INVALID_ARG;
    memset(result, 0, sizeof(*result));

    // Get OTA base URL: NVS first, then Kconfig
    char base_url[256] = {0};
    esp_err_t nvs_err = wifi_ota_url_load(base_url, sizeof(base_url));
    if (nvs_err != ESP_OK || strlen(base_url) == 0) {
        // Fallback to Kconfig
        strncpy(base_url, CONFIG_HMEAYC_OTA_BASE_URL, sizeof(base_url) - 1);
        ESP_LOGI(TAG, "using Kconfig OTA URL: %s", base_url);
    } else {
        ESP_LOGI(TAG, "using NVS OTA URL: %s", base_url);
    }

    // Build version check URL
    char version_url[512];
    snprintf(version_url, sizeof(version_url), "%s/version.json", base_url);

    char resp[512];
    esp_err_t err = http_get_json(version_url, resp, sizeof(resp));
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

    // Parse optional sha256 field
    const char *h = strstr(resp, "\"sha256\":\"");
    if (h) {
        h += 10;
        i = 0;
        while (*h && *h != '"' && i < (int)sizeof(result->sha256) - 1)
            result->sha256[i++] = *h++;
        result->sha256[i] = '\0';
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

esp_err_t ota_perform_update(const char *url, const char *expected_sha256) {
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

    // Compute SHA-256 during download if expected hash is provided
    mbedtls_sha256_context sha256_ctx;
    bool sha256_active = (expected_sha256 && expected_sha256[0] != '\0');
    if (sha256_active) {
        mbedtls_sha256_init(&sha256_ctx);
        mbedtls_sha256_starts(&sha256_ctx, 0);
    }

    char buf[OTA_BUFSIZE];
    int total = 0;
    while (1) {
        int read_len = esp_http_client_read(client, buf, OTA_BUFSIZE);
        if (read_len < 0) {
            ESP_LOGE(TAG, "HTTP read error");
            esp_ota_abort(ota_handle);
            if (sha256_active) mbedtls_sha256_free(&sha256_ctx);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return ESP_FAIL;
        }
        if (read_len == 0) break;

        err = esp_ota_write(ota_handle, buf, read_len);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "ota_write failed: %s", esp_err_to_name(err));
            esp_ota_abort(ota_handle);
            if (sha256_active) mbedtls_sha256_free(&sha256_ctx);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return err;
        }
        if (sha256_active) {
            mbedtls_sha256_update(&sha256_ctx, (const unsigned char *)buf, read_len);
        }
        total += read_len;
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    // Verify SHA-256 hash if expected was provided
    if (sha256_active) {
        unsigned char digest[32];
        mbedtls_sha256_finish(&sha256_ctx, digest);
        mbedtls_sha256_free(&sha256_ctx);

        // Convert to hex string
        char computed_hex[65];
        for (int i = 0; i < 32; i++) {
            snprintf(computed_hex + i * 2, 3, "%02x", digest[i]);
        }
        computed_hex[64] = '\0';

        if (strcmp(computed_hex, expected_sha256) != 0) {
            ESP_LOGE(TAG, "SHA-256 mismatch: expected %s, got %s", expected_sha256, computed_hex);
            esp_ota_abort(ota_handle);
            return ESP_ERR_INVALID_CRC;
        }
        ESP_LOGI(TAG, "SHA-256 verification passed");
    }

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
