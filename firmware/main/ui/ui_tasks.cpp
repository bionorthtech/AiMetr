// Task progress screen — shows up to 8 active AI sessions.
// Each task card: label, model tag, token progress bar, elapsed time.

#include "ui_main.h"
#include "../config.h"
#include "../providers.h"
#include <stdio.h>
#include <string.h>

#define TASK_CARD_H  52
#define TASK_MAX_VIS  6   // visible cards (rest scroll)

static lv_obj_t *s_scroll_view = NULL;
static lv_obj_t *s_empty_label = NULL;
static lv_obj_t *s_task_cards[MAX_TASKS] = {};

typedef struct {
    lv_obj_t *label;
    lv_obj_t *model_tag;
    lv_obj_t *bar_fill;
    lv_obj_t *pct_lbl;
    lv_obj_t *meta_lbl;
} task_card_t;

static task_card_t s_cards[MAX_TASKS];

static const lv_color_t PROV_COLORS[PROVIDER_COUNT] = {
    {0}, // filled at runtime from PROVIDER_META
};

void ui_build_tasks(lv_obj_t *parent) {
    // Section title
    lv_obj_t *title = lv_label_create(parent);
    lv_label_set_text(title, "ACTIVE TASKS");
    lv_obj_set_style_text_color(title, lv_color_hex(0x94a3b8), 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_12, 0);
    lv_obj_set_pos(title, 16, 44);

    // Scrollable container
    lv_obj_t *scv = lv_obj_create(parent);
    lv_obj_set_size(scv, DISPLAY_WIDTH - 16, DISPLAY_HEIGHT - 80);
    lv_obj_set_pos(scv, 8, 62);
    lv_obj_set_style_bg_color(scv, lv_color_hex(0x0f0f1a), 0);
    lv_obj_set_style_border_width(scv, 0, 0);
    lv_obj_set_style_pad_all(scv, 0, 0);
    lv_obj_set_flex_flow(scv, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(scv, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    s_scroll_view = scv;

    // Empty state label
    lv_obj_t *empty = lv_label_create(parent);
    lv_label_set_text(empty, "💤  No active sessions");
    lv_obj_set_style_text_color(empty, lv_color_hex(0x94a3b8), 0);
    lv_obj_set_style_text_font(empty, &lv_font_montserrat_16, 0);
    lv_obj_align(empty, LV_ALIGN_CENTER, 0, 0);
    s_empty_label = empty;

    // Pre-create task cards (hidden by default)
    for (int i = 0; i < MAX_TASKS; i++) {
        lv_obj_t *card = lv_obj_create(scv);
        lv_obj_set_size(card, DISPLAY_WIDTH - 32, TASK_CARD_H);
        lv_obj_set_style_bg_color(card, lv_color_hex(0x1a1a2e), 0);
        lv_obj_set_style_border_color(card, lv_color_hex(0x2a2a4a), 0);
        lv_obj_set_style_border_width(card, 1, 0);
        lv_obj_set_style_radius(card, 8, 0);
        lv_obj_set_style_margin_bottom(card, 6, 0);
        lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(card, LV_OBJ_FLAG_HIDDEN);
        s_task_cards[i] = card;

        // Task label
        lv_obj_t *lbl = lv_label_create(card);
        lv_label_set_text(lbl, "");
        lv_label_set_long_mode(lbl, LV_LABEL_LONG_DOT);
        lv_obj_set_width(lbl, DISPLAY_WIDTH - 110);
        lv_obj_set_style_text_color(lbl, lv_color_hex(0xe2e8f0), 0);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_12, 0);
        lv_obj_set_pos(lbl, 8, 6);
        s_cards[i].label = lbl;

        // Model tag
        lv_obj_t *tag = lv_label_create(card);
        lv_label_set_text(tag, "");
        lv_obj_set_style_text_color(tag, lv_color_hex(0x94a3b8), 0);
        lv_obj_set_style_text_font(tag, &lv_font_montserrat_10, 0);
        lv_obj_align(tag, LV_ALIGN_TOP_RIGHT, -8, 6);
        s_cards[i].model_tag = tag;

        // Progress bar track
        lv_obj_t *track = lv_obj_create(card);
        lv_obj_set_size(track, DISPLAY_WIDTH - 50, 6);
        lv_obj_set_pos(track, 8, 30);
        lv_obj_set_style_bg_color(track, lv_color_hex(0x2a2a4a), 0);
        lv_obj_set_style_border_width(track, 0, 0);
        lv_obj_set_style_radius(track, 3, 0);
        lv_obj_clear_flag(track, LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_t *fill = lv_obj_create(track);
        lv_obj_set_size(fill, 0, 6);
        lv_obj_set_pos(fill, 0, 0);
        lv_obj_set_style_bg_color(fill, lv_color_hex(0x4ade80), 0);
        lv_obj_set_style_border_width(fill, 0, 0);
        lv_obj_set_style_radius(fill, 3, 0);
        s_cards[i].bar_fill = fill;

        // Pct label
        lv_obj_t *pct = lv_label_create(card);
        lv_label_set_text(pct, "0%");
        lv_obj_align(pct, LV_ALIGN_BOTTOM_RIGHT, -8, -6);
        lv_obj_set_style_text_color(pct, lv_color_hex(0x94a3b8), 0);
        lv_obj_set_style_text_font(pct, &lv_font_montserrat_10, 0);
        s_cards[i].pct_lbl = pct;

        // Meta (token counts)
        lv_obj_t *meta = lv_label_create(card);
        lv_label_set_text(meta, "");
        lv_obj_set_pos(meta, 8, 40);
        lv_obj_set_style_text_color(meta, lv_color_hex(0x94a3b8), 0);
        lv_obj_set_style_text_font(meta, &lv_font_montserrat_10, 0);
        s_cards[i].meta_lbl = meta;
    }
}

void ui_refresh_tasks(void) {
    int n = g_state.task_count;

    lv_obj_set_flag(s_empty_label, n == 0 ? LV_OBJ_FLAG_DEFAULT : LV_OBJ_FLAG_HIDDEN);

    for (int i = 0; i < MAX_TASKS; i++) {
        if (i >= n) {
            lv_obj_add_flag(s_task_cards[i], LV_OBJ_FLAG_HIDDEN);
            continue;
        }
        lv_obj_clear_flag(s_task_cards[i], LV_OBJ_FLAG_HIDDEN);

        const task_t *t = &g_state.tasks[i];
        uint32_t total = t->tokens_in + t->tokens_out;
        uint8_t pct = (t->tokens_limit > 0)
            ? (uint8_t)((total * 100UL) / t->tokens_limit)
            : 0;
        if (pct > 100) pct = 100;

        // Label
        lv_label_set_text(s_cards[i].label, t->label[0] ? t->label : "Unnamed task");

        // Model tag
        lv_label_set_text(s_cards[i].model_tag, t->model);

        // Progress bar
        int bw = ((DISPLAY_WIDTH - 50) * pct) / 100;
        lv_obj_set_width(s_cards[i].bar_fill, bw);
        lv_color_t fc = (pct >= 80) ? lv_color_hex(0xef4444) :
                        (pct >= 60) ? lv_color_hex(0xf97316) :
                        (pct >= 40) ? lv_color_hex(0xeab308) :
                                      lv_color_hex(0x4ade80);
        lv_obj_set_style_bg_color(s_cards[i].bar_fill, fc, 0);

        // Pct label
        char buf[16];
        snprintf(buf, sizeof(buf), "%d%%", pct);
        lv_label_set_text(s_cards[i].pct_lbl, buf);

        // Meta: token count
        if (total >= 1000000)
            snprintf(buf, sizeof(buf), "%.1fM tok", total / 1000000.0);
        else if (total >= 1000)
            snprintf(buf, sizeof(buf), "%.1fk tok", total / 1000.0);
        else
            snprintf(buf, sizeof(buf), "%lu tok", (unsigned long)total);
        lv_label_set_text(s_cards[i].meta_lbl, buf);

        // Left-border provider colour
        lv_obj_set_style_border_color(
            s_task_cards[i],
            lv_color_hex(PROVIDER_META[t->provider].color),
            0);
        lv_obj_set_style_border_side(s_task_cards[i], LV_BORDER_SIDE_LEFT, 0);
        lv_obj_set_style_border_width(s_task_cards[i], 3, 0);
    }
}
