#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t session_config_load(char *session_id, size_t max_len);
esp_err_t session_config_save(const char *session_id);
esp_err_t session_config_fetch_remote(const char *base_url, const char *device_id);

#ifdef __cplusplus
}
#endif
