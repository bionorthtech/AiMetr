// "All providers" overview screen — 5 mini-tiles in a 3+2 grid.
// Each tile shows: mascot thumbnail, provider name, connection dot, session bar.

#include "ui_main.h"
#include "../config.h"
#include "../providers.h"
#include "../mascots/mascots.h"
#include <stdio.h>

// Tile widget references
typedef struct {
    lv_obj_t *dot;
    lv_obj_t *session_bar;
    lv_obj_t *pct_label;
    lv_obj_t *mascot_canvas;
    lv_color_t canvas_buf[64 * 64];
    lv_timer_t *anim_timer;
    uint8_t frame;
    provider_id_t id;
} mini_tile_t;

static mini_tile_t s_tiles[PROVIDER_COUNT];

// ── Tile animation ─────────────────────────────────────────────────────────────
static void tile_anim_cb(lv_timer_t *t) {
    mini_tile_t *tile = (mini_tile_t *)lv_timer_get_user_data(t);
    tile->frame = (tile->frame + 1) & 3;
    mascot_state_t mst = mascot_state_for(&g_state.providers[tile->id]);
    mascot_draw(tile->mascot_canvas, tile->id, mst, tile->frame);
}

// ── Build ─────────────────────────────────────────────────────────────────────
void ui_build_overview(lv_obj_t *parent) {
    // 3 tiles top row, 2 centred bottom row
    // Tile: 140x160, gap 10
    int tile_w = 140, tile_h = 160, gap = 10;
    int row1_x[3] = { 10, 10+tile_w+gap, 10+2*(tile_w+gap) };
    int row1_y = 48;
    int row2_x[2] = { (DISPLAY_WIDTH - 2*tile_w - gap) / 2,
                      (DISPLAY_WIDTH - 2*tile_w - gap) / 2 + tile_w + gap };
    int row2_y = row1_y + tile_h + gap;

    int tile_x[5], tile_y[5];
    for (int i = 0; i < 3; i++) { tile_x[i] = row1_x[i]; tile_y[i] = row1_y; }
    tile_x[3] = row2_x[0]; tile_y[3] = row2_y;
    tile_x[4] = row2_x[1]; tile_y[4] = row2_y;

    for (int i = 0; i < PROVIDER_COUNT; i++) {
        mini_tile_t *tile = &s_tiles[i];
        tile->id    = (provider_id_t)i;
        tile->frame = 0;
        const provider_meta_t *meta = &PROVIDER_META[i];

        // Tile background
        lv_obj_t *box = lv_obj_create(parent);
        lv_obj_set_size(box, tile_w, tile_h);
        lv_obj_set_pos(box, tile_x[i], tile_y[i]);
        lv_obj_set_style_bg_color(box, lv_color_hex(0x1a1a2e), 0);
        lv_obj_set_style_border_color(box, lv_color_hex(meta->color), 0);
        lv_obj_set_style_border_width(box, 2, 0);
        lv_obj_set_style_border_side(box, LV_BORDER_SIDE_LEFT, 0);
        lv_obj_set_style_radius(box, 10, 0);
        lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);

        // Mascot canvas (64x64)
        lv_obj_t *canvas = lv_canvas_create(box);
        lv_canvas_set_buffer(canvas, tile->canvas_buf, 64, 64, LV_COLOR_FORMAT_RGB565);
        lv_obj_align(canvas, LV_ALIGN_TOP_MID, 0, 8);
        tile->mascot_canvas = canvas;
        mascot_draw(canvas, (provider_id_t)i, MASCOT_OFFLINE, 0);

        // Provider short name
        lv_obj_t *name = lv_label_create(box);
        lv_label_set_text(name, meta->short_name);
        lv_obj_set_style_text_color(name, lv_color_hex(meta->color), 0);
        lv_obj_set_style_text_font(name, &lv_font_montserrat_10, 0);
        lv_obj_align(name, LV_ALIGN_TOP_LEFT, 6, 6);

        // Connection dot
        lv_obj_t *dot = lv_obj_create(box);
        lv_obj_set_size(dot, 8, 8);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_border_width(dot, 0, 0);
        lv_obj_set_style_bg_color(dot, lv_color_hex(0xf87171), 0); // offline
        lv_obj_align(dot, LV_ALIGN_TOP_RIGHT, -6, 6);
        tile->dot = dot;

        // Session % label
        lv_obj_t *pct = lv_label_create(box);
        lv_label_set_text(pct, "0%");
        lv_obj_set_style_text_color(pct, lv_color_hex(0xe2e8f0), 0);
        lv_obj_set_style_text_font(pct, &lv_font_montserrat_16, 0);
        lv_obj_align(pct, LV_ALIGN_BOTTOM_MID, 0, -28);
        tile->pct_label = pct;

        // Session bar track
        lv_obj_t *track = lv_obj_create(box);
        lv_obj_set_size(track, tile_w - 16, 8);
        lv_obj_align(track, LV_ALIGN_BOTTOM_MID, 0, -12);
        lv_obj_set_style_bg_color(track, lv_color_hex(0x2a2a4a), 0);
        lv_obj_set_style_border_width(track, 0, 0);
        lv_obj_set_style_radius(track, 4, 0);
        lv_obj_clear_flag(track, LV_OBJ_FLAG_SCROLLABLE);

        lv_obj_t *fill = lv_obj_create(track);
        lv_obj_set_size(fill, 0, 8);
        lv_obj_set_pos(fill, 0, 0);
        lv_obj_set_style_bg_color(fill, lv_color_hex(0x22c55e), 0);
        lv_obj_set_style_border_width(fill, 0, 0);
        lv_obj_set_style_radius(fill, 4, 0);
        tile->session_bar = fill;

        // Animation timer
        tile->anim_timer = lv_timer_create(tile_anim_cb, 700, tile);
    }
}

// ── Refresh ────────────────────────────────────────────────────────────────────
void ui_refresh_overview(void) {
    for (int i = 0; i < PROVIDER_COUNT; i++) {
        mini_tile_t *tile = &s_tiles[i];
        const provider_state_t *st = &g_state.providers[i];
        char buf[16];

        // Connection dot
        lv_color_t dcol = st->connected ? lv_color_hex(0x4ade80) : lv_color_hex(0xf87171);
        lv_obj_set_style_bg_color(tile->dot, dcol, 0);

        // Session bar
        int fw = ((140 - 16) * st->session_pct) / 100;
        lv_obj_set_width(tile->session_bar, fw);
        if (st->session_pct >= 80)
            lv_obj_set_style_bg_color(tile->session_bar, lv_color_hex(0xef4444), 0);
        else if (st->session_pct >= 60)
            lv_obj_set_style_bg_color(tile->session_bar, lv_color_hex(0xf97316), 0);
        else if (st->session_pct >= 40)
            lv_obj_set_style_bg_color(tile->session_bar, lv_color_hex(0xeab308), 0);
        else
            lv_obj_set_style_bg_color(tile->session_bar, lv_color_hex(0x22c55e), 0);

        // Pct label
        snprintf(buf, sizeof(buf), "%d%%", st->session_pct);
        lv_label_set_text(tile->pct_label, buf);

        // Mascot
        mascot_state_t mst = mascot_state_for(st);
        mascot_draw(tile->mascot_canvas, (provider_id_t)i, mst, tile->frame);
    }
}
