#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char ssid[64];
    char password[64];
} wifi_creds_t;

esp_err_t wifi_config_load(wifi_creds_t *creds);
esp_err_t wifi_config_save(const wifi_creds_t *creds);
esp_err_t wifi_config_fetch_remote(const char *base_url, const char *device_id);
esp_err_t wifi_config_clear(void);

#ifdef __cplusplus
}
#endif
