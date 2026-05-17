#include "display.h"
#include "config.h"
#include "esp_log.h"
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "lvgl.h"

static const char *TAG = "display";

// ── Display buffer ────────────────────────────────────────────────────────────
#define BUF_LINES 40
static lv_color_t s_buf1[DISPLAY_WIDTH * BUF_LINES];
static lv_color_t s_buf2[DISPLAY_WIDTH * BUF_LINES];

static lv_display_t *s_disp = NULL;

// ── LVGL flush callback ───────────────────────────────────────────────────────
// NOTE: This is a stub for the QSPI CO5300 driver.
// Real implementation uses the esp-idf-lcd-co5300 component or the LILYGO BSP.
// Replace lcd_write_pixels() with your board's actual SPI/QSPI transfer.
static void flush_cb(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map) {
    // TODO: send pixel data to CO5300 via QSPI
    // co5300_draw_bitmap(area->x1, area->y1, area->x2, area->y2, (uint16_t*)px_map);
    lv_display_flush_ready(disp);
}

// ── Backlight (LEDC PWM) ──────────────────────────────────────────────────────
static void backlight_init(void) {
    ledc_timer_config_t timer = {
        .speed_mode      = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_8_BIT,
        .timer_num       = LEDC_TIMER_0,
        .freq_hz         = 5000,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&timer);

    ledc_channel_config_t ch = {
        .gpio_num   = LCD_BL_PIN,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel    = LEDC_CHANNEL_0,
        .intr_type  = LEDC_INTR_DISABLE,
        .timer_sel  = LEDC_TIMER_0,
        .duty       = 200,
        .hpoint     = 0,
    };
    ledc_channel_config(&ch);
}

void display_set_brightness(uint8_t pct) {
    uint32_t duty = (pct * 255) / 100;
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

// ── Public init ───────────────────────────────────────────────────────────────
void display_init(void) {
    ESP_LOGI(TAG, "Init display %dx%d", DISPLAY_WIDTH, DISPLAY_HEIGHT);

    backlight_init();
    display_set_brightness(80);

    s_disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    lv_display_set_flush_cb(s_disp, flush_cb);
    lv_display_set_buffers(s_disp, s_buf1, s_buf2,
                           sizeof(s_buf1), LV_DISPLAY_RENDER_MODE_PARTIAL);
}
