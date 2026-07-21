#pragma once

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t softap_portal_start(void);
void softap_portal_stop(void);
bool softap_portal_is_running(void);

#ifdef __cplusplus
}
#endif
