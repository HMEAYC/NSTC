#pragma once

#include "esp_err.h"
#include "led_strip.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t led_status_init(void);
esp_err_t led_status_set(uint8_t r, uint8_t g, uint8_t b);
esp_err_t led_status_clear(void);

// Convenience colors
#define LED_RED     255, 0, 0
#define LED_GREEN   0, 255, 0
#define LED_BLUE    0, 0, 255
#define LED_YELLOW  255, 255, 0
#define LED_CYAN    0, 255, 255
#define LED_MAGENTA 255, 0, 255
#define LED_WHITE   255, 255, 255

#ifdef __cplusplus
}
#endif
