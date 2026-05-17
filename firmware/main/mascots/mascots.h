#pragma once
#include "lvgl.h"
#include "../providers.h"

#ifdef __cplusplus
extern "C" {
#endif

// Mascot animation states
typedef enum {
    MASCOT_IDLE     = 0,
    MASCOT_THINKING = 1,
    MASCOT_EXCITED  = 2,
    MASCOT_SLEEPING = 3,
    MASCOT_OFFLINE  = 4,
} mascot_state_t;

// Determine mascot state from provider data
mascot_state_t mascot_state_for(const provider_state_t *prov);

// Draw one animation frame onto an lv_canvas.
// frame 0..3 drives the animation cycle.
void mascot_draw(lv_obj_t *canvas, provider_id_t id,
                 mascot_state_t state, uint8_t frame);

#ifdef __cplusplus
}
#endif
