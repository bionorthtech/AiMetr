#include "ui_main.h"
#include "../config.h"
#include "../providers.h"
#include "../mascots/mascots.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <string.h>

static const char *TAG = "ui";

// ── Screen objects (each screen is an lv_obj_t *) ────────────────────────────
static lv_obj_t *s_screens[SCREEN_COUNT];
static screen_id_t s_current = SCREEN_OVERVIEW;

// ── Auto-cycle timer ──────────────────────────────────────────────────────────
static esp_timer_handle_t s_cycle_timer;

static void cycle_timer_cb(void *arg) {
    screen_id_t next = (screen_id_t)((s_current + 1) % SCREEN_COUNT);
    ui_goto_screen(next);
}

// ── Forward declarations for per-screen builders ──────────────────────────────
extern void ui_build_overview(lv_obj_t *parent);
extern void ui_build_provider(lv_obj_t *parent, provider_id_t id);
extern void ui_build_tasks(lv_obj_t *parent);
extern void ui_refresh_overview(void);
extern void ui_refresh_provider(provider_id_t id);
extern void ui_refresh_tasks(void);

// ── Status bar (shared across all screens) ────────────────────────────────────
static lv_obj_t *s_ble_dot = NULL;

static void build_status_bar(lv_obj_t *screen) {
    lv_obj_t *bar = lv_obj_create(screen);
    lv_obj_set_size(bar, DISPLAY_WIDTH, 36);
    lv_obj_set_pos(bar, 0, 0);
    lv_obj_set_style_bg_color(bar, lv_color_hex(0x1a1a2e), 0);
    lv_obj_set_style_border_width(bar, 0, 0);
    lv_obj_set_style_pad_all(bar, 0, 0);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_SCROLLABLE);

    // Title label
    lv_obj_t *title = lv_label_create(bar);
    lv_label_set_text(title, "Clawdmeter");
    lv_obj_set_style_text_color(title, lv_color_hex(0xe2e8f0), 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
    lv_obj_align(title, LV_ALIGN_LEFT_MID, 12, 0);

    // BLE indicator dot
    lv_obj_t *dot = lv_obj_create(bar);
    lv_obj_set_size(dot, 10, 10);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, lv_color_hex(0x4ade80), 0);
    lv_obj_align(dot, LV_ALIGN_RIGHT_MID, -12, 0);
    lv_obj_set_style_border_width(dot, 0, 0);
    s_ble_dot = dot;

    // Separator line
    lv_obj_t *line = lv_obj_create(screen);
    lv_obj_set_size(line, DISPLAY_WIDTH, 1);
    lv_obj_set_pos(line, 0, 36);
    lv_obj_set_style_bg_color(line, lv_color_hex(0x2a2a4a), 0);
    lv_obj_set_style_border_width(line, 0, 0);
}

// ── Nav dots at bottom ────────────────────────────────────────────────────────
static lv_obj_t *s_nav_dots[SCREEN_COUNT];

static void build_nav_dots(lv_obj_t *screen) {
    int dot_w = 8, gap = 12;
    int total = SCREEN_COUNT * dot_w + (SCREEN_COUNT - 1) * gap;
    int x0 = (DISPLAY_WIDTH - total) / 2;

    for (int i = 0; i < SCREEN_COUNT; i++) {
        lv_obj_t *d = lv_obj_create(screen);
        lv_obj_set_size(d, dot_w, dot_w);
        lv_obj_set_style_radius(d, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_border_width(d, 0, 0);
        lv_color_t col = (i == (int)s_current)
            ? lv_color_hex(0x7c3aed) : lv_color_hex(0x2a2a4a);
        lv_obj_set_style_bg_color(d, col, 0);
        lv_obj_set_pos(d, x0 + i * (dot_w + gap), DISPLAY_HEIGHT - 20);
        s_nav_dots[i] = d;
    }
}

static void update_nav_dots(void) {
    for (int i = 0; i < SCREEN_COUNT; i++) {
        if (!s_nav_dots[i]) continue;
        lv_color_t col = (i == (int)s_current)
            ? lv_color_hex(0x7c3aed) : lv_color_hex(0x2a2a4a);
        lv_obj_set_style_bg_color(s_nav_dots[i], col, 0);
    }
}

// ── Public API ─────────────────────────────────────────────────────────────────
void ui_init(void) {
    // Set theme: dark background
    lv_theme_t *th = lv_theme_default_init(
        lv_display_get_default(),
        lv_color_hex(0x7c3aed), lv_color_hex(0x5b21b6),
        true /* dark */, &lv_font_montserrat_14);
    lv_display_set_theme(lv_display_get_default(), th);

    // Build each screen
    for (int i = 0; i < SCREEN_COUNT; i++) {
        lv_obj_t *scr = lv_obj_create(NULL);
        lv_obj_set_size(scr, DISPLAY_WIDTH, DISPLAY_HEIGHT);
        lv_obj_set_style_bg_color(scr, lv_color_hex(0x0f0f1a), 0);
        lv_obj_set_style_border_width(scr, 0, 0);
        lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
        s_screens[i] = scr;

        build_status_bar(scr);
        build_nav_dots(scr);

        switch ((screen_id_t)i) {
        case SCREEN_OVERVIEW:  ui_build_overview(scr);                             break;
        case SCREEN_CLAUDE:    ui_build_provider(scr, PROVIDER_CLAUDE);            break;
        case SCREEN_OPENAI:    ui_build_provider(scr, PROVIDER_OPENAI);            break;
        case SCREEN_DEEPSEEK:  ui_build_provider(scr, PROVIDER_DEEPSEEK);          break;
        case SCREEN_OLLAMA:    ui_build_provider(scr, PROVIDER_OLLAMA);            break;
        case SCREEN_LMSTUDIO:  ui_build_provider(scr, PROVIDER_LMSTUDIO);          break;
        case SCREEN_TASKS:     ui_build_tasks(scr);                                break;
        default: break;
        }
    }

    lv_screen_load(s_screens[SCREEN_OVERVIEW]);

    // Auto-cycle timer
    esp_timer_create_args_t ta = { .callback = cycle_timer_cb, .name = "ui_cycle" };
    esp_timer_create(&ta, &s_cycle_timer);
    esp_timer_start_periodic(s_cycle_timer, (uint64_t)SCREEN_CYCLE_MS * 1000);
}

void ui_goto_screen(screen_id_t id) {
    if (id < 0 || id >= SCREEN_COUNT) return;
    s_current = id;
    lv_screen_load_anim(s_screens[id], LV_SCR_LOAD_ANIM_MOVE_LEFT, 200, 0, false);
    update_nav_dots();
}

void ui_next_screen(void) {
    // Button press resets auto-cycle and advances
    esp_timer_stop(s_cycle_timer);
    esp_timer_start_periodic(s_cycle_timer, (uint64_t)SCREEN_CYCLE_MS * 1000);
    ui_goto_screen((screen_id_t)((s_current + 1) % SCREEN_COUNT));
}

void ui_on_state_update(void) {
    ui_refresh_overview();
    switch (s_current) {
    case SCREEN_CLAUDE:   ui_refresh_provider(PROVIDER_CLAUDE);   break;
    case SCREEN_OPENAI:   ui_refresh_provider(PROVIDER_OPENAI);   break;
    case SCREEN_DEEPSEEK: ui_refresh_provider(PROVIDER_DEEPSEEK); break;
    case SCREEN_OLLAMA:   ui_refresh_provider(PROVIDER_OLLAMA);   break;
    case SCREEN_LMSTUDIO: ui_refresh_provider(PROVIDER_LMSTUDIO); break;
    case SCREEN_TASKS:    ui_refresh_tasks();                      break;
    default: break;
    }
}

void ui_on_ble_changed(bool connected) {
    if (!s_ble_dot) return;
    lv_color_t col = connected ? lv_color_hex(0x4ade80) : lv_color_hex(0xf87171);
    lv_obj_set_style_bg_color(s_ble_dot, col, 0);
}
