#pragma once

#include "esp_err.h"
#include "imu_driver.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t websocket_client_init(void);
esp_err_t websocket_send_json(const imu_data_t *data);

#ifdef __cplusplus
}
#endif
