#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "driver/gpio.h"

#include "lvgl.h"
#include "config.h"
#include "providers.h"
#include "display.h"
#include "ble_receiver.h"
#include "ui/ui_main.h"

static const char *TAG = "main";

// Global state
app_state_t g_state = {};

// ── LVGL tick (called every 1ms via esp_timer) ────────────────────────────────
static void lvgl_tick_cb(void *arg) {
    lv_tick_inc(1);
}

// ── LVGL task ─────────────────────────────────────────────────────────────────
static void lvgl_task(void *arg) {
    while (1) {
        lv_timer_handler();
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

// ── Button ISR ────────────────────────────────────────────────────────────────
static volatile bool s_btn_pressed = false;

static void IRAM_ATTR btn_isr(void *arg) {
    s_btn_pressed = true;
}

static void button_task(void *arg) {
    while (1) {
        if (s_btn_pressed) {
            s_btn_pressed = false;
            ui_next_screen();
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// ── App main ──────────────────────────────────────────────────────────────────
extern "C" void app_main(void) {
    ESP_LOGI(TAG, "Clawdmeter booting…");

    // NVS
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    // LVGL init
    lv_init();

    // Display init (configures QSPI driver + LVGL display driver)
    display_init();

    // LVGL tick timer (1ms)
    const esp_timer_create_args_t tick_args = {
        .callback = lvgl_tick_cb,
        .name     = "lvgl_tick",
    };
    esp_timer_handle_t tick_timer;
    esp_timer_create(&tick_args, &tick_timer);
    esp_timer_start_periodic(tick_timer, 1000); // 1ms

    // UI
    ui_init();

    // BLE
    ble_init();

    // Side button
    gpio_config_t btn_cfg = {
        .pin_bit_mask = (1ULL << BTN_PIN),
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_NEGEDGE,
    };
    gpio_config(&btn_cfg);
    gpio_install_isr_service(0);
    gpio_isr_handler_add((gpio_num_t)BTN_PIN, btn_isr, NULL);

    // Tasks
    xTaskCreatePinnedToCore(lvgl_task,   "lvgl",   8192, NULL, 5, NULL, 1);
    xTaskCreatePinnedToCore(button_task, "button", 2048, NULL, 3, NULL, 0);

    ESP_LOGI(TAG, "Ready. Waiting for BLE connection from daemon…");
}
