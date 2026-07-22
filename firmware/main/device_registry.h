#pragma once

#include "esp_err.h"
#include "esp_http_client.h"

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
    const char *mac_address;
} device_registry_info_t;

esp_err_t device_registry_upsert(
    const char *base_url,
    const device_registry_info_t *info
);

esp_err_t device_registry_heartbeat(
    const char *base_url,
    const char *device_id
);

void device_auth_set_header(esp_http_client_handle_t client);

#ifdef __cplusplus
}
#endif
