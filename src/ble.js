'use strict';

// Optional BLE bridge for Clawdmeter ESP32 hardware.
// Gracefully degrades if noble is not installed or BLE is unavailable.

let noble = null;
let device = null;
let characteristic = null;
let available = false;

try {
  noble = require('@abandonware/noble');
  available = true;
} catch (_) {
  try {
    noble = require('noble');
    available = true;
  } catch (_) {
    // BLE optional — install @abandonware/noble for hardware support
  }
}

const TARGET_NAME = 'Clawdmeter';
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_UUID    = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

const PROVIDER_INDEX = {
  claude: 0, openai: 1, deepseek: 2, ollama: 3, lmstudio: 4,
};

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

  // Start immediately if Bluetooth is already on
  if (noble.state === 'poweredOn') {
    noble.startScanning([], false);
  }

  noble.on('discover', peripheral => {
    const name = peripheral.advertisement.localName;
    if (name !== TARGET_NAME) return;
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
        setTimeout(() => noble.startScanning([], false), 5000);
      });
    });
  });
}

function buildPayload(state, tasks) {
  const providers = {};
  Object.entries(state || {}).forEach(([id, s]) => {
    if (!s) return;
    providers[id] = {
      connected: !!s.connected,
      pct:   s.session?.pct   || 0,
      pct2:  s.period?.pct    || 0,
      tokens: s.session?.used  || 0,
      limit:  s.session?.limit || 0,
      cost:   s.cost?.session  || 0,
      reset:  s.session?.resetAt
        ? Math.max(0, Math.round((s.session.resetAt - Date.now()) / 60000))
        : -1,
      model:  s.activeModel || '',
      error:  s.error || '',
    };
  });

  const bleTasks = (tasks || []).slice(0, 8).map(t => ({
    label:  t.label      || '',
    model:  t.model      || '',
    in:     t.tokensIn   || 0,
    out:    t.tokensOut  || 0,
    limit:  t.tokensLimit || 200000,
    provider: PROVIDER_INDEX[t.provider] ?? 0,
  }));

  return JSON.stringify({
    v: 2,
    providers,
    tasks: bleTasks,
    ts: Math.floor(Date.now() / 1000),
  });
}

function sendUsageUpdate(state, tasks) {
  if (!characteristic) return;
  try {
    const payload = buildPayload(state, tasks);
    const buf = Buffer.from(payload);
    // Write in 512-byte chunks (BLE MTU safe) — same as Python daemon
    const mtu = 512;
    for (let i = 0; i < buf.length; i += mtu) {
      characteristic.write(buf.slice(i, i + mtu), false);
    }
  } catch (_) {}
}

module.exports = { isAvailable, start, sendUsageUpdate, buildPayload };
