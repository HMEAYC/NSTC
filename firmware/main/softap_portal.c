#include "softap_portal.h"
#include "wifi_config_nvs.h"

#include <string.h>

#include "esp_check.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_http_server.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "SoftAP";

#define SOFTAP_SSID     "HMEAYC-Setup"
#define SOFTAP_CHANNEL  1
#define MAX_STA_CONN    4

static httpd_handle_t s_server = NULL;
static bool s_running = false;
static esp_netif_t *s_ap_netif = NULL;

// ---------------------------------------------------------------------------
// Captive portal HTML
// ---------------------------------------------------------------------------
static const char PORTAL_HTML[] =
    "<!DOCTYPE html>"
    "<html><head>"
    "<meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>HMEAYC WiFi Setup</title>"
    "<style>"
    "body{font-family:-apple-system,sans-serif;max-width:400px;margin:40px auto;padding:20px;background:#f5f5f5}"
    "h1{font-size:20px;color:#333;text-align:center}"
    ".card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}"
    "label{display:block;font-size:13px;color:#666;margin-bottom:4px;margin-top:16px}"
    "input[type=text],input[type=password]{width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;font-size:14px}"
    "button{width:100%;margin-top:20px;padding:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer}"
    "button:hover{background:#1d4ed8}"
    ".ok{background:#dcfce7;border:1px solid #86efac;color:#166534;padding:12px;border-radius:8px;text-align:center;margin-top:16px;font-size:14px}"
    ".hint{font-size:11px;color:#999;text-align:center;margin-top:12px}"
    "</style>"
    "</head><body>"
    "<div class='card'>"
    "<h1>HMEAYC WiFi Setup</h1>"
    "<form id='f' onsubmit='return submitForm()'>"
    "<label>WiFi Name (SSID)</label>"
    "<input type='text' id='s' name='ssid' placeholder='Enter WiFi name' required>"
    "<label>Password</label>"
    "<input type='password' id='p' name='password' placeholder='Enter WiFi password'>"
    "<button type='submit'>Connect</button>"
    "</form>"
    "<div id='msg'></div>"
    "<p class='hint'>Device will restart after saving.</p>"
    "</div>"
    "<script>"
    "function submitForm(){"
    "var f=document.getElementById('f');"
    "var d=new FormData(f);"
    "fetch('/wifi',{method:'POST',body:d}).then(function(r){return r.json()}).then(function(j){"
    "if(j.ok){document.getElementById('msg').innerHTML='<div class=ok>WiFi saved! Rebooting...</div>';f.reset();}"
    "else{document.getElementById('msg').innerHTML='<div class=ok style=background:#fee2e2;border-color:#fca5a5;color:#991b1b>'+j.error+'</div>';}"
    "});return false;}"
    "</script>"
    "</body></html>";

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------
static esp_err_t portal_get_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, PORTAL_HTML, sizeof(PORTAL_HTML) - 1);
}

static esp_err_t wifi_post_handler(httpd_req_t *req) {
    char buf[256];
    int ret = httpd_req_recv(req, buf, sizeof(buf) - 1);
    if (ret <= 0) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "read error");
        return ESP_FAIL;
    }
    buf[ret] = '\0';

    // Parse form data: ssid=xxx&password=xxx
    char ssid[64] = {0};
    char password[64] = {0};

    char *p = strstr(buf, "ssid=");
    if (p) {
        p += 5;
        int i = 0;
        while (*p && *p != '&' && i < (int)sizeof(ssid) - 1)
            ssid[i++] = *p++;
        ssid[i] = '\0';
    }

    p = strstr(buf, "password=");
    if (p) {
        p += 9;
        int i = 0;
        while (*p && *p != '&' && i < (int)sizeof(password) - 1)
            password[i++] = *p++;
        password[i] = '\0';
    }

    if (strlen(ssid) == 0) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_sendstr(req, "{\"ok\":false,\"error\":\"SSID is required\"}");
        return ESP_OK;
    }

    ESP_LOGI(TAG, "portal: SSID='%s'", ssid);

    // Save to NVS
    wifi_creds_t creds;
    memset(&creds, 0, sizeof(creds));
    strncpy(creds.ssid, ssid, sizeof(creds.ssid) - 1);
    strncpy(creds.password, password, sizeof(creds.password) - 1);
    esp_err_t err = wifi_config_save(&creds);

    httpd_resp_set_type(req, "application/json");
    if (err == ESP_OK) {
        httpd_resp_sendstr(req, "{\"ok\":true}");
        // Delay reboot so response is sent
        vTaskDelay(pdMS_TO_TICKS(1500));
        esp_restart();
    } else {
        httpd_resp_sendstr(req, "{\"ok\":false,\"error\":\"Failed to save\"}");
    }
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
esp_err_t softap_portal_start(void) {
    if (s_running) return ESP_OK;

    ESP_LOGI(TAG, "starting SoftAP portal: %s", SOFTAP_SSID);

    // Create AP netif
    s_ap_netif = esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&cfg), TAG, "wifi init");

    wifi_config_t wifi_config = {
        .ap = {
            .ssid = SOFTAP_SSID,
            .ssid_len = strlen(SOFTAP_SSID),
            .channel = SOFTAP_CHANNEL,
            .authmode = WIFI_AUTH_OPEN,
            .max_connection = MAX_STA_CONN,
        },
    };

    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_AP), TAG, "set mode");
    ESP_RETURN_ON_ERROR(esp_wifi_set_config(WIFI_IF_AP, &wifi_config), TAG, "set config");
    ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "start");

    // Start HTTP server
    httpd_config_t server_config = HTTPD_DEFAULT_CONFIG();
    server_config.max_uri_handlers = 4;
    server_config.stack_size = 8192;

    ESP_RETURN_ON_ERROR(httpd_start(&s_server, &server_config), TAG, "httpd start");

    // Root → captive portal page
    httpd_uri_t portal_uri = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = portal_get_handler,
    };
    httpd_register_uri_handler(s_server, &portal_uri);

    // Also handle captive portal detection paths
    httpd_uri_t gen_204_uri = {
        .uri = "/generate_204",
        .method = HTTP_GET,
        .handler = portal_get_handler,
    };
    httpd_register_uri_handler(s_server, &gen_204_uri);

    httpd_uri_t hotspot_uri = {
        .uri = "/hotspot-detect.html",
        .method = HTTP_GET,
        .handler = portal_get_handler,
    };
    httpd_register_uri_handler(s_server, &hotspot_uri);

    // WiFi config POST
    httpd_uri_t wifi_uri = {
        .uri = "/wifi",
        .method = HTTP_POST,
        .handler = wifi_post_handler,
    };
    httpd_register_uri_handler(s_server, &wifi_uri);

    s_running = true;
    ESP_LOGI(TAG, "SoftAP portal ready, connect to '%s'", SOFTAP_SSID);
    return ESP_OK;
}

void softap_portal_stop(void) {
    if (!s_running) return;

    if (s_server) {
        httpd_stop(s_server);
        s_server = NULL;
    }
    esp_wifi_stop();
    if (s_ap_netif) {
        esp_netif_destroy_default_wifi(s_ap_netif);
        s_ap_netif = NULL;
    }
    s_running = false;
    ESP_LOGI(TAG, "SoftAP portal stopped");
}

bool softap_portal_is_running(void) {
    return s_running;
}
