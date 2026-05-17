#include "ble_receiver.h"
#include "config.h"
#include "providers.h"
#include "ui/ui_main.h"

#include "esp_log.h"
#include "nvs_flash.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "cJSON.h"
#include <string.h>

static const char *TAG = "ble";

// ── Parse JSON payload from daemon ────────────────────────────────────────────
// Expected schema (v2):
// {
//   "v": 2,
//   "providers": {
//     "claude":   {"pct":45, "pct2":20, "tokens":45000, "limit":100000,
//                  "cost":0.12, "reset":30, "model":"claude-3-5-sonnet"},
//     "openai":   {...},
//     "deepseek": {...},
//     "ollama":   {"connected":true, "models":"llama3,mistral"},
//     "lmstudio": {"connected":false}
//   },
//   "tasks": [
//     {"label":"task name","model":"claude-3-5-sonnet",
//      "in":5000,"out":2000,"limit":100000,"provider":0}
//   ],
//   "ts": 1234567890
// }
void ble_on_write(const uint8_t *data, uint16_t len) {
    cJSON *root = cJSON_ParseWithLength((const char *)data, len);
    if (!root) {
        ESP_LOGW(TAG, "JSON parse fail");
        return;
    }

    const char *keys[PROVIDER_COUNT] = {
        "claude", "openai", "deepseek", "ollama", "lmstudio"
    };

    cJSON *provs = cJSON_GetObjectItem(root, "providers");
    if (provs) {
        for (int i = 0; i < PROVIDER_COUNT; i++) {
            cJSON *p = cJSON_GetObjectItem(provs, keys[i]);
            provider_state_t *st = &g_state.providers[i];
            memset(st, 0, sizeof(*st));

            if (!p) continue;

            cJSON *conn = cJSON_GetObjectItem(p, "connected");
            st->connected = conn ? cJSON_IsTrue(conn) : (cJSON_GetObjectItem(p, "pct") != NULL);

            cJSON *pct  = cJSON_GetObjectItem(p, "pct");
            cJSON *pct2 = cJSON_GetObjectItem(p, "pct2");
            cJSON *tok  = cJSON_GetObjectItem(p, "tokens");
            cJSON *lim  = cJSON_GetObjectItem(p, "limit");
            cJSON *cost = cJSON_GetObjectItem(p, "cost");
            cJSON *rst  = cJSON_GetObjectItem(p, "reset");
            cJSON *mdl  = cJSON_GetObjectItem(p, "model");
            cJSON *err  = cJSON_GetObjectItem(p, "error");

            if (pct)  st->session_pct    = (uint8_t)cJSON_GetNumberValue(pct);
            if (pct2) st->period_pct     = (uint8_t)cJSON_GetNumberValue(pct2);
            if (tok)  st->tokens_used    = (uint32_t)cJSON_GetNumberValue(tok);
            if (lim)  st->tokens_limit   = (uint32_t)cJSON_GetNumberValue(lim);
            if (cost) st->cost_session   = (float)cJSON_GetNumberValue(cost);
            if (rst)  st->reset_min      = (int32_t)cJSON_GetNumberValue(rst);
            if (mdl && mdl->valuestring)
                strncpy(st->active_model, mdl->valuestring, sizeof(st->active_model)-1);
            if (err && err->valuestring)
                strncpy(st->error, err->valuestring, sizeof(st->error)-1);
        }
    }

    cJSON *tasks_arr = cJSON_GetObjectItem(root, "tasks");
    g_state.task_count = 0;
    if (tasks_arr && cJSON_IsArray(tasks_arr)) {
        int n = cJSON_GetArraySize(tasks_arr);
        if (n > MAX_TASKS) n = MAX_TASKS;
        for (int i = 0; i < n; i++) {
            cJSON *t = cJSON_GetArrayItem(tasks_arr, i);
            task_t *task = &g_state.tasks[g_state.task_count++];
            memset(task, 0, sizeof(*task));
            task->active = true;
            cJSON *lbl  = cJSON_GetObjectItem(t, "label");
            cJSON *mdl  = cJSON_GetObjectItem(t, "model");
            cJSON *ti   = cJSON_GetObjectItem(t, "in");
            cJSON *to   = cJSON_GetObjectItem(t, "out");
            cJSON *tlim = cJSON_GetObjectItem(t, "limit");
            cJSON *prov = cJSON_GetObjectItem(t, "provider");
            if (lbl && lbl->valuestring)
                strncpy(task->label, lbl->valuestring, sizeof(task->label)-1);
            if (mdl && mdl->valuestring)
                strncpy(task->model, mdl->valuestring, sizeof(task->model)-1);
            if (ti)   task->tokens_in    = (uint32_t)cJSON_GetNumberValue(ti);
            if (to)   task->tokens_out   = (uint32_t)cJSON_GetNumberValue(to);
            if (tlim) task->tokens_limit = (uint32_t)cJSON_GetNumberValue(tlim);
            if (prov) task->provider     = (uint8_t)cJSON_GetNumberValue(prov);
        }
    }

    cJSON *ts = cJSON_GetObjectItem(root, "ts");
    if (ts) g_state.last_update_ts = (uint32_t)cJSON_GetNumberValue(ts);

    cJSON_Delete(root);
    ui_on_state_update();
    ESP_LOGI(TAG, "State updated from BLE");
}

// ── NimBLE GATT characteristic write handler ──────────────────────────────────
static int gatt_write_cb(uint16_t conn_handle, uint16_t attr_handle,
                          struct ble_gatt_access_ctxt *ctxt, void *arg) {
    if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return 0;
    ble_on_write(ctxt->om->om_data, ctxt->om->om_len);
    return 0;
}

// ── Service definition ────────────────────────────────────────────────────────
static const ble_uuid128_t s_svc_uuid  = BLE_UUID128_INIT(
    0x4b,0x91,0x31,0xc3,0xc9,0xc5,0xcc,0x8f,
    0x9e,0x45,0xb5,0x1f,0x01,0xc2,0xaf,0x4f);
static const ble_uuid128_t s_char_uuid = BLE_UUID128_INIT(
    0xa8,0x26,0x1b,0x36,0x07,0xea,0xf5,0xb7,
    0x88,0x46,0xe1,0x36,0x3e,0x48,0xb5,0xbe);

static uint16_t s_char_handle;

static const struct ble_gatt_svc_def s_svcs[] = {
    {
        .type            = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid            = &s_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid       = &s_char_uuid.u,
                .access_cb  = gatt_write_cb,
                .flags      = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
                .val_handle = &s_char_handle,
            },
            { 0 }
        },
    },
    { 0 }
};

// ── GAP event handler ─────────────────────────────────────────────────────────
static int gap_event_cb(struct ble_gap_event *event, void *arg) {
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        g_state.ble_connected = (event->connect.status == 0);
        ui_on_ble_changed(g_state.ble_connected);
        if (!g_state.ble_connected) ble_init(); // re-advertise
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        g_state.ble_connected = false;
        ui_on_ble_changed(false);
        ble_init();
        break;
    default:
        break;
    }
    return 0;
}

static void start_advertising(void) {
    struct ble_gap_adv_params adv_params = {};
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;

    struct ble_hs_adv_fields fields = {};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    const char *name = BLE_DEVICE_NAME;
    fields.name      = (const uint8_t *)name;
    fields.name_len  = strlen(name);
    fields.name_is_complete = 1;
    ble_gap_adv_set_fields(&fields);

    ble_gap_adv_start(BLE_OWN_ADDR_PUBLIC, NULL, BLE_HS_FOREVER,
                      &adv_params, gap_event_cb, NULL);
}

static void ble_on_sync(void) {
    ble_hs_util_ensure_addr(0);
    ble_svc_gatt_init();
    ble_gatts_count_cfg(s_svcs);
    ble_gatts_add_svcs(s_svcs);
    start_advertising();
    ESP_LOGI(TAG, "BLE advertising as \"%s\"", BLE_DEVICE_NAME);
}

void ble_init(void) {
    nimble_port_init();
    ble_hs_cfg.sync_cb = ble_on_sync;
    ble_svc_gap_device_name_set(BLE_DEVICE_NAME);
    nimble_port_freertos_init(nimble_port_run);
}
