#pragma once
#include "lvgl.h"
#include "../providers.h"
#ifdef __cplusplus
extern "C" {
#endif

// Screen IDs
typedef enum {
    SCREEN_OVERVIEW = 0,   // all 5 providers mini-grid
    SCREEN_CLAUDE,
    SCREEN_OPENAI,
    SCREEN_DEEPSEEK,
    SCREEN_OLLAMA,
    SCREEN_LMSTUDIO,
    SCREEN_TASKS,
    SCREEN_COUNT,
} screen_id_t;

void ui_init(void);
void ui_next_screen(void);
void ui_goto_screen(screen_id_t id);
void ui_on_state_update(void);       // called after g_state is updated via BLE
void ui_on_ble_changed(bool connected);

#ifdef __cplusplus
}
#endif
