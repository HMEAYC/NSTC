#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *device_id;
    const char *name;
    const char *firmware_version;
    const char *wifi_ssid;
    int wifi_rssi;
    const char *ip_address;
} device_registry_info_t;

esp_err_t device_registry_upsert(
    const char *base_url,
    const device_registry_info_t *info
);

esp_err_t device_registry_heartbeat(
    const char *base_url,
    const char *device_id
);

#ifdef __cplusplus
}
#endif
