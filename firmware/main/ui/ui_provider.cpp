// Per-provider full screen (reused for all 5 providers).
// Layout (480x480):
//   [0–36]   status bar (built by ui_main)
//   [37–56]  provider name + connection badge + refresh dot
//   [57–220] mascot canvas (128x128) + provider colour accent
//   [221–300] session % bar + label
//   [301–360] period % bar + label
//   [361–430] stats row: cost | reset | model
//   [431–460] nav dots (built by ui_main)

#include "ui_main.h"
#include "../config.h"
#include "../providers.h"
#include "../mascots/mascots.h"
#include <stdio.h>
#include <string.h>

// Per-provider widget references (5 sets)
typedef struct {
    lv_obj_t *provider_label;
    lv_obj_t *badge;
    lv_obj_t *mascot_canvas;
    lv_color_t canvas_buf[128 * 128];
    lv_obj_t *session_bar;
    lv_obj_t *session_label;
    lv_obj_t *period_bar;
    lv_obj_t *period_label;
    lv_obj_t *cost_val;
    lv_obj_t *reset_val;
    lv_obj_t *model_val;
    lv_obj_t *error_label;
    lv_obj_t *connected_group;   // shown when connected
    lv_obj_t *offline_group;     // shown when offline
    lv_timer_t *anim_timer;
    uint8_t anim_frame;
    provider_id_t id;
} provider_screen_t;

static provider_screen_t s_pscr[PROVIDER_COUNT];

// ── Colour for a % value ──────────────────────────────────────────────────────
static lv_color_t bar_color(uint8_t pct) {
    if (pct >= 80) return lv_color_hex(0xef4444);
    if (pct >= 60) return lv_color_hex(0xf97316);
    if (pct >= 40) return lv_color_hex(0xeab308);
    return lv_color_hex(0x22c55e);
}

// ── Mascot animation timer ────────────────────────────────────────────────────
static void mascot_anim_cb(lv_timer_t *timer) {
    provider_screen_t *ps = (provider_screen_t *)lv_timer_get_user_data(timer);
    ps->anim_frame = (ps->anim_frame + 1) & 3;
    mascot_state_t st = mascot_state_for(&g_state.providers[ps->id]);
    mascot_draw(ps->mascot_canvas, ps->id, st, ps->anim_frame);
}

// ── Build ─────────────────────────────────────────────────────────────────────
void ui_build_provider(lv_obj_t *parent, provider_id_t id) {
    provider_screen_t *ps = &s_pscr[id];
    ps->id = id;
    ps->anim_frame = 0;

    const provider_meta_t *meta = &PROVIDER_META[id];
    lv_color_t accent = lv_color_hex(meta->color);

    // ── Provider name header ──────────────────────────────────────────────────
    lv_obj_t *hdr = lv_obj_create(parent);
    lv_obj_set_size(hdr, DISPLAY_WIDTH, 40);
    lv_obj_set_pos(hdr, 0, 38);
    lv_obj_set_style_bg_color(hdr, lv_color_hex(0x1a1a2e), 0);
    lv_obj_set_style_border_width(hdr, 0, 0);
    lv_obj_set_style_border_side(hdr, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(hdr, lv_color_hex(meta->color), LV_PART_MAIN);
    lv_obj_set_style_border_width(hdr, 3, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_clear_flag(hdr, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *name = lv_label_create(hdr);
    lv_label_set_text(name, meta->name);
    lv_obj_set_style_text_color(name, lv_color_hex(0xe2e8f0), 0);
    lv_obj_set_style_text_font(name, &lv_font_montserrat_18, 0);
    lv_obj_align(name, LV_ALIGN_LEFT_MID, 12, 0);
    ps->provider_label = name;

    lv_obj_t *badge = lv_label_create(hdr);
    lv_label_set_text(badge, "OFFLINE");
    lv_obj_set_style_text_color(badge, lv_color_hex(0xf87171), 0);
    lv_obj_set_style_text_font(badge, &lv_font_montserrat_12, 0);
    lv_obj_align(badge, LV_ALIGN_RIGHT_MID, -12, 0);
    ps->badge = badge;

    // ── Mascot canvas (128x128) ────────────────────────────────────────────────
    lv_obj_t *mascot_bg = lv_obj_create(parent);
    lv_obj_set_size(mascot_bg, 164, 164);
    lv_obj_set_pos(mascot_bg, (DISPLAY_WIDTH - 164) / 2, 82);
    lv_obj_set_style_bg_color(mascot_bg, lv_color_hex(0x1a1a2e), 0);
    lv_obj_set_style_border_color(mascot_bg, accent, 0);
    lv_obj_set_style_border_width(mascot_bg, 2, 0);
    lv_obj_set_style_radius(mascot_bg, 16, 0);
    lv_obj_clear_flag(mascot_bg, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *canvas = lv_canvas_create(mascot_bg);
    lv_canvas_set_buffer(canvas, ps->canvas_buf, 128, 128, LV_COLOR_FORMAT_RGB565);
    lv_obj_align(canvas, LV_ALIGN_CENTER, 0, 0);
    ps->mascot_canvas = canvas;

    // Draw initial frame
    mascot_draw(canvas, id, MASCOT_OFFLINE, 0);

    // Animation timer (600ms default)
    ps->anim_timer = lv_timer_create(mascot_anim_cb, 600, ps);

    // ── Session usage bar ──────────────────────────────────────────────────────
    lv_obj_t *s_lbl = lv_label_create(parent);
    lv_label_set_text(s_lbl, "Session  0%");
    lv_obj_set_style_text_color(s_lbl, lv_color_hex(0x94a3b8), 0);
    lv_obj_set_style_text_font(s_lbl, &lv_font_montserrat_12, 0);
    lv_obj_set_pos(s_lbl, 16, 252);
    ps->session_label = s_lbl;

    lv_obj_t *s_track = lv_obj_create(parent);
    lv_obj_set_size(s_track, DISPLAY_WIDTH - 32, 14);
    lv_obj_set_pos(s_track, 16, 270);
    lv_obj_set_style_bg_color(s_track, lv_color_hex(0x2a2a4a), 0);
    lv_obj_set_style_border_width(s_track, 0, 0);
    lv_obj_set_style_radius(s_track, 7, 0);
    lv_obj_clear_flag(s_track, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *s_fill = lv_obj_create(s_track);
    lv_obj_set_size(s_fill, 0, 14);
    lv_obj_set_pos(s_fill, 0, 0);
    lv_obj_set_style_bg_color(s_fill, bar_color(0), 0);
    lv_obj_set_style_border_width(s_fill, 0, 0);
    lv_obj_set_style_radius(s_fill, 7, 0);
    ps->session_bar = s_fill;

    // ── Period usage bar ───────────────────────────────────────────────────────
    lv_obj_t *p_lbl = lv_label_create(parent);
    lv_label_set_text(p_lbl, "Period  0%");
    lv_obj_set_style_text_color(p_lbl, lv_color_hex(0x94a3b8), 0);
    lv_obj_set_style_text_font(p_lbl, &lv_font_montserrat_12, 0);
    lv_obj_set_pos(p_lbl, 16, 294);
    ps->period_label = p_lbl;

    lv_obj_t *p_track = lv_obj_create(parent);
    lv_obj_set_size(p_track, DISPLAY_WIDTH - 32, 14);
    lv_obj_set_pos(p_track, 16, 312);
    lv_obj_set_style_bg_color(p_track, lv_color_hex(0x2a2a4a), 0);
    lv_obj_set_style_border_width(p_track, 0, 0);
    lv_obj_set_style_radius(p_track, 7, 0);
    lv_obj_clear_flag(p_track, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *p_fill = lv_obj_create(p_track);
    lv_obj_set_size(p_fill, 0, 14);
    lv_obj_set_pos(p_fill, 0, 0);
    lv_obj_set_style_bg_color(p_fill, bar_color(0), 0);
    lv_obj_set_style_border_width(p_fill, 0, 0);
    lv_obj_set_style_radius(p_fill, 7, 0);
    ps->period_bar = p_fill;

    // ── Stats row ──────────────────────────────────────────────────────────────
    int stat_y = 338;
    int col_w  = (DISPLAY_WIDTH - 32) / 3;

    const char *stat_lbl[3] = { "Cost (session)", "Rate limit reset", "Active model" };
    lv_obj_t **stat_vals[3] = { &ps->cost_val, &ps->reset_val, &ps->model_val };

    for (int i = 0; i < 3; i++) {
        lv_obj_t *box = lv_obj_create(parent);
        lv_obj_set_size(box, col_w - 4, 70);
        lv_obj_set_pos(box, 16 + i * col_w, stat_y);
        lv_obj_set_style_bg_color(box, lv_color_hex(0x16213e), 0);
        lv_obj_set_style_border_width(box, 0, 0);
        lv_obj_set_style_radius(box, 8, 0);
        lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_t *lbl = lv_label_create(box);
        lv_label_set_text(lbl, stat_lbl[i]);
        lv_obj_set_style_text_color(lbl, lv_color_hex(0x94a3b8), 0);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_10, 0);
        lv_obj_align(lbl, LV_ALIGN_TOP_LEFT, 6, 6);

        lv_obj_t *val = lv_label_create(box);
        lv_label_set_text(val, "—");
        lv_obj_set_style_text_color(val, lv_color_hex(0xe2e8f0), 0);
        lv_obj_set_style_text_font(val, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_opa(val, LV_OPA_COVER, 0);
        lv_obj_align(val, LV_ALIGN_BOTTOM_LEFT, 6, -6);
        lv_label_set_long_mode(val, LV_LABEL_LONG_CLIP);
        lv_obj_set_width(val, col_w - 16);
        *stat_vals[i] = val;
    }

    // ── Offline error label ────────────────────────────────────────────────────
    lv_obj_t *err = lv_label_create(parent);
    lv_label_set_text(err, "Not configured");
    lv_obj_set_style_text_color(err, lv_color_hex(0x94a3b8), 0);
    lv_obj_set_style_text_font(err, &lv_font_montserrat_14, 0);
    lv_obj_set_pos(err, 0, 420);
    lv_obj_set_width(err, DISPLAY_WIDTH);
    lv_obj_set_style_text_align(err, LV_TEXT_ALIGN_CENTER, 0);
    ps->error_label = err;
}

// ── Refresh ────────────────────────────────────────────────────────────────────
void ui_refresh_provider(provider_id_t id) {
    provider_screen_t *ps = &s_pscr[id];
    const provider_state_t *st = &g_state.providers[id];
    char buf[64];

    // Badge + badge colour
    if (st->connected) {
        lv_label_set_text(ps->badge, "CONNECTED");
        lv_obj_set_style_text_color(ps->badge, lv_color_hex(0x4ade80), 0);
    } else {
        lv_label_set_text(ps->badge, st->error[0] ? "ERROR" : "OFFLINE");
        lv_obj_set_style_text_color(ps->badge, lv_color_hex(0xf87171), 0);
    }

    // Session bar
    int sw = ((DISPLAY_WIDTH - 32) * st->session_pct) / 100;
    lv_obj_set_width(ps->session_bar, sw);
    lv_obj_set_style_bg_color(ps->session_bar, bar_color(st->session_pct), 0);
    snprintf(buf, sizeof(buf), "Session  %d%%  (%s / %s tokens)",
             st->session_pct,
             st->tokens_used >= 1000000 ? "—" : (st->tokens_used >= 1000 ?
                 (snprintf(buf, sizeof(buf), "%.1fk", st->tokens_used/1000.0), buf) :
                 (snprintf(buf, sizeof(buf), "%lu", (unsigned long)st->tokens_used), buf)),
             st->tokens_limit > 0 ? "—" : "—");
    // Simplified label
    snprintf(buf, sizeof(buf), "Session  %d%%", st->session_pct);
    lv_label_set_text(ps->session_label, buf);

    // Period bar
    int pw = ((DISPLAY_WIDTH - 32) * st->period_pct) / 100;
    lv_obj_set_width(ps->period_bar, pw);
    lv_obj_set_style_bg_color(ps->period_bar, bar_color(st->period_pct), 0);
    snprintf(buf, sizeof(buf), "Period  %d%%", st->period_pct);
    lv_label_set_text(ps->period_label, buf);

    // Cost
    if (st->cost_session < 0.01f)
        snprintf(buf, sizeof(buf), "$0.00");
    else
        snprintf(buf, sizeof(buf), "$%.2f", st->cost_session);
    lv_label_set_text(ps->cost_val, buf);

    // Reset timer
    if (st->reset_min <= 0)
        snprintf(buf, sizeof(buf), "—");
    else if (st->reset_min >= 60)
        snprintf(buf, sizeof(buf), "%dh%dm", st->reset_min/60, st->reset_min%60);
    else
        snprintf(buf, sizeof(buf), "%dm", st->reset_min);
    lv_label_set_text(ps->reset_val, buf);

    // Model
    lv_label_set_text(ps->model_val, st->active_model[0] ? st->active_model : "—");

    // Error
    lv_label_set_text(ps->error_label, st->error[0] ? st->error : "");

    // Mascot animation speed
    mascot_state_t mst = mascot_state_for(st);
    uint32_t rate = (mst == MASCOT_EXCITED) ? 150 :
                    (mst == MASCOT_THINKING) ? 300 :
                    (mst == MASCOT_SLEEPING) ? 1200 : 600;
    lv_timer_set_period(ps->anim_timer, rate);
    mascot_draw(ps->mascot_canvas, id, mst, ps->anim_frame);
}
