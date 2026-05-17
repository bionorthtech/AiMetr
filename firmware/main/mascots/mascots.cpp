// Mascot renderer — draws provider characters using LVGL drawing primitives.
// Each mascot is composed of basic shapes (circles, rounded rects, lines)
// so no external image files are needed. Animation is achieved by varying
// position / opacity / scale across 4 frames driven by a timer.
//
// Visual identity per provider:
//   Claude    – orange cat face (round head, cat ears, orange/warm palette)
//   OpenAI    – green swirl / brain orb (Codex / GPT logo style)
//   DeepSeek  – blue whale / deep-sea fish with glowing eyes
//   Ollama    – golden llama face (fluffy, big eyes)
//   LM Studio – purple robot head (boxy, antenna, LED eyes)

#include "mascots.h"
#include <math.h>

// ── Colour helpers ────────────────────────────────────────────────────────────
static lv_color_t rgb(uint8_t r, uint8_t g, uint8_t b) {
    return lv_color_make(r, g, b);
}

static void clear_canvas(lv_obj_t *canvas, lv_color_t bg) {
    lv_canvas_fill_bg(canvas, bg, LV_OPA_COVER);
}

// ── Shared draw primitives ────────────────────────────────────────────────────
static void draw_circle(lv_obj_t *canvas, int cx, int cy, int r, lv_color_t col) {
    lv_draw_arc_dsc_t dsc;
    lv_draw_arc_dsc_init(&dsc);
    dsc.color      = col;
    dsc.width      = r; // solid fill via full-width arc
    dsc.start_angle = 0;
    dsc.end_angle   = 360;
    lv_canvas_draw_arc(canvas, cx, cy, r, 0, 360, &dsc);
}

static void draw_rect(lv_obj_t *canvas, int x, int y, int w, int h,
                      lv_color_t col, int radius) {
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color  = col;
    dsc.radius    = radius;
    dsc.bg_opa    = LV_OPA_COVER;
    lv_area_t area = { (lv_coord_t)x, (lv_coord_t)y,
                       (lv_coord_t)(x+w-1), (lv_coord_t)(y+h-1) };
    lv_canvas_draw_rect(canvas, area.x1, area.y1, w, h, &dsc);
}

// ── Claude – orange cat ───────────────────────────────────────────────────────
static void draw_claude(lv_obj_t *canvas, mascot_state_t state, uint8_t frame) {
    const lv_color_t bg     = rgb(15, 15, 26);
    const lv_color_t orange = rgb(204, 120, 92);
    const lv_color_t peach  = rgb(230, 160, 130);
    const lv_color_t dark   = rgb(80, 40, 30);
    const lv_color_t white  = rgb(230, 220, 215);
    const lv_color_t pink   = rgb(255, 180, 160);
    clear_canvas(canvas, bg);

    // Bob animation (idle/excited)
    int bob = 0;
    if (state == MASCOT_IDLE)    bob = (frame % 2 == 0) ? 0 : 2;
    if (state == MASCOT_EXCITED) bob = (frame % 2 == 0) ? -3 : 3;

    int cx = 64, cy = 68 + bob;

    // Ears (triangles approximated with rects)
    draw_rect(canvas, cx-30, cy-38, 18, 20, orange, 4); // left ear
    draw_rect(canvas, cx+12, cy-38, 18, 20, orange, 4); // right ear
    draw_rect(canvas, cx-26, cy-34, 10, 13, pink, 2);   // inner left
    draw_rect(canvas, cx+16, cy-34, 10, 13, pink, 2);   // inner right

    // Head
    draw_circle(canvas, cx, cy, 36, orange);

    // Face markings
    draw_circle(canvas, cx, cy+6, 22, peach);

    // Eyes
    if (state == MASCOT_SLEEPING) {
        // Closed eyes (lines)
        lv_draw_line_dsc_t ld; lv_draw_line_dsc_init(&ld);
        ld.color = dark; ld.width = 3;
        lv_point_t p1 = {(lv_coord_t)(cx-18), (lv_coord_t)(cy-8)};
        lv_point_t p2 = {(lv_coord_t)(cx-8),  (lv_coord_t)(cy-8)};
        lv_canvas_draw_line(canvas, &p1, 2, &ld);
        p1.x = cx+8; p2.x = cx+18;
        lv_canvas_draw_line(canvas, &p1, 2, &ld);
    } else {
        int eye_open = (state == MASCOT_THINKING && frame % 4 == 3) ? 4 : 8;
        draw_circle(canvas, cx-14, cy-8, eye_open, dark);
        draw_circle(canvas, cx+14, cy-8, eye_open, dark);
        draw_circle(canvas, cx-12, cy-10, 3, white); // shine
        draw_circle(canvas, cx+16, cy-10, 3, white);
        if (state == MASCOT_EXCITED) {
            draw_circle(canvas, cx-14, cy-8, 10, dark); // big eyes
            draw_circle(canvas, cx+14, cy-8, 10, dark);
        }
    }

    // Nose
    draw_circle(canvas, cx, cy+2, 4, pink);

    // Whiskers
    lv_draw_line_dsc_t ld; lv_draw_line_dsc_init(&ld);
    ld.color = dark; ld.width = 1;
    lv_point_t wl1[2] = {{(lv_coord_t)(cx-28),(lv_coord_t)(cy+4)},{(lv_coord_t)(cx-8),(lv_coord_t)(cy+2)}};
    lv_point_t wl2[2] = {{(lv_coord_t)(cx-28),(lv_coord_t)(cy+8)},{(lv_coord_t)(cx-8),(lv_coord_t)(cy+6)}};
    lv_point_t wr1[2] = {{(lv_coord_t)(cx+8),(lv_coord_t)(cy+2)},{(lv_coord_t)(cx+28),(lv_coord_t)(cy+4)}};
    lv_point_t wr2[2] = {{(lv_coord_t)(cx+8),(lv_coord_t)(cy+6)},{(lv_coord_t)(cx+28),(lv_coord_t)(cy+8)}};
    lv_canvas_draw_line(canvas, wl1, 2, &ld);
    lv_canvas_draw_line(canvas, wl2, 2, &ld);
    lv_canvas_draw_line(canvas, wr1, 2, &ld);
    lv_canvas_draw_line(canvas, wr2, 2, &ld);

    // Thinking: spinning dots above head
    if (state == MASCOT_THINKING) {
        float angle = (frame * 90.0f) * (3.14159f / 180.0f);
        for (int i = 0; i < 3; i++) {
            float a = angle + i * (2.0f * 3.14159f / 3.0f);
            int dx = (int)(cosf(a) * 14);
            int dy = (int)(sinf(a) * 8);
            draw_circle(canvas, cx+dx, cy-50+dy, 4, orange);
        }
    }

    // Offline: greyed out X
    if (state == MASCOT_OFFLINE) {
        lv_draw_line_dsc_t xd; lv_draw_line_dsc_init(&xd);
        xd.color = rgb(100,100,100); xd.width = 4;
        lv_point_t x1[2] = {{(lv_coord_t)(cx-20),(lv_coord_t)(cy-20)},{(lv_coord_t)(cx+20),(lv_coord_t)(cy+20)}};
        lv_point_t x2[2] = {{(lv_coord_t)(cx+20),(lv_coord_t)(cy-20)},{(lv_coord_t)(cx-20),(lv_coord_t)(cy+20)}};
        lv_canvas_draw_line(canvas, x1, 2, &xd);
        lv_canvas_draw_line(canvas, x2, 2, &xd);
    }
}

// ── OpenAI – green swirl orb (Codex/GPT) ─────────────────────────────────────
static void draw_openai(lv_obj_t *canvas, mascot_state_t state, uint8_t frame) {
    const lv_color_t bg    = rgb(15, 15, 26);
    const lv_color_t green = rgb(16, 163, 127);
    const lv_color_t lime  = rgb(100, 220, 170);
    const lv_color_t dark  = rgb(8, 80, 60);
    clear_canvas(canvas, bg);

    int cy_off = 0;
    if (state == MASCOT_IDLE)    cy_off = (frame % 2) ? 2 : -2;
    if (state == MASCOT_EXCITED) cy_off = (frame % 2) ? -4 : 4;

    int cx = 64, cy = 64 + cy_off;

    // Outer glow rings (semi-transparent)
    lv_draw_arc_dsc_t ad; lv_draw_arc_dsc_init(&ad);
    ad.color = dark; ad.width = 4;
    int ring_r = 42 + (state == MASCOT_EXCITED ? frame % 3 * 2 : 0);
    lv_canvas_draw_arc(canvas, cx, cy, ring_r, 0, 360, &ad);
    ad.color = green; ad.width = 2;
    lv_canvas_draw_arc(canvas, cx, cy, ring_r - 8, 0, 360, &ad);

    // Core orb
    draw_circle(canvas, cx, cy, 30, green);
    draw_circle(canvas, cx, cy, 24, lime);
    draw_circle(canvas, cx, cy, 14, green);

    // Swirl lines
    lv_draw_arc_dsc_t sd; lv_draw_arc_dsc_init(&sd);
    sd.color = dark; sd.width = 3;
    int swirl_start = frame * 45;
    lv_canvas_draw_arc(canvas, cx, cy, 18, swirl_start, swirl_start + 180, &sd);
    lv_canvas_draw_arc(canvas, cx, cy, 10, swirl_start + 90, swirl_start + 270, &sd);

    // Eyes (two teal dots)
    if (state != MASCOT_SLEEPING && state != MASCOT_OFFLINE) {
        draw_circle(canvas, cx-9, cy-4, 5, dark);
        draw_circle(canvas, cx+9, cy-4, 5, dark);
        draw_circle(canvas, cx-7, cy-6, 2, lime);
        draw_circle(canvas, cx+11, cy-6, 2, lime);
    }

    if (state == MASCOT_THINKING) {
        for (int i = 0; i < 4; i++) {
            float a = (frame * 90.0f + i * 90.0f) * 3.14159f / 180.0f;
            draw_circle(canvas, cx + (int)(cosf(a)*36), cy + (int)(sinf(a)*36), 3, lime);
        }
    }
}

// ── DeepSeek – blue whale / glowing fish ──────────────────────────────────────
static void draw_deepseek(lv_obj_t *canvas, mascot_state_t state, uint8_t frame) {
    const lv_color_t bg       = rgb(15, 15, 26);
    const lv_color_t deep     = rgb(83, 106, 230);
    const lv_color_t sky      = rgb(130, 160, 255);
    const lv_color_t glowcyan = rgb(100, 220, 255);
    clear_canvas(canvas, bg);

    int bob = 0;
    if (state == MASCOT_IDLE)    bob = (frame % 2) ? 0 : 3;
    if (state == MASCOT_EXCITED) bob = (int)(sinf(frame * 1.2f) * 5);

    int cx = 64, cy = 72 + bob;

    // Tail fin
    lv_point_t tail[4] = {
        {(lv_coord_t)(cx+26),(lv_coord_t)(cy)},
        {(lv_coord_t)(cx+46),(lv_coord_t)(cy-20)},
        {(lv_coord_t)(cx+48),(lv_coord_t)(cy)},
        {(lv_coord_t)(cx+46),(lv_coord_t)(cy+20)},
    };
    lv_draw_rect_dsc_t rd; lv_draw_rect_dsc_init(&rd);
    rd.bg_color = deep;
    // Approximate tail with a triangle-like shape
    draw_rect(canvas, cx+26, cy-18, 22, 36, deep, 6);

    // Body (oval)
    draw_rect(canvas, cx-30, cy-22, 60, 44, deep, 22);

    // Belly
    draw_rect(canvas, cx-20, cy-2, 40, 24, sky, 12);

    // Dorsal fin
    lv_point_t fin[3] = {
        {(lv_coord_t)(cx-5),(lv_coord_t)(cy-22)},
        {(lv_coord_t)(cx+5),(lv_coord_t)(cy-22)},
        {(lv_coord_t)(cx),(lv_coord_t)(cy-40)},
    };
    draw_rect(canvas, cx-6, cy-38, 12, 18, deep, 2);

    // Glowing eyes
    if (state != MASCOT_OFFLINE) {
        int eye_r = (state == MASCOT_THINKING && frame % 4 == 2) ? 3 : 6;
        draw_circle(canvas, cx-14, cy-6, eye_r, glowcyan);
        draw_circle(canvas, cx-12, cy-8, 2, rgb(255,255,255));
    }

    if (state == MASCOT_THINKING) {
        // Bubbles rising
        for (int i = 0; i < 3; i++) {
            int bx = cx - 35 + i * 6;
            int by = cy - 30 - (frame * 4 + i * 10) % 40;
            draw_circle(canvas, bx, by, 3 - i, glowcyan);
        }
    }
}

// ── Ollama – golden llama face ────────────────────────────────────────────────
static void draw_ollama(lv_obj_t *canvas, mascot_state_t state, uint8_t frame) {
    const lv_color_t bg     = rgb(15, 15, 26);
    const lv_color_t gold   = rgb(249, 168, 37);
    const lv_color_t cream  = rgb(255, 230, 180);
    const lv_color_t brown  = rgb(120, 70, 20);
    clear_canvas(canvas, bg);

    int bob = 0;
    if (state == MASCOT_IDLE)    bob = (frame % 2) ? 0 : 2;
    if (state == MASCOT_EXCITED) bob = (frame % 2) ? -3 : 3;

    int cx = 64, cy = 70 + bob;

    // Neck
    draw_rect(canvas, cx-14, cy+8, 28, 30, gold, 4);

    // Head
    draw_rect(canvas, cx-30, cy-30, 60, 52, gold, 16);

    // Snout (elongated)
    draw_rect(canvas, cx-18, cy+4, 36, 20, cream, 8);

    // Ears
    draw_rect(canvas, cx-30, cy-44, 14, 22, gold, 4);
    draw_rect(canvas, cx+16, cy-44, 14, 22, gold, 4);
    draw_rect(canvas, cx-27, cy-41, 8, 14, cream, 2);
    draw_rect(canvas, cx+19, cy-41, 8, 14, cream, 2);

    // Tuft of fur on head
    draw_circle(canvas, cx-8, cy-28, 8, cream);
    draw_circle(canvas, cx,   cy-32, 9, cream);
    draw_circle(canvas, cx+8, cy-28, 8, cream);

    // Eyes
    if (state == MASCOT_SLEEPING) {
        lv_draw_line_dsc_t ld; lv_draw_line_dsc_init(&ld);
        ld.color = brown; ld.width = 3;
        lv_point_t el[2] = {{(lv_coord_t)(cx-18),(lv_coord_t)(cy-10)},{(lv_coord_t)(cx-8),(lv_coord_t)(cy-10)}};
        lv_point_t er[2] = {{(lv_coord_t)(cx+8),(lv_coord_t)(cy-10)},{(lv_coord_t)(cx+18),(lv_coord_t)(cy-10)}};
        lv_canvas_draw_line(canvas, el, 2, &ld);
        lv_canvas_draw_line(canvas, er, 2, &ld);
    } else {
        draw_circle(canvas, cx-14, cy-10, 7, brown);
        draw_circle(canvas, cx+14, cy-10, 7, brown);
        draw_circle(canvas, cx-12, cy-12, 2, rgb(255,255,255));
        draw_circle(canvas, cx+16, cy-12, 2, rgb(255,255,255));
    }

    // Nostrils
    draw_circle(canvas, cx-6, cy+14, 3, brown);
    draw_circle(canvas, cx+6, cy+14, 3, brown);

    if (state == MASCOT_THINKING) {
        for (int i = 0; i < 3; i++) {
            float a = (frame * 90 + i * 120) * 3.14159f / 180;
            draw_circle(canvas, cx+(int)(cosf(a)*22), cy-42+(int)(sinf(a)*8), 4, gold);
        }
    }
}

// ── LM Studio – purple robot head ────────────────────────────────────────────
static void draw_lmstudio(lv_obj_t *canvas, mascot_state_t state, uint8_t frame) {
    const lv_color_t bg      = rgb(15, 15, 26);
    const lv_color_t purple  = rgb(156, 39, 176);
    const lv_color_t lavend  = rgb(200, 140, 220);
    const lv_color_t dark    = rgb(60, 10, 80);
    const lv_color_t ledcol  = (state == MASCOT_EXCITED) ? rgb(255,80,255) : rgb(200,100,255);
    clear_canvas(canvas, bg);

    int bob = 0;
    if (state == MASCOT_IDLE)    bob = (frame % 2) ? 0 : 2;
    if (state == MASCOT_EXCITED) bob = (frame % 2) ? -3 : 3;

    int cx = 64, cy = 68 + bob;

    // Antenna
    draw_rect(canvas, cx-2, cy-56, 4, 20, lavend, 2);
    draw_circle(canvas, cx, cy-58, 6, (frame % 2 == 0) ? ledcol : purple);

    // Head (boxy)
    draw_rect(canvas, cx-34, cy-36, 68, 62, purple, 10);

    // Visor / face plate
    draw_rect(canvas, cx-28, cy-28, 56, 38, dark, 6);

    // LED eyes
    int eye_r = (state == MASCOT_THINKING) ? 6 + (frame % 3) : 8;
    draw_rect(canvas, cx-22, cy-16, eye_r*2, eye_r*2, ledcol, 3);
    draw_rect(canvas, cx+6,  cy-16, eye_r*2, eye_r*2, ledcol, 3);

    // Eye shine
    draw_circle(canvas, cx-18, cy-12, 2, rgb(255,255,255));
    draw_circle(canvas, cx+10, cy-12, 2, rgb(255,255,255));

    // Mouth (LED bar) — more segments when excited
    int mouth_segs = (state == MASCOT_EXCITED) ? 6 : 4;
    for (int i = 0; i < mouth_segs; i++) {
        lv_color_t mc = (i % 2 == frame % 2) ? ledcol : dark;
        draw_rect(canvas, cx-22+i*9, cy+8, 6, 4, mc, 1);
    }

    // Side bolts
    draw_circle(canvas, cx-34, cy-10, 4, lavend);
    draw_circle(canvas, cx-34, cy+10, 4, lavend);
    draw_circle(canvas, cx+34, cy-10, 4, lavend);
    draw_circle(canvas, cx+34, cy+10, 4, lavend);

    // Neck + shoulders
    draw_rect(canvas, cx-14, cy+26, 28, 12, purple, 4);
    draw_rect(canvas, cx-42, cy+32, 84, 12, lavend, 6);
}

// ── Public API ─────────────────────────────────────────────────────────────────
mascot_state_t mascot_state_for(const provider_state_t *prov) {
    if (!prov || !prov->connected) return MASCOT_OFFLINE;
    if (prov->session_pct >= 75) return MASCOT_EXCITED;
    if (prov->session_pct >= 10) return MASCOT_THINKING;
    return MASCOT_IDLE;
}

void mascot_draw(lv_obj_t *canvas, provider_id_t id,
                 mascot_state_t state, uint8_t frame) {
    switch (id) {
    case PROVIDER_CLAUDE:   draw_claude(canvas, state, frame);   break;
    case PROVIDER_OPENAI:   draw_openai(canvas, state, frame);   break;
    case PROVIDER_DEEPSEEK: draw_deepseek(canvas, state, frame); break;
    case PROVIDER_OLLAMA:   draw_ollama(canvas, state, frame);   break;
    case PROVIDER_LMSTUDIO: draw_lmstudio(canvas, state, frame); break;
    default: break;
    }
}
