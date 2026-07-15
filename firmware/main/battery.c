#include "battery.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "esp_check.h"

static const char *TAG = "Battery";
static adc_oneshot_unit_handle_t adc_handle = NULL;

// Voltage divider: R1=100k, R2=47k
// V_ADC = V_BAT * R2 / (R1 + R2) = V_BAT * 47/147
// V_BAT = V_ADC * 147 / 47
#define DIVIDER_RATIO  (147.0f / 47.0f)
#define ADC_REF_MV     3300
#define ADC_BITS       12
#define ADC_MAX        ((1 << ADC_BITS) - 1)

// Voltage thresholds for 16500 Li-ion battery.
// Actual ESP32-C3 hardware brownout is ~2.50V (see hardware/schematic.md); BATTERY_EMPTY_MV is
// set ~300mV above that on purpose so the displayed 0% still leaves a safety margin before the
// device actually cuts out.
#define BATTERY_FULL_MV    4200
#define BATTERY_LOW_MV     3200   // Low battery warning threshold
#define BATTERY_EMPTY_MV   2800   // 0% display floor (safety margin above ~2.50V hardware brownout)

esp_err_t battery_init(void) {
    adc_oneshot_unit_init_cfg_t unit_cfg = {
        .unit_id = ADC_UNIT_1,
    };
    ESP_RETURN_ON_ERROR(adc_oneshot_new_unit(&unit_cfg, &adc_handle),
                        TAG, "ADC unit init failed");

    adc_oneshot_chan_cfg_t chan_cfg = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    ESP_RETURN_ON_ERROR(adc_oneshot_config_channel(adc_handle,
                         ADC_CHANNEL_0, &chan_cfg),
                        TAG, "ADC channel config failed");

    ESP_LOGI(TAG, "battery ADC initialized on GPIO0");
    return ESP_OK;
}

esp_err_t battery_read_mv(uint32_t *voltage_mv) {
    if (!adc_handle) return ESP_ERR_INVALID_STATE;
    int raw;
    ESP_RETURN_ON_ERROR(adc_oneshot_read(adc_handle, ADC_CHANNEL_0, &raw),
                        TAG, "ADC read failed");
    uint32_t vadc_mv = (uint32_t)((uint64_t)raw * ADC_REF_MV / ADC_MAX);
    *voltage_mv = (uint32_t)((float)vadc_mv * DIVIDER_RATIO);
    return ESP_OK;
}

uint8_t battery_level_percent(uint32_t voltage_mv) {
    // 16500 Li-ion: 4.2V = 100%, 2.8V = 0% (see BATTERY_EMPTY_MV note above)
    if (voltage_mv >= BATTERY_FULL_MV) return 100;
    if (voltage_mv <= BATTERY_EMPTY_MV) return 0;
    return (uint8_t)((voltage_mv - BATTERY_EMPTY_MV) * 100 / (BATTERY_FULL_MV - BATTERY_EMPTY_MV));
}

bool battery_is_low(uint32_t voltage_mv) {
    return voltage_mv <= BATTERY_LOW_MV;
}
