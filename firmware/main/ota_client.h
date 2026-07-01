#pragma once

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define FIRMWARE_VERSION CONFIG_HMEAYC_FIRMWARE_VERSION

typedef struct {
    bool update_available;
    char latest_version[32];
    char download_url[256];
} ota_check_result_t;

esp_err_t ota_init(void);
void ota_mark_boot_successful(void);
esp_err_t ota_check_update(ota_check_result_t *result);
esp_err_t ota_perform_update(const char *url);

#ifdef __cplusplus
}
#endif
