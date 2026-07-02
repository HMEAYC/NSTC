#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t device_registry_upsert(
    const char *base_url,
    const char *device_id,
    const char *firmware_version
);

#ifdef __cplusplus
}
#endif
