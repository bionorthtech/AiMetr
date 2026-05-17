#pragma once

// ── Display (CO5300 QSPI AMOLED 480x480) ────────────────────────────────────
#define DISPLAY_WIDTH   480
#define DISPLAY_HEIGHT  480
#define DISPLAY_BPP     2       // RGB565

// QSPI pins (LILYGO T4-S3 pinout)
#define LCD_QSPI_HOST   SPI2_HOST
#define LCD_PIN_SCLK    47
#define LCD_PIN_D0      18
#define LCD_PIN_D1      7
#define LCD_PIN_D2      48
#define LCD_PIN_D3      5
#define LCD_PIN_CS      6
#define LCD_PIN_RST     17
#define LCD_PIN_DC      -1      // QSPI: no DC pin

// Touch (CST92xx via I2C)
#define TOUCH_I2C_PORT  I2C_NUM_0
#define TOUCH_PIN_SDA   8
#define TOUCH_PIN_SCL   9
#define TOUCH_PIN_INT   21
#define TOUCH_PIN_RST   20
#define TOUCH_I2C_ADDR  0x5A

// Button (side button)
#define BTN_PIN         0

// Backlight
#define LCD_BL_PIN      38

// ── BLE ──────────────────────────────────────────────────────────────────────
#define BLE_DEVICE_NAME     "Clawdmeter"
// Same service/char UUIDs as original Clawdmeter for daemon compatibility
#define BLE_SERVICE_UUID    "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_CHAR_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ── Polling ───────────────────────────────────────────────────────────────────
#define SCREEN_CYCLE_MS     5000    // auto-advance screens every 5s
#define INACTIVE_DIM_MS     30000   // dim after 30s of no touch

// ── Provider count ────────────────────────────────────────────────────────────
#define NUM_PROVIDERS   5
