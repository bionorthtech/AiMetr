# AIMetr

**Multi-provider AI usage monitor** with real-time dashboard, desktop pet overlay, and optional ESP32-S3 AMOLED hardware companion.

Track rate limits, token usage, and cost across **Claude, OpenAI / Codex, DeepSeek, Ollama,** and **LM Studio** — all in one place.

---

## Features

- **Live usage dashboard** — session %, period %, token counts, cost, rate-limit reset timers for every connected provider
- **Per-provider mascots** — pixel-art characters (Clawd, Codex, Seeker, Llami, Studio) that react to activity in real time
- **Desktop pet overlay** — transparent always-on-top window showing the most active provider's mascot; draggable, persists position
- **Active task tracker** — monitors `~/.claude/projects/` to show live Claude Code conversation progress
- **Historical charts** — 24-hour usage sparklines via Chart.js
- **Multi-provider settings** — in-app credential management with auto-detect for Claude, connection testing for all providers
- **Secure credential storage** — API keys stored in **macOS Keychain** when available (never written to the repo)
- **ESP32-S3 firmware** — companion firmware for a 480×480 AMOLED device displaying usage via LVGL + BLE
- **Python BLE daemon** — standalone `multi_provider_daemon.py` for polling all providers and pushing data to the ESP32
- **Offline-first** — local providers (Ollama, LM Studio) need no credentials; cloud providers degrade gracefully when offline

---

## Providers

| Provider | Mascot | What's tracked |
|---|---|---|
| Claude (Anthropic) | **Clawd** 🐱 | Rate-limit headers, Claude Code sessions, cost from local JSONL logs |
| OpenAI / Codex | **Codex** 🧠 | Daily usage API (with rate-limit fallback), estimated cost |
| DeepSeek | **Seeker** 🐟 | Account balance / credit usage |
| Ollama (local) | **Llami** 🦙 | Running models, VRAM usage |
| LM Studio (local) | **Studio** 🤖 | Loaded models, memory usage |

---

## Getting Started

### Desktop App (Electron)

**Requirements:** Node.js 18+, npm

```bash
git clone https://github.com/bionorthtech/AiMetr.git
cd AiMetr
npm install
npm start
```

On first launch the Settings panel opens automatically. Add API keys for any cloud providers you want to monitor. Ollama and LM Studio are detected automatically if running locally.

**Development mode** (opens DevTools, faster poll interval cap):

```bash
npm run dev
```

**Run tests:**

```bash
npm test
```

**Build distributable:**

```bash
npm run build
```

Outputs: `.dmg` (macOS), `.AppImage` (Linux), `.exe` installer (Windows).

---

### Python Daemon (for ESP32 hardware)

The daemon runs independently of the Electron app and pushes data to the ESP32 over BLE.

```bash
cd daemon
pip install -r requirements.txt
cp config.example.json config.json
# Edit config.json with your API keys (config.json is gitignored — never commit it)
python multi_provider_daemon.py
```

Default config path can also be `~/.clawdmeter.json` — see `python multi_provider_daemon.py --help`.

**Requirements:** Python 3.10+, `aiohttp`, `bleak`

---

### ESP32 Firmware

**Requirements:** ESP-IDF v5.x, a board with 480×480 AMOLED display (tested on ESP32-S3 with GC9A01/ST7701 panel).

```bash
cd firmware
idf.py set-target esp32s3
idf.py build flash monitor
```

Or use the helper script:

```bash
cd firmware
./flash.sh
```

See `firmware/main/config.h` for pin assignments and display configuration.

---

## Configuration

Settings are stored via `electron-store` in the platform app-data directory (e.g. `~/Library/Application Support/aimetr/` on macOS).

| Key | Default | Description |
|---|---|---|
| `providers.claude.enabled` | `true` | Enable Claude polling |
| `providers.openai.enabled` | `false` | Enable OpenAI polling |
| `providers.deepseek.enabled` | `false` | Enable DeepSeek polling |
| `providers.ollama.enabled` | `true` | Enable Ollama polling |
| `providers.ollama.baseUrl` | `http://localhost:11434` | Ollama base URL |
| `providers.lmstudio.enabled` | `false` | Enable LM Studio polling |
| `providers.lmstudio.baseUrl` | `http://localhost:1234` | LM Studio base URL |
| `pet.enabled` | `true` | Show/hide desktop pet |
| `pet.position` | `{x:100,y:100}` | Pet window position |
| `ui.pollInterval` | `30` | Poll interval in seconds (10–300) |
| `ui.hasCompletedSetup` | `false` | Set `true` after first Settings save |

### API keys & secrets

- **macOS:** Cloud provider keys are stored in **Keychain** (service name `AIMetr`). They are not saved in plaintext in the electron-store config file.
- **Windows / Linux:** Keys are stored in the local electron-store config file.
- **Claude auto-detect:** If no key is saved, AIMetr checks `~/.claude/.credentials.json`, macOS Keychain (`claude.ai` / `Claude API Key`), and the `ANTHROPIC_API_KEY` environment variable.
- **Environment variables:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`

Edit credentials in the in-app Settings panel (⚙️ sidebar button). Disabled providers are skipped by the poller.

### Files you must not commit

The following are listed in `.gitignore` — copy example templates only:

| File | Purpose |
|---|---|
| `daemon/config.json` | Daemon API keys (copy from `config.example.json`) |
| `*.clawdmeter.json` | Alternate daemon config location |
| `.env` / `.env.*` | Environment-based secrets |
| `config.json`, `secrets.json` | Local config overrides |

Safe to commit: `daemon/config.example.json` (placeholders only).

---

## Project Structure

```
AiMetr/
├── main.js                   # Electron main process
├── preload.js                # IPC bridge (context isolation)
├── LICENSE                   # MIT license
├── src/
│   ├── providers/            # Claude, OpenAI, DeepSeek, Ollama, LM Studio
│   ├── poller.js             # Poll aggregator + backoff
│   ├── tracker.js            # Claude Code task watcher + cost inputs
│   ├── store.js              # electron-store config wrapper
│   ├── secrets.js            # macOS Keychain integration
│   ├── cost.js               # Token cost estimation
│   ├── fetch.js              # HTTP client with timeouts
│   └── ble.js                # Optional BLE bridge (ESP32)
├── ui/
│   ├── dashboard/            # Main window + Chart.js charts
│   ├── pet/                  # Desktop pet overlay + sprites
│   └── settings/             # Settings panel
├── assets/icons/             # Tray icon (tray.png)
├── test/                     # Node.js unit tests
├── scripts/                  # Build helpers (tray icon generator)
├── demo/                     # Browser device simulator
├── firmware/                 # ESP32-S3 LVGL firmware (ESP-IDF)
└── daemon/                   # Standalone Python BLE daemon
    ├── multi_provider_daemon.py
    ├── config.example.json   # Template (safe to commit)
    └── requirements.txt
```

---

## Desktop Pet States

Each mascot has 5 animation states driven by live usage data:

| State | Trigger |
|---|---|
| `sleeping` | Connected but no active usage |
| `idle` | Connected, 0% usage |
| `thinking` | Active usage 10–74% |
| `excited` | Usage ≥ 75% |
| `offline` | Provider unreachable |

The pet window switches to the most active provider's mascot automatically. Right-click the pet to open the dashboard or hide it.

---

## BLE Hardware Notes

The ESP32-S3 firmware advertises as **"Clawdmeter"**.

| Constant | Value |
|---|---|
| Device name | `Clawdmeter` |
| Service UUID | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` |
| Characteristic UUID | `beb5483e-36e1-4688-b7f5-ea07361b26a8` |

Both the Python daemon and the optional Electron BLE bridge send the same **v2 multi-provider JSON** payload (all providers + active tasks).

BLE in Electron is optional. `@abandonware/noble` is an optional npm dependency and installs automatically on supported platforms:

```bash
npm install
# or manually:
npm install @abandonware/noble
```

The Python daemon is the recommended path for hardware integration.

---

## Browser Demo

A self-contained device simulator runs in any modern browser — no install required:

```
demo/index.html
```

Open it directly from the filesystem to preview dashboard screens and mascot animations.

---

## Development

```bash
npm run dev      # Electron with DevTools, faster poll cap
npm test         # Run unit tests (Node built-in test runner)
```

CI runs syntax checks, tests, and asset verification via GitHub Actions (`.github/workflows/ci.yml`).

---

## License

MIT License — see [LICENSE](LICENSE).

Copyright (c) 2026 bionorthtech
