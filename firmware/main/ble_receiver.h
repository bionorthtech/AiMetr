#pragma once
#ifdef __cplusplus
extern "C" {
#endif

void ble_init(void);

// Called by BLE stack when data arrives; parses JSON and updates g_state
void ble_on_write(const uint8_t *data, uint16_t len);

#ifdef __cplusplus
}
#endif
