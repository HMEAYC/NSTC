#include "wifi_manager.h"
#include "wifi_config_nvs.h"
#include "softap_portal.h"

#include <string.h>

#include "esp_check.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "esp_mac.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "nvs_flash.h"

static const char *TAG = "WiFi";

#define WIFI_SSID     CONFIG_HMEAYC_WIFI_SSID
#define WIFI_PASS     CONFIG_HMEAYC_WIFI_PASSWORD

#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1

static EventGroupHandle_t s_wifi_event_group;
static int s_retry_count = 0;
#define MAX_RETRY 5
#define RETRY_BACKOFF_MS  60000  // 60 seconds between retry cycles

static char s_current_ssid[64] = "";
static char s_ip[16] = "";
static char s_mac[18] = "";
static bool s_mac_read = false;
static bool s_connected = false;
static bool s_retry_pending = false;
static int64_t s_last_retry_ms = 0;

static esp_err_t try_connect(const char *ssid, const char *password) {
    wifi_config_t wifi_config = {
        .sta = {
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    strncpy((char *)wifi_config.sta.ssid, ssid, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char *)wifi_config.sta.password, password, sizeof(wifi_config.sta.password) - 1);

    ESP_LOGI(TAG, "connecting to '%s'...", ssid);
    esp_err_t err = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (err != ESP_OK) return err;

    esp_wifi_connect();

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                        pdFALSE, pdFALSE, pdMS_TO_TICKS(15000));

    if (bits & WIFI_CONNECTED_BIT) {
        strncpy(s_current_ssid, ssid, sizeof(s_current_ssid) - 1);
        s_connected = true;
        ESP_LOGI(TAG, "connected to '%s'", ssid);
        return ESP_OK;
    }
    ESP_LOGW(TAG, "failed to connect to '%s'", ssid);
    return ESP_FAIL;
}

static void event_handler(void *arg, esp_event_base_t base,
                          int32_t id, void *data) {
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        // connect is triggered by try_connect
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        s_connected = false;
        if (s_retry_count < MAX_RETRY) {
            s_retry_count++;
            ESP_LOGW(TAG, "disconnected, retry %d/%d", s_retry_count, MAX_RETRY);
            esp_wifi_connect();
        } else {
            ESP_LOGW(TAG, "WiFi: max retries exhausted, will retry in %d ms", RETRY_BACKOFF_MS);
            s_retry_pending = true;
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
        snprintf(s_ip, sizeof(s_ip), IPSTR, IP2STR(&event->ip_info.ip));
        ESP_LOGI(TAG, "got IP: %s", s_ip);
        s_retry_count = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

esp_err_t wifi_connect(void) {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_RETURN_ON_ERROR(nvs_flash_erase(), TAG, "nvs erase failed");
        ESP_RETURN_ON_ERROR(nvs_flash_init(), TAG, "nvs init failed");
    }

    s_wifi_event_group = xEventGroupCreate();

    ESP_RETURN_ON_ERROR(esp_netif_init(), TAG, "netif init");
    ESP_RETURN_ON_ERROR(esp_event_loop_create_default(), TAG, "event loop");
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&cfg), TAG, "wifi init");

    ESP_RETURN_ON_ERROR(esp_event_handler_register(WIFI_EVENT,
                        ESP_EVENT_ANY_ID, &event_handler, NULL), TAG, "");
    ESP_RETURN_ON_ERROR(esp_event_handler_register(IP_EVENT,
                        IP_EVENT_STA_GOT_IP, &event_handler, NULL), TAG, "");

    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_STA), TAG, "set mode");
    ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "start");

    // Try NVS-stored credentials first
    wifi_creds_t nvs_creds;
    if (wifi_config_load(&nvs_creds) == ESP_OK && strlen(nvs_creds.ssid) > 0) {
        ESP_LOGI(TAG, "trying NVS WiFi config: SSID='%s'", nvs_creds.ssid);
        if (try_connect(nvs_creds.ssid, nvs_creds.password) == ESP_OK) {
            return ESP_OK;
        }
        ESP_LOGW(TAG, "NVS WiFi failed, falling back to Kconfig");
    }

    // Fallback to Kconfig defaults
    ESP_LOGI(TAG, "using firmware default WiFi: SSID='%s'", WIFI_SSID);
    if (strlen(WIFI_SSID) > 0 && try_connect(WIFI_SSID, WIFI_PASS) == ESP_OK) {
        return ESP_OK;
    }

    // All attempts failed, start SoftAP captive portal
    ESP_LOGW(TAG, "all WiFi attempts failed, starting SoftAP portal...");
    softap_portal_start();

    return ESP_FAIL;
}

bool wifi_is_connected(void) {
    return s_connected;
}

const char *wifi_get_ssid(void) {
    return s_current_ssid;
}

const char *wifi_get_ip(void) {
    return s_ip;
}

int wifi_get_rssi(void) {
    wifi_ap_record_t ap;
    if (esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        return ap.rssi;
    }
    return 0;
}

const char *wifi_get_mac(void) {
    if (!s_mac_read) {
        uint8_t mac[6];
        esp_err_t err = esp_read_mac(mac, ESP_MAC_WIFI_STA);
        if (err == ESP_OK) {
            snprintf(s_mac, sizeof(s_mac), "%02X:%02X:%02X:%02X:%02X:%02X",
                     mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        } else {
            strncpy(s_mac, "00:00:00:00:00:00", sizeof(s_mac));
        }
        s_mac_read = true;
    }
    return s_mac;
}

void wifi_periodic_retry(void) {
    if (!s_retry_pending || s_connected) return;

    int64_t now = esp_timer_get_time() / 1000;
    if (now - s_last_retry_ms < RETRY_BACKOFF_MS) return;

    s_last_retry_ms = now;
    s_retry_pending = false;
    s_retry_count = 0;
    ESP_LOGI(TAG, "WiFi: attempting periodic retry...");

    // Try NVS credentials first
    wifi_creds_t nvs_creds;
    if (wifi_config_load(&nvs_creds) == ESP_OK && strlen(nvs_creds.ssid) > 0) {
        if (try_connect(nvs_creds.ssid, nvs_creds.password) == ESP_OK) {
            return;
        }
    }

    // Fallback to Kconfig defaults
    if (strlen(WIFI_SSID) > 0) {
        try_connect(WIFI_SSID, WIFI_PASS);
    }
}