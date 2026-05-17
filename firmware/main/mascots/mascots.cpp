// Mascot renderer — uses real sprite data for Claude, DeepSeek, and OpenAI Codex.
// Ollama and LM Studio remain procedural LVGL drawings.
//
// Claude: real pixel-art frames from claudepix.vercel.app (via Clawdmeter repo)
// DeepSeek: official whale logo pixel art
// OpenAI Codex: official robot mascot pixel art
// Ollama: pixel llama (procedural)
// LM Studio: pixel robot (procedural)

#include "mascots.h"
#include "clawd_sprites.h"
#include "deepseek_sprites.h"
#include "codex_sprites.h"
#include <math.h>

// ── Sprite renderer (palette-indexed 20×20 → LVGL canvas) ─────────────────────
// Canvas must be 128×128 (LVGL color format RGB565).
// Each 20×20 frame is upscaled by factor 6 → 120×120, centred on the canvas.

#define SPRITE_SRC  20
#define SPRITE_DISP 120  // display size (6× upscale)
#define SPRITE_OFF  4    // offset to centre 120 in 128

static void render_sprite(lv_obj_t *canvas,
                           const uint16_t *palette, // 10-entry RGB565 palette
                           const uint8_t  *frame,   // 400-byte flat grid (row-major)
                           lv_color_t      bg)
{
    lv_canvas_fill_bg(canvas, bg, LV_OPA_COVER);
    const int scale = SPRITE_DISP / SPRITE_SRC;  // = 6

    for (int row = 0; row < SPRITE_SRC; row++) {
        for (int col = 0; col < SPRITE_SRC; col++) {
            uint8_t idx = frame[row * SPRITE_SRC + col];
            if (idx == 0) continue;  // transparent
            uint16_t rgb565 = palette[idx];
            if (rgb565 == 0x0000) continue;

            lv_color_t col_lv;
            col_lv.blue  = ( rgb565        & 0x1F) << 3;
            col_lv.green = ((rgb565 >>  5) & 0x3F) << 2;
            col_lv.red   = ((rgb565 >> 11) & 0x1F) << 3;

            lv_draw_rect_dsc_t dsc;
            lv_draw_rect_dsc_init(&dsc);
            dsc.bg_color = col_lv;
            dsc.bg_opa   = LV_OPA_COVER;
            dsc.radius   = 0;
            int x0 = SPRITE_OFF + col * scale;
            int y0 = SPRITE_OFF + row * scale;
            lv_canvas_draw_rect(canvas, x0, y0, scale, scale, &dsc);
        }
    }
}

// ── Dispatch table: map mascot_state_t → sprite arrays ─────────────────────────
typedef struct {
    const uint16_t *palette;
    const uint8_t  (*frames)[CLAWD_W * CLAWD_H];
    int             count;
} sprite_anim_t;

static sprite_anim_t clawd_anim(mascot_state_t st) {
    switch (st) {
    case MASCOT_THINKING: return {clawd_thinking_palette, clawd_thinking_frames, CLAWD_THINKING_FRAME_COUNT};
    case MASCOT_EXCITED:  return {clawd_excited_palette,  clawd_excited_frames,  CLAWD_EXCITED_FRAME_COUNT};
    case MASCOT_SLEEPING: return {clawd_sleeping_palette, clawd_sleeping_frames, CLAWD_SLEEPING_FRAME_COUNT};
    default:              return {clawd_idle_palette,     clawd_idle_frames,     CLAWD_IDLE_FRAME_COUNT};
    }
}

static sprite_anim_t deepseek_anim(mascot_state_t st) {
    switch (st) {
    case MASCOT_THINKING: return {deepseek_thinking_palette, deepseek_thinking_frames, DEEPSEEK_THINKING_FRAME_COUNT};
    case MASCOT_EXCITED:  return {deepseek_excited_palette,  deepseek_excited_frames,  DEEPSEEK_EXCITED_FRAME_COUNT};
    case MASCOT_SLEEPING: return {deepseek_sleeping_palette, deepseek_sleeping_frames, DEEPSEEK_SLEEPING_FRAME_COUNT};
    default:              return {deepseek_idle_palette,     deepseek_idle_frames,     DEEPSEEK_IDLE_FRAME_COUNT};
    }
}

static sprite_anim_t codex_anim(mascot_state_t st) {
    switch (st) {
    case MASCOT_THINKING: return {codex_thinking_palette, codex_thinking_frames, CODEX_THINKING_FRAME_COUNT};
    case MASCOT_EXCITED:  return {codex_excited_palette,  codex_excited_frames,  CODEX_EXCITED_FRAME_COUNT};
    case MASCOT_SLEEPING: return {codex_sleeping_palette, codex_sleeping_frames, CODEX_SLEEPING_FRAME_COUNT};
    default:              return {codex_idle_palette,     codex_idle_frames,     CODEX_IDLE_FRAME_COUNT};
    }
}

// ── Procedural helpers (used for Ollama and LM Studio) ────────────────────────
static lv_color_t rgb(uint8_t r, uint8_t g, uint8_t b) {
    return lv_color_make(r, g, b);
}

static void draw_rect_lv(lv_obj_t *canvas, int x, int y, int w, int h,
                          lv_color_t col, int radius) {
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = col;
    dsc.radius   = radius;
    dsc.bg_opa   = LV_OPA_COVER;
    lv_canvas_draw_rect(canvas, x, y, w, h, &dsc);
}

static void draw_circle_lv(lv_obj_t *canvas, int cx, int cy, int r, lv_color_t col) {
    lv_draw_arc_dsc_t dsc;
    lv_draw_arc_dsc_init(&dsc);
    dsc.color = col;
    dsc.width = r;
    lv_canvas_draw_arc(canvas, cx, cy, r, 0, 360, &dsc);
}

// ── Ollama – pixel llama (procedural) ─────────────────────────────────────────
static void draw_ollama(lv_obj_t *canvas, mascot_state_t state, uint8_t frame) {
    lv_canvas_fill_bg(canvas, rgb(15,15,26), LV_OPA_COVER);
    const lv_color_t gold  = rgb(249,168,37);
    const lv_color_t cream = rgb(255,230,180);
    const lv_color_t brown = rgb(120,70,20);

    int bob = (state == MASCOT_IDLE) ? (frame%2==0?0:2) :
              (state == MASCOT_EXCITED) ? (frame%2==0?-3:3) : 0;
    int cx=64, cy=68+bob;

    draw_rect_lv(canvas, cx-14, cy+8, 28, 30, gold, 4);    // neck
    draw_rect_lv(canvas, cx-30, cy-30, 60, 52, gold, 16);  // head
    draw_rect_lv(canvas, cx-18, cy+4, 36, 20, cream, 8);   // snout
    draw_rect_lv(canvas, cx-30, cy-44, 14, 22, gold, 4);   // left ear
    draw_rect_lv(canvas, cx+16, cy-44, 14, 22, gold, 4);   // right ear
    draw_rect_lv(canvas, cx-27, cy-41, 8, 14, cream, 2);
    draw_rect_lv(canvas, cx+19, cy-41, 8, 14, cream, 2);
    // Tuft
    draw_circle_lv(canvas, cx-8, cy-28, 8, cream);
    draw_circle_lv(canvas, cx,   cy-32, 9, cream);
    draw_circle_lv(canvas, cx+8, cy-28, 8, cream);
    // Eyes
    if (state == MASCOT_SLEEPING) {
        lv_draw_line_dsc_t ld; lv_draw_line_dsc_init(&ld);
        ld.color = brown; ld.width = 3;
        lv_point_t el[2]={{(lv_coord_t)(cx-18),(lv_coord_t)(cy-10)},{(lv_coord_t)(cx-8),(lv_coord_t)(cy-10)}};
        lv_point_t er[2]={{(lv_coord_t)(cx+8),(lv_coord_t)(cy-10)},{(lv_coord_t)(cx+18),(lv_coord_t)(cy-10)}};
        lv_canvas_draw_line(canvas,el,2,&ld);
        lv_canvas_draw_line(canvas,er,2,&ld);
    } else {
        draw_circle_lv(canvas, cx-14, cy-10, 7, brown);
        draw_circle_lv(canvas, cx+14, cy-10, 7, brown);
        draw_circle_lv(canvas, cx-12, cy-12, 2, rgb(255,255,255));
        draw_circle_lv(canvas, cx+16, cy-12, 2, rgb(255,255,255));
    }
    draw_circle_lv(canvas, cx-6, cy+14, 3, brown);
    draw_circle_lv(canvas, cx+6, cy+14, 3, brown);
    if (state==MASCOT_THINKING) {
        for(int i=0;i<3;i++){
            float a=(frame*90+i*120)*3.14159f/180;
            draw_circle_lv(canvas,cx+(int)(cosf(a)*22),cy-42+(int)(sinf(a)*8),4,gold);
        }
    }
}

// ── LM Studio – pixel robot (procedural) ─────────────────────────────────────
static void draw_lmstudio(lv_obj_t *canvas, mascot_state_t state, uint8_t frame) {
    lv_canvas_fill_bg(canvas, rgb(15,15,26), LV_OPA_COVER);
    const lv_color_t purple = rgb(156,39,176);
    const lv_color_t lavend = rgb(200,140,220);
    const lv_color_t led    = (state==MASCOT_EXCITED)?rgb(255,80,255):rgb(200,100,255);
    const lv_color_t dark   = rgb(60,10,80);

    int bob=(state==MASCOT_IDLE)?(frame%2?0:2):(state==MASCOT_EXCITED)?(frame%2?-3:3):0;
    int cx=64, cy=68+bob;

    draw_rect_lv(canvas,cx-2,cy-56,4,20,lavend,2);
    draw_circle_lv(canvas,cx,cy-58,6,(frame%2==0)?led:purple);
    draw_rect_lv(canvas,cx-34,cy-36,68,62,purple,10);
    draw_rect_lv(canvas,cx-28,cy-28,56,38,dark,6);

    int eye_r=(state==MASCOT_THINKING)?6+(frame%3):8;
    draw_rect_lv(canvas,cx-22,cy-16,eye_r*2,eye_r*2,led,3);
    draw_rect_lv(canvas,cx+6, cy-16,eye_r*2,eye_r*2,led,3);
    draw_circle_lv(canvas,cx-18,cy-12,2,rgb(255,255,255));
    draw_circle_lv(canvas,cx+10,cy-12,2,rgb(255,255,255));

    int segs=(state==MASCOT_EXCITED)?6:4;
    for(int i=0;i<segs;i++){
        lv_color_t mc=(i%2==frame%2)?led:dark;
        draw_rect_lv(canvas,cx-22+i*9,cy+8,6,4,mc,1);
    }
    draw_circle_lv(canvas,cx-34,cy-10,4,lavend);
    draw_circle_lv(canvas,cx-34,cy+10,4,lavend);
    draw_circle_lv(canvas,cx+34,cy-10,4,lavend);
    draw_circle_lv(canvas,cx+34,cy+10,4,lavend);
    draw_rect_lv(canvas,cx-14,cy+26,28,12,purple,4);
    draw_rect_lv(canvas,cx-42,cy+32,84,12,lavend,6);
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
    const lv_color_t bg = lv_color_hex(0x0f0f1a);

    switch (id) {
    case PROVIDER_CLAUDE: {
        if (state == MASCOT_OFFLINE) {
            lv_canvas_fill_bg(canvas, bg, LV_OPA_COVER);
            return;
        }
        sprite_anim_t anim = clawd_anim(state);
        int fi = frame % anim.count;
        render_sprite(canvas, anim.palette, anim.frames[fi], bg);
        break;
    }
    case PROVIDER_OPENAI: {
        if (state == MASCOT_OFFLINE) {
            lv_canvas_fill_bg(canvas, bg, LV_OPA_COVER);
            return;
        }
        sprite_anim_t anim = codex_anim(state);
        int fi = frame % anim.count;
        render_sprite(canvas, anim.palette, anim.frames[fi], bg);
        break;
    }
    case PROVIDER_DEEPSEEK: {
        if (state == MASCOT_OFFLINE) {
            lv_canvas_fill_bg(canvas, bg, LV_OPA_COVER);
            return;
        }
        sprite_anim_t anim = deepseek_anim(state);
        int fi = frame % anim.count;
        render_sprite(canvas, anim.palette, anim.frames[fi], bg);
        break;
    }
    case PROVIDER_OLLAMA:   draw_ollama(canvas, state, frame);   break;
    case PROVIDER_LMSTUDIO: draw_lmstudio(canvas, state, frame); break;
    default: break;
    }
}
