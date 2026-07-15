idf_component_register(SRCS "main.c" "imu_driver.c" "wifi_manager.c" "websocket_client.c" "battery.c" "ota_client.c" "device_registry.c" "wifi_config_nvs.c" "session_config_nvs.c"
                    INCLUDE_DIRS "."
                    REQUIRES esp_adc esp_http_client app_update driver esp_timer esp_wifi nvs_flash esp_event esp_netif esp_websocket_client)
