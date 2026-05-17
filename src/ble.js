'use strict';

// Optional BLE bridge for original Clawdmeter ESP32 hardware.
// Gracefully degrades if noble is not installed or BLE is unavailable.

let noble = null;
let device = null;
let characteristic = null;
let available = false;

try {
  noble = require('noble');
  available = true;
} catch (_) {
  // noble not installed – BLE features disabled
}

const TARGET_NAME = 'Claude Controller';
const SERVICE_UUID = 'battery_service'; // placeholder; replace with actual Clawdmeter UUID
const CHAR_UUID    = 'battery_level';   // placeholder

function isAvailable() { return available; }

function start(onConnect, onDisconnect) {
  if (!available) return;

  noble.on('stateChange', state => {
    if (state === 'poweredOn') {
      noble.startScanning([], false);
    } else {
      noble.stopScanning();
    }
  });

  noble.on('discover', peripheral => {
    if (peripheral.advertisement.localName !== TARGET_NAME) return;
    noble.stopScanning();

    peripheral.connect(err => {
      if (err) return;
      device = peripheral;

      peripheral.discoverSomeServicesAndCharacteristics(
        [SERVICE_UUID], [CHAR_UUID],
        (_e, _services, chars) => {
          if (chars && chars.length > 0) {
            characteristic = chars[0];
            if (onConnect) onConnect();
          }
        }
      );

      peripheral.once('disconnect', () => {
        device = null;
        characteristic = null;
        if (onDisconnect) onDisconnect();
        // Attempt reconnect after 5s
        setTimeout(() => noble.startScanning([], false), 5000);
      });
    });
  });
}

function sendUsageUpdate(claudeState) {
  if (!characteristic) return;
  try {
    const payload = JSON.stringify({
      'session%':            claudeState?.session?.pct    || 0,
      'weekly%':             claudeState?.period?.pct     || 0,
      session_reset_minutes: Math.round(((claudeState?.session?.resetAt || 0) - Date.now()) / 60000),
      weekly_reset_minutes:  Math.round(((claudeState?.period?.resetAt  || 0) - Date.now()) / 60000),
      status: claudeState?.connected ? 'connected' : 'disconnected',
    });
    characteristic.write(Buffer.from(payload), false);
  } catch (_) {}
}

module.exports = { isAvailable, start, sendUsageUpdate };
