#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/i2c.h"
#include "imu_driver.h"
#include "device_registry.h"
#include "websocket_client.h"
#include "wifi_manager.h"
#include "wifi_config_nvs.h"
#include "session_config_nvs.h"
#include "battery.h"
#include "led_status.h"
#include "ota_client.h"

static const char *TAG = "HMEAYC";

#define I2C_PORT  I2C_NUM_0
#define PIN_SDA   GPIO_NUM_6
#define PIN_SCL   GPIO_NUM_7

#define SAMPLE_RATE_HZ      CONFIG_HMEAYC_SAMPLE_RATE_HZ
#define OTA_CHECK_INTERVAL  (SAMPLE_RATE_HZ * 3600)  // check once per hour
#define DEVICE_REGISTER_INTERVAL (SAMPLE_RATE_HZ * 1800) // register every 30 min
#define WIFI_CONFIG_INTERVAL (SAMPLE_RATE_HZ * 1800) // check WiFi config every 30 min
#define SESSION_CONFIG_INTERVAL (SAMPLE_RATE_HZ * 1800) // check session config every 30 min
#define LED_CYCLE_COUNT     (SAMPLE_RATE_HZ * 2)     // LED blink every 2 seconds

#define API_BASE_URL    CONFIG_HMEAYC_API_BASE_URL
#define CONFIG_BASE_URL API_BASE_URL "/config"

void app_main(void) {
    ESP_LOGI(TAG, "HMEAYC firmware v%s starting (ESP32-C3 + MPU6500)...",
             CONFIG_HMEAYC_FIRMWARE_VERSION);

    led_status_init();
    led_status_set(LED_MAGENTA);  // booting

    ota_init();
    ota_mark_boot_successful();
    led_status_set(LED_YELLOW);

    imu_config_t imu_cfg = {
        .i2c_port = I2C_PORT,
        .sda_pin  = PIN_SDA,
        .scl_pin  = PIN_SCL,
        .i2c_addr = MPU6500_I2C_ADDR_DEFAULT,
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
    if (wifi_is_connected()) {
        device_registry_info_t reg_info = {
            .device_id = CONFIG_HMEAYC_DEVICE_ID,
            .name = CONFIG_HMEAYC_DEVICE_ID,
            .firmware_version = CONFIG_HMEAYC_FIRMWARE_VERSION,
            .wifi_ssid = wifi_get_ssid(),
            .wifi_rssi = wifi_get_rssi(),
            .ip_address = wifi_get_ip(),
        };
        device_registry_upsert(API_BASE_URL, &reg_info);
        ota_send_ack(API_BASE_URL, CONFIG_HMEAYC_DEVICE_ID);
        // Pre-initialize WebSocket URI base (so set_session_id can set the path)
        websocket_parse_base_uri();
        session_config_fetch_remote(CONFIG_BASE_URL, CONFIG_HMEAYC_DEVICE_ID);
        char session_id[64] = "";
        if (session_config_load(session_id, sizeof(session_id)) == ESP_OK && session_id[0] != '\0') {
            websocket_set_session_id(session_id);
        }
    }

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
                int64_t age_ms = esp_timer_get_time() / 1000 - websocket_connected_since_ms();
                if (age_ms > 200) {
                    websocket_send_json(&data);
                }
            } else if (websocket_should_reconnect()) {
                ESP_LOGW(TAG, "WS reconnecting...");
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

        // Remote WiFi config check every 30 min
        if (tick % WIFI_CONFIG_INTERVAL == 0 && tick > 0 && wifi_is_connected()) {
            ESP_LOGI(TAG, "checking remote WiFi config...");
            wifi_config_fetch_remote(CONFIG_BASE_URL, CONFIG_HMEAYC_DEVICE_ID);
        }

        // Remote session config check every 30 min
        if (tick % SESSION_CONFIG_INTERVAL == 0 && tick > 0 && wifi_is_connected()) {
            ESP_LOGI(TAG, "checking remote session config...");
            char old_sid[64] = "";
            session_config_load(old_sid, sizeof(old_sid));

            session_config_fetch_remote(CONFIG_BASE_URL, CONFIG_HMEAYC_DEVICE_ID);

            char new_sid[64] = "";
            if (session_config_load(new_sid, sizeof(new_sid)) == ESP_OK) {
                websocket_set_session_id(new_sid);
            }
        }

        if (tick % DEVICE_REGISTER_INTERVAL == 0 && tick > 0 && wifi_is_connected()) {
            ESP_LOGI(TAG, "refreshing device registration...");
            device_registry_info_t reg_info = {
                .device_id = CONFIG_HMEAYC_DEVICE_ID,
                .name = CONFIG_HMEAYC_DEVICE_ID,
                .firmware_version = CONFIG_HMEAYC_FIRMWARE_VERSION,
                .wifi_ssid = wifi_get_ssid(),
                .wifi_rssi = wifi_get_rssi(),
                .ip_address = wifi_get_ip(),
            };
            device_registry_upsert(API_BASE_URL, &reg_info);
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

        // diagnostic status every 10s
        if (tick % (SAMPLE_RATE_HZ * 10) == 0) {
            ESP_LOGI(TAG, "tick=%lu wifi=%d ws=%d reconnect_pending=%d",
                     (unsigned long)tick,
                     wifi_is_connected(), websocket_is_connected(),
                     websocket_reconnect_pending());
        }

        tick++;
        vTaskDelay(delay);
    }
}
