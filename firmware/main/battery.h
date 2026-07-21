#pragma once

#include "esp_err.h"
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t battery_init(void);
esp_err_t battery_read_mv(uint32_t *voltage_mv);
uint8_t battery_level_percent(uint32_t voltage_mv);
bool battery_is_low(uint32_t voltage_mv);
bool battery_is_usb_powered(uint32_t voltage_mv);

#ifdef __cplusplus
}
#endif
