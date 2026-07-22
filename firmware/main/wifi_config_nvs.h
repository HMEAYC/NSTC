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

esp_err_t wifi_ota_url_load(char *url, size_t url_size);
esp_err_t wifi_ota_url_save(const char *url);
esp_err_t wifi_ota_url_clear(void);

esp_err_t wifi_api_url_load(char *url, size_t url_size);
esp_err_t wifi_api_url_save(const char *url);

esp_err_t wifi_ws_uri_load(char *uri, size_t uri_size);
esp_err_t wifi_ws_uri_save(const char *uri);

esp_err_t device_token_load(char *token, size_t max_len);
esp_err_t device_token_save(const char *token);
esp_err_t device_token_clear(void);

#ifdef __cplusplus
}
#endif
