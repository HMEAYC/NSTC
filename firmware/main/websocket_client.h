#pragma once

#include "esp_err.h"
#include "imu_driver.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t websocket_client_init(void);
void websocket_parse_base_uri(void);
void websocket_set_base_uri(const char *api_url);
esp_err_t websocket_reconnect(void);
bool websocket_is_connected(void);
int64_t websocket_connected_since_ms(void);
esp_err_t websocket_send_json(const imu_data_t *data);
void websocket_request_reconnect(void);
bool websocket_reconnect_pending(void);
bool websocket_should_reconnect(void);
void websocket_set_session_id(const char *session_id);

#ifdef __cplusplus
}
#endif
