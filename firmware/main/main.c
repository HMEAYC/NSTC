#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/i2c.h"
#include "imu_driver.h"
#include "websocket_client.h"
#include "wifi_manager.h"
#include "battery.h"
#include "led_status.h"
#include "ota_client.h"

static const char *TAG = "HMEAYC";

#define I2C_PORT  I2C_NUM_0
#define PIN_SDA   GPIO_NUM_6
#define PIN_SCL   GPIO_NUM_7

#define SAMPLE_RATE_HZ      CONFIG_HMEAYC_SAMPLE_RATE_HZ
#define RECONNECT_INTERVAL  (SAMPLE_RATE_HZ * 3)
#define OTA_CHECK_INTERVAL  (SAMPLE_RATE_HZ * 3600)  // check once per hour
#define LED_CYCLE_COUNT     (SAMPLE_RATE_HZ * 2)     // LED blink every 2 seconds

void app_main(void) {
    ESP_LOGI(TAG, "HMEAYC firmware v%s starting (ESP32-C3 + MPU6500)...",
             FIRMWARE_VERSION);

    led_status_init();
    led_status_set(LED_MAGENTA);  // booting

    ota_init();
    ota_mark_boot_successful();
    led_status_set(LED_YELLOW);

    imu_config_t imu_cfg = {
        .i2c_port = I2C_PORT,
        .sda_pin  = PIN_SDA,
        .scl_pin  = PIN_SCL,
        .i2c_addr = MPU6050_I2C_ADDR_DEFAULT,
    };
    if (imu_init(&imu_cfg) != ESP_OK) {
        ESP_LOGE(TAG, "IMU init failed, rebooting in 5 s...");
        led_status_set(LED_RED);
        vTaskDelay(pdMS_TO_TICKS(5000));
        esp_restart();
    }

    battery_init();

    ESP_LOGI(TAG, "connecting WiFi...");
    wifi_connect();
    websocket_client_init();

    imu_data_t data;
    TickType_t delay = pdMS_TO_TICKS(1000 / SAMPLE_RATE_HZ);
    uint32_t tick = 0;

    led_status_set(LED_CYAN);
    vTaskDelay(pdMS_TO_TICKS(100));
    led_status_clear();

    while (1) {
        if (imu_read(&data) == ESP_OK) {
            if (websocket_is_connected()) {
                websocket_send_json(&data);
            } else if (tick % RECONNECT_INTERVAL == 0) {
                ESP_LOGW(TAG, "WS disconnected, reconnecting...");
                websocket_reconnect();
            }
        }

        // OTA check once per hour
        if (tick % OTA_CHECK_INTERVAL == 0 && tick > 0) {
            ota_check_result_t ota_result;
            if (ota_check_update(&ota_result) == ESP_OK && ota_result.update_available) {
                ESP_LOGI(TAG, "OTA update available: v%s", ota_result.latest_version);
                led_status_set(LED_YELLOW);
                ota_perform_update(ota_result.download_url);
            }
        }

        if (tick % LED_CYCLE_COUNT == 0) {
            if (websocket_is_connected()) {
                led_status_set(LED_GREEN);
            } else {
                led_status_set(LED_BLUE);
            }
        } else if (tick % (LED_CYCLE_COUNT / 2) == 0) {
            led_status_clear();
        }

        tick++;
        vTaskDelay(delay);
    }
}
