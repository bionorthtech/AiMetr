#pragma once
#include <stdint.h>
#include <stdbool.h>

// ── Provider IDs ─────────────────────────────────────────────────────────────
typedef enum {
    PROVIDER_CLAUDE    = 0,
    PROVIDER_OPENAI    = 1,
    PROVIDER_DEEPSEEK  = 2,
    PROVIDER_OLLAMA    = 3,
    PROVIDER_LMSTUDIO  = 4,
    PROVIDER_COUNT     = 5,
} provider_id_t;

// ── Per-provider state (decoded from BLE JSON) ────────────────────────────────
typedef struct {
    bool     connected;
    uint8_t  session_pct;       // 0-100 %
    uint8_t  period_pct;        // 0-100 %
    uint32_t tokens_used;
    uint32_t tokens_limit;
    float    cost_session;      // USD
    int32_t  reset_min;         // minutes until rate-limit reset (-1 = N/A)
    char     active_model[48];
    char     error[64];
} provider_state_t;

// ── Task (active AI session) ──────────────────────────────────────────────────
#define MAX_TASKS 8
typedef struct {
    char     label[48];
    char     model[32];
    uint32_t tokens_in;
    uint32_t tokens_out;
    uint32_t tokens_limit;
    uint8_t  provider;          // provider_id_t
    bool     active;
} task_t;

// ── Global app state ──────────────────────────────────────────────────────────
typedef struct {
    provider_state_t providers[PROVIDER_COUNT];
    task_t           tasks[MAX_TASKS];
    uint8_t          task_count;
    uint32_t         last_update_ts;   // Unix timestamp of last BLE update
    bool             ble_connected;    // phone/daemon currently connected
} app_state_t;

extern app_state_t g_state;

// ── Provider display metadata ─────────────────────────────────────────────────
typedef struct {
    const char *name;
    const char *short_name;
    uint32_t    color;    // LVGL lv_color32_t compatible (0xRRGGBB)
} provider_meta_t;

static const provider_meta_t PROVIDER_META[PROVIDER_COUNT] = {
    [PROVIDER_CLAUDE]    = { "Claude",    "CLAUD", 0xCC785C },
    [PROVIDER_OPENAI]    = { "OpenAI",    "OAI",   0x10A37F },
    [PROVIDER_DEEPSEEK]  = { "DeepSeek",  "DEEP",  0x536AE6 },
    [PROVIDER_OLLAMA]    = { "Ollama",    "OLAMA", 0xF9A825 },
    [PROVIDER_LMSTUDIO]  = { "LM Studio", "LMS",   0x9C27B0 },
};
