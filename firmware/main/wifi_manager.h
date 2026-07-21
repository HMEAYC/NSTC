#pragma once

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t wifi_connect(void);
bool wifi_is_connected(void);
const char *wifi_get_ssid(void);
const char *wifi_get_ip(void);
int wifi_get_rssi(void);
const char *wifi_get_mac(void);
void wifi_periodic_retry(void);

#ifdef __cplusplus
}
#endif
