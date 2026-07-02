#include "imu_driver.h"

#include <math.h>
#include <string.h>

#include "driver/i2c.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "MPU6xxx";

// ---------------------------------------------------------------------------
// MPU6050/MPU6500 register map (register-compatible)
// ---------------------------------------------------------------------------
#define REG_SMPLRT_DIV      0x19
#define REG_CONFIG          0x1A
#define REG_GYRO_CONFIG     0x1B
#define REG_ACCEL_CONFIG    0x1C
#define REG_INT_PIN_CFG     0x37
#define REG_INT_ENABLE      0x38
#define REG_ACCEL_XOUT_H    0x3B  // 14 bytes: accel(6) + temp(2) + gyro(6)
#define REG_USER_CTRL       0x6A
#define REG_PWR_MGMT_1      0x6B
#define REG_PWR_MGMT_2      0x6C
#define REG_WHO_AM_I        0x75

// ---------------------------------------------------------------------------
// Power management
// ---------------------------------------------------------------------------
#define PWR_MGMT1_RESET     0x80
#define PWR_MGMT1_WAKE      0x00  // clock source = internal 8MHz
#define PWR_MGMT1_PLL_X     0x01  // clock source = PLL with X-axis gyro (best)
#define PWR_MGMT2_DISABLE_ALL  0x3F  // disable accel + gyro in standby

// ---------------------------------------------------------------------------
// Configuration values
// ---------------------------------------------------------------------------
// CONFIG: DLPF_CFG[2:0]
// 0 = 260 Hz  (no DLPF),  1 = 184 Hz,  2 = 94 Hz,  3 = 44 Hz,
// 4 = 21 Hz,  5 = 10 Hz,  6 = 5 Hz
#define DLPF_BW_44HZ   0x03

// GYRO_CONFIG: FS_SEL[1:0]
#define GYRO_FS_250DPS  0x00
#define GYRO_FS_500DPS  0x08
#define GYRO_FS_1000DPS 0x10
#define GYRO_FS_2000DPS 0x18

// ACCEL_CONFIG: AFS_SEL[1:0]
#define ACCEL_FS_2G   0x00
#define ACCEL_FS_4G   0x08
#define ACCEL_FS_8G   0x10
#define ACCEL_FS_16G  0x18

// ---------------------------------------------------------------------------
// Scale factors
// ---------------------------------------------------------------------------
#define ACCEL_SCALE_2G   16384.0f
#define ACCEL_SCALE_4G    8192.0f
#define ACCEL_SCALE_8G    4096.0f
#define ACCEL_SCALE_16G   2048.0f

#define GYRO_SCALE_250DPS    131.0f
#define GYRO_SCALE_500DPS     65.5f
#define GYRO_SCALE_1000DPS    32.8f
#define GYRO_SCALE_2000DPS    16.4f

// ---------------------------------------------------------------------------
// Driver state
// ---------------------------------------------------------------------------
static struct {
    int i2c_port;
    uint8_t i2c_addr;
    bool initialized;
    float accel_scale;
    float gyro_scale;
} drv = {0};

// ---------------------------------------------------------------------------
// Low-level I2C helpers
// ---------------------------------------------------------------------------
static esp_err_t reg_write8(uint8_t reg, uint8_t val) {
    uint8_t buf[2] = {reg, val};
    return i2c_master_write_to_device(drv.i2c_port, drv.i2c_addr,
                                      buf, sizeof(buf),
                                      pdMS_TO_TICKS(100));
}

static esp_err_t reg_read8(uint8_t reg, uint8_t *val) {
    return i2c_master_write_read_device(drv.i2c_port, drv.i2c_addr,
                                        &reg, 1, val, 1,
                                        pdMS_TO_TICKS(100));
}

// Bulk read of big-endian 16-bit words (MPU6050 stores MSB first)
static esp_err_t reg_read16_be_bulk(uint8_t reg, int16_t *out, int count) {
    uint8_t buf[32];
    if ((size_t)count * 2 > sizeof(buf)) return ESP_ERR_INVALID_SIZE;

    esp_err_t ret = i2c_master_write_read_device(drv.i2c_port, drv.i2c_addr,
                                                  &reg, 1,
                                                  buf, (size_t)count * 2,
                                                  pdMS_TO_TICKS(100));
    if (ret != ESP_OK) return ret;

    for (int i = 0; i < count; i++) {
        out[i] = (int16_t)((uint16_t)buf[i * 2] << 8 |
                           (uint16_t)buf[i * 2 + 1]);
    }
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

esp_err_t imu_init(const imu_config_t *config) {
    esp_err_t ret;
    uint8_t val;

    // ---------- configure I2C ----------
    i2c_config_t i2c_conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = config->sda_pin,
        .scl_io_num = config->scl_pin,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 400000,
        .clk_flags = 0,
    };
    ESP_RETURN_ON_ERROR(i2c_param_config(config->i2c_port, &i2c_conf),
                        TAG, "I2C param config failed");
    ESP_RETURN_ON_ERROR(i2c_driver_install(config->i2c_port, I2C_MODE_MASTER,
                                            0, 0, 0),
                        TAG, "I2C driver install failed");

    drv.i2c_port = config->i2c_port;
    drv.i2c_addr = config->i2c_addr;

    // ---------- reset ----------
    ESP_RETURN_ON_ERROR(reg_write8(REG_PWR_MGMT_1, PWR_MGMT1_RESET),
                        TAG, "device reset failed");
    vTaskDelay(pdMS_TO_TICKS(100));

    // ---------- verify chip ID ----------
    ESP_RETURN_ON_ERROR(reg_read8(REG_WHO_AM_I, &val),
                        TAG, "read WHO_AM_I failed");
    if (val != MPU6050_WHO_AM_I_VAL && val != MPU6500_WHO_AM_I_VAL) {
        ESP_LOGE(TAG, "unexpected WHO_AM_I: 0x%02X (expected 0x%02X or 0x%02X)",
                 val, MPU6050_WHO_AM_I_VAL, MPU6500_WHO_AM_I_VAL);
        return ESP_ERR_NOT_FOUND;
    }
    ESP_LOGI(TAG, "WHO_AM_I verified: 0x%02X", val);

    // ---------- wake up ----------
    // Use PLL with X-axis gyro for best clock accuracy
    ESP_RETURN_ON_ERROR(reg_write8(REG_PWR_MGMT_1, PWR_MGMT1_PLL_X),
                        TAG, "PWR_MGMT_1 write failed");
    vTaskDelay(pdMS_TO_TICKS(10));

    // ---------- sample rate ----------
    // Gyro output rate = 1 kHz (with DLPF enabled)
    // Sample rate = 1 kHz / (1 + SMPLRT_DIV)
    // For 50 Hz: SMPLRT_DIV = (1000 / 50) - 1 = 19
    ESP_RETURN_ON_ERROR(reg_write8(REG_SMPLRT_DIV, 19),
                        TAG, "SMPLRT_DIV write failed");

    // ---------- DLPF ----------
    // DLPF_CFG = 3  →  44 Hz bandwidth, 1 kHz output rate
    ESP_RETURN_ON_ERROR(reg_write8(REG_CONFIG, DLPF_BW_44HZ),
                        TAG, "CONFIG write failed");

    // ---------- gyro full scale ----------
    // ±250 dps
    ESP_RETURN_ON_ERROR(reg_write8(REG_GYRO_CONFIG, GYRO_FS_250DPS),
                        TAG, "GYRO_CONFIG write failed");

    // ---------- accel full scale ----------
    // ±2g
    ESP_RETURN_ON_ERROR(reg_write8(REG_ACCEL_CONFIG, ACCEL_FS_2G),
                        TAG, "ACCEL_CONFIG write failed");

    // ---------- scale factors ----------
    drv.accel_scale = ACCEL_SCALE_2G;
    drv.gyro_scale  = GYRO_SCALE_250DPS;
    drv.initialized = true;

    ESP_LOGI(TAG, "MPU6xxx initialized (I2C %d @ 0x%02X)",
             drv.i2c_port, drv.i2c_addr);
    return ESP_OK;
}

esp_err_t imu_read(imu_data_t *out) {
    if (!drv.initialized || !out) return ESP_ERR_INVALID_STATE;

    // Read all 14 bytes starting at ACCEL_XOUT_H:
    //   accel (3 × 16-bit)  +  temp (1 × 16-bit, skip)  +  gyro (3 × 16-bit)
    int16_t raw[7] = {0};

    esp_err_t ret = reg_read16_be_bulk(REG_ACCEL_XOUT_H, raw, 7);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "read failed: %s", esp_err_to_name(ret));
        return ret;
    }

    out->accel_x = (float)raw[0] / drv.accel_scale;
    out->accel_y = (float)raw[1] / drv.accel_scale;
    out->accel_z = (float)raw[2] / drv.accel_scale;

    // raw[3] = temperature (unused)

    out->gyro_x = (float)raw[4] / drv.gyro_scale;
    out->gyro_y = (float)raw[5] / drv.gyro_scale;
    out->gyro_z = (float)raw[6] / drv.gyro_scale;

    return ESP_OK;
}

void imu_print_data(const imu_data_t *data) {
    if (!data) return;
    ESP_LOGI(TAG, "accel: %+.2f %+.2f %+.2f g  |  gyro: %+.1f %+.1f %+.1f dps",
             data->accel_x, data->accel_y, data->accel_z,
             data->gyro_x, data->gyro_y, data->gyro_z);
}
