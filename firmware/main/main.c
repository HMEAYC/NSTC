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
#include "ota_client.h"
#include "softap_portal.h"

static const char *TAG = "HMEAYC";

#define I2C_PORT  I2C_NUM_0
#define PIN_SDA   CONFIG_HMEAYC_I2C_SDA_PIN
#define PIN_SCL   CONFIG_HMEAYC_I2C_SCL_PIN

#define SAMPLE_RATE_HZ      CONFIG_HMEAYC_SAMPLE_RATE_HZ
#define OTA_CHECK_INTERVAL  (SAMPLE_RATE_HZ * 86400) // check once per 24 hours
#define DEVICE_REGISTER_INTERVAL (SAMPLE_RATE_HZ * 1800) // register every 30 min
#define HEARTBEAT_INTERVAL  (SAMPLE_RATE_HZ * 120) // heartbeat every 2 min
#define WIFI_CONFIG_INTERVAL (SAMPLE_RATE_HZ * 1800) // check WiFi config every 30 min
#define SESSION_CONFIG_INTERVAL (SAMPLE_RATE_HZ * 1800) // check session config every 30 min

#define IMU_MAX_FAIL 10

static char api_base_url[256] = {0};
static char ws_uri[256] = {0};

void app_main(void) {
    ESP_LOGI(TAG, "HMEAYC firmware v%s starting (ESP32-C3 + MPU6500)...",
             CONFIG_HMEAYC_FIRMWARE_VERSION);

    ota_init();
    ota_mark_boot_successful();

    // Load URLs from NVS, fallback to Kconfig
    if (wifi_api_url_load(api_base_url, sizeof(api_base_url)) != ESP_OK || api_base_url[0] == '\0') {
        strncpy(api_base_url, CONFIG_HMEAYC_API_BASE_URL, sizeof(api_base_url) - 1);
    }
    if (wifi_ws_uri_load(ws_uri, sizeof(ws_uri)) != ESP_OK || ws_uri[0] == '\0') {
        strncpy(ws_uri, CONFIG_HMEAYC_WS_URI, sizeof(ws_uri) - 1);
    }
    ESP_LOGI(TAG, "API URL: %s", api_base_url);
    ESP_LOGI(TAG, "WS URI: %s", ws_uri);

    imu_config_t imu_cfg = {
        .i2c_port = I2C_PORT,
        .sda_pin  = PIN_SDA,
        .scl_pin  = PIN_SCL,
        .i2c_addr = MPU6500_I2C_ADDR_DEFAULT,
    };
    bool imu_ok = (imu_init(&imu_cfg) == ESP_OK);
    if (!imu_ok) {
        ESP_LOGW(TAG, "IMU init failed (skipping)");
    }

    battery_init();

    ESP_LOGI(TAG, "connecting WiFi...");
    wifi_connect();

    // If SoftAP portal is running, wait for user to configure WiFi
    if (softap_portal_is_running()) {
        ESP_LOGI(TAG, "SoftAP portal running, connect to 'HMEAYC-Setup' to configure WiFi");
        while (softap_portal_is_running()) {
            vTaskDelay(pdMS_TO_TICKS(1000));
        }
        // SoftAP completed (user saved WiFi), device already rebooted
    }

    if (wifi_is_connected()) {
        if (api_base_url[0] != '\0') {
            device_registry_info_t reg_info = {
                .device_id = wifi_get_mac(),
                .name = wifi_get_mac(),
                .firmware_version = CONFIG_HMEAYC_FIRMWARE_VERSION,
                .wifi_ssid = wifi_get_ssid(),
                .wifi_rssi = wifi_get_rssi(),
                .ip_address = wifi_get_ip(),
            };
            device_registry_upsert(api_base_url, &reg_info);
            // Derive WebSocket URI from API URL if WS_URI config is empty
            websocket_parse_base_uri();
            websocket_set_base_uri(api_base_url);
            session_config_fetch_remote(api_base_url, wifi_get_mac());
            char session_id[64] = "";
            if (session_config_load(session_id, sizeof(session_id)) == ESP_OK && session_id[0] != '\0') {
                websocket_set_session_id(session_id);
            }
        } else {
            ESP_LOGW(TAG, "API URL not configured, skipping device registration");
        }
    }

    if (api_base_url[0] != '\0') {
        websocket_client_init();
    } else {
        ESP_LOGW(TAG, "Skipping WebSocket init (no API URL)");
    }

    imu_data_t data;
    TickType_t delay = pdMS_TO_TICKS(1000 / SAMPLE_RATE_HZ);
    uint64_t tick = 0;
    int imu_fail_count = 0;

    while (1) {
        if (imu_ok && imu_read(&data) == ESP_OK) {
            imu_fail_count = 0;
            if (websocket_is_connected()) {
                int64_t age_ms = esp_timer_get_time() / 1000 - websocket_connected_since_ms();
                if (age_ms > 200) {
                    websocket_send_json(&data);
                }
            } else if (websocket_should_reconnect()) {
                ESP_LOGW(TAG, "WS reconnecting...");
                websocket_reconnect();
            }
        } else {
            if (imu_ok) {
                imu_fail_count++;
                if (imu_fail_count >= IMU_MAX_FAIL) {
                    ESP_LOGE(TAG, "IMU read failed %d times consecutively, rebooting...", imu_fail_count);
                    vTaskDelay(pdMS_TO_TICKS(1000));
                    esp_restart();
                }
            }
        }

        // WiFi periodic retry if disconnected
        if (!wifi_is_connected()) {
            wifi_periodic_retry();
        }

        // OTA check once per 24 hours
        if (tick % OTA_CHECK_INTERVAL == 0 && tick > 0) {
            ota_check_result_t ota_result;
            if (ota_check_update(&ota_result) == ESP_OK && ota_result.update_available) {
                ESP_LOGI(TAG, "OTA update available: v%s", ota_result.latest_version);
                ota_perform_update(ota_result.download_url, ota_result.sha256);
            }
        }

        // Remote WiFi config check every 30 min
        if (tick % WIFI_CONFIG_INTERVAL == 0 && tick > 0 && wifi_is_connected()) {
            ESP_LOGI(TAG, "checking remote WiFi config...");
            char config_url2[320];
            snprintf(config_url2, sizeof(config_url2), "%s/api/config", api_base_url);
            wifi_config_fetch_remote(config_url2, wifi_get_mac());
        }

        // Remote session config check every 30 min
        if (tick % SESSION_CONFIG_INTERVAL == 0 && tick > 0 && wifi_is_connected()) {
            ESP_LOGI(TAG, "checking remote session config...");
            char old_sid[64] = "";
            session_config_load(old_sid, sizeof(old_sid));

            session_config_fetch_remote(api_base_url, wifi_get_mac());

            char new_sid[64] = "";
            if (session_config_load(new_sid, sizeof(new_sid)) == ESP_OK) {
                websocket_set_session_id(new_sid);
            }
        }

        if (tick % DEVICE_REGISTER_INTERVAL == 0 && tick > 0 && wifi_is_connected()) {
            ESP_LOGI(TAG, "refreshing device registration...");
            device_registry_info_t reg_info = {
                .device_id = wifi_get_mac(),
                .name = wifi_get_mac(),
                .firmware_version = CONFIG_HMEAYC_FIRMWARE_VERSION,
                .wifi_ssid = wifi_get_ssid(),
                .wifi_rssi = wifi_get_rssi(),
                .ip_address = wifi_get_ip(),
            };
            device_registry_upsert(api_base_url, &reg_info);
        }

        // diagnostic status every 10s
        if (tick % (SAMPLE_RATE_HZ * 10) == 0) {
            uint32_t bat_mv = 0;
            battery_read_mv(&bat_mv);
            bool usb = battery_is_usb_powered(bat_mv);
            uint8_t bat_pct = usb ? 100 : battery_level_percent(bat_mv);
            ESP_LOGI(TAG, "tick=%llu wifi=%d ws=%d bat=%lumV(%d%%)%s",
                     (unsigned long long)tick,
                     wifi_is_connected(), websocket_is_connected(),
                     (unsigned long)bat_mv, bat_pct,
                     usb ? " [USB]" : "");
        }

        // Heartbeat every 2 min to keep device "online" in dashboard
        if (tick % HEARTBEAT_INTERVAL == 0 && tick > 0 && wifi_is_connected() && api_base_url[0] != '\0') {
            device_registry_heartbeat(api_base_url, wifi_get_mac());
        }

        tick++;
        vTaskDelay(delay);
    }
}
