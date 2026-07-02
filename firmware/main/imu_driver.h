#pragma once

#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define MPU6050_I2C_ADDR_DEFAULT  0x68
#define MPU6500_I2C_ADDR_DEFAULT  0x68
#define MPU6050_WHO_AM_I_VAL      0x68
#define MPU6500_WHO_AM_I_VAL      0x70

typedef struct {
    float accel_x;  // g
    float accel_y;
    float accel_z;
    float gyro_x;   // dps
    float gyro_y;
    float gyro_z;
} imu_data_t;

typedef struct {
    int i2c_port;
    int sda_pin;
    int scl_pin;
    uint8_t i2c_addr;
} imu_config_t;

esp_err_t imu_init(const imu_config_t *config);
esp_err_t imu_read(imu_data_t *out);
void imu_print_data(const imu_data_t *data);

#ifdef __cplusplus
}
#endif
