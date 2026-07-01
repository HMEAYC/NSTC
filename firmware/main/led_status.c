#include "led_status.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_check.h"

static const char *TAG = "LED";

// WS2812B timing (ESP32-C3 RMT)
#define RMT_TX_CHANNEL RMT_CHANNEL_0
#define LED_COUNT      1

static led_strip_handle_t led_strip = NULL;

esp_err_t led_status_init(void) {
    led_strip_config_t strip_cfg = {
        .strip_gpio_num = GPIO_NUM_8,
        .max_leds = LED_COUNT,
        .led_model = LED_MODEL_WS2812,
        .color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB,
    };
    led_strip_rmt_config_t rmt_cfg = {
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = 10 * 1000 * 1000,
        .flags.with_dma = false,
    };
    ESP_RETURN_ON_ERROR(led_strip_new_rmt_device(&strip_cfg, &rmt_cfg, &led_strip),
                        TAG, "LED strip init failed");
    ESP_LOGI(TAG, "WS2812 initialized on GPIO8");
    return ESP_OK;
}

esp_err_t led_status_set(uint8_t r, uint8_t g, uint8_t b) {
    if (!led_strip) return ESP_ERR_INVALID_STATE;
    ESP_RETURN_ON_ERROR(led_strip_set_pixel(led_strip, 0, r, g, b),
                        TAG, "set pixel failed");
    return led_strip_refresh(led_strip);
}

esp_err_t led_status_clear(void) {
    return led_status_set(0, 0, 0);
}
