#include <stdio.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "imu_driver.h"
#include "websocket_client.h"
#include "wifi_manager.h"

static const char *TAG = "HMEAYC";

// I2C pins for ESP32-C3
#define I2C_PORT  I2C_NUM_0
#define PIN_SDA   GPIO_NUM_6
#define PIN_SCL   GPIO_NUM_7

#define SAMPLE_RATE_HZ  50

void app_main(void) {
    ESP_LOGI(TAG, "HMEAYC firmware starting (ESP32-C3 + MPU6050)...");

    // ---------- IMU ----------
    imu_config_t imu_cfg = {
        .i2c_port = I2C_PORT,
        .sda_pin  = PIN_SDA,
        .scl_pin  = PIN_SCL,
        .i2c_addr = MPU6050_I2C_ADDR_DEFAULT,
    };
    if (imu_init(&imu_cfg) != ESP_OK) {
        ESP_LOGE(TAG, "IMU init failed, rebooting in 5 s...");
        vTaskDelay(pdMS_TO_TICKS(5000));
        esp_restart();
    }

    // ---------- WiFi ----------
    wifi_connect();

    // ---------- WebSocket ----------
    websocket_client_init();

    // ---------- main loop ----------
    imu_data_t data;
    TickType_t delay = pdMS_TO_TICKS(1000 / SAMPLE_RATE_HZ);

    while (1) {
        if (imu_read(&data) == ESP_OK) {
            websocket_send_json(&data);
        }
        vTaskDelay(delay);
    }
}
