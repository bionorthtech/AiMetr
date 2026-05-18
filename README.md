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
- **ESP32-S3 firmware** — companion firmware for a 480×480 AMOLED device displaying usage via LVGL + BLE
- **Python BLE daemon** — standalone `multi_provider_daemon.py` for polling all providers and pushing data to the ESP32
- **Offline-first** — local providers (Ollama, LM Studio) need no credentials; cloud providers degrade gracefully when offline

---

## Providers

| Provider | Mascot | What's tracked |
|---|---|---|
| Claude (Anthropic) | **Clawd** 🐱 | Token rate-limit headers, `~/.claude` sessions |
| OpenAI / Codex | **Codex** 🧠 | Token rate-limit headers, model list |
| DeepSeek | **Seeker** 🐟 | Account balance, model list |
| Ollama (local) | **Llami** 🦙 | Running models, VRAM usage |
| LM Studio (local) | **Studio** 🤖 | Loaded models, memory usage |

---

## Getting Started

### Desktop App (Electron)

**Requirements:** Node.js 18+, npm

```bash
git clone https://github.com/bionorthtech/test
cd test
npm install
npm start
```

On first launch the Settings panel opens automatically. Add API keys for any cloud providers you want to monitor. Ollama and LM Studio are detected automatically if running locally.

**Development mode** (opens DevTools, faster poll interval):
```bash
npm run dev
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
# Edit config.json with your API keys
python multi_provider_daemon.py
```

**Requirements:** Python 3.10+, `aiohttp`, `bleak`

---

### ESP32 Firmware

**Requirements:** ESP-IDF v5.x, a board with 480×480 AMOLED display (tested on ESP32-S3 with GC9A01/ST7701 panel).

```bash
cd firmware
idf.py set-target esp32s3
idf.py build flash monitor
```

See `firmware/main/config.h` for pin assignments and display configuration.

---

## Configuration

All settings are stored via `electron-store` (platform-specific app data directory). They can also be edited in the Settings panel (⚙️ button or sidebar).

| Key | Default | Description |
|---|---|---|
| `providers.claude.apiKey` | — | Anthropic API key (auto-detected from `~/.claude` or Keychain) |
| `providers.openai.apiKey` | — | OpenAI API key |
| `providers.deepseek.apiKey` | — | DeepSeek API key |
| `providers.ollama.baseUrl` | `http://localhost:11434` | Ollama base URL |
| `providers.lmstudio.baseUrl` | `http://localhost:1234` | LM Studio base URL |
| `pet.enabled` | `true` | Show/hide desktop pet |
| `pet.position` | `{x:100,y:100}` | Pet window position |
| `ui.pollInterval` | `30` | Poll interval in seconds |

---

## Project Structure

```
aimetr/
├── main.js                   # Electron main process
├── preload.js                # IPC bridge (context isolation)
├── src/
│   ├── providers/
│   │   ├── base.js           # Provider interface typedefs
│   │   ├── claude.js         # Anthropic Claude
│   │   ├── openai.js         # OpenAI / Codex
│   │   ├── deepseek.js       # DeepSeek
│   │   ├── ollama.js         # Ollama (local)
│   │   └── lmstudio.js       # LM Studio (local)
│   ├── poller.js             # Poll aggregator + backoff
│   ├── tracker.js            # Claude Code task watcher
│   ├── store.js              # electron-store config wrapper
│   └── ble.js                # Optional BLE bridge (ESP32)
├── ui/
│   ├── dashboard/
│   │   ├── index.html        # Main dashboard window
│   │   ├── dashboard.js      # Dashboard controller
│   │   ├── dashboard.css     # Dashboard styles
│   │   ├── tabs/
│   │   │   ├── provider-tab.js   # Per-provider tab renderer
│   │   │   └── all-tab.js        # All-providers overview
│   │   └── vendor/
│   │       └── chart.umd.js      # Bundled Chart.js 4.x
│   ├── pet/
│   │   ├── pet.html          # Pet overlay window
│   │   ├── pet.js            # Pet state machine
│   │   ├── pet.css           # Transparent window styles
│   │   ├── mascots.js        # Pixel-art sprite renderer
│   │   └── sprites.js        # All mascot sprite data
│   └── settings/
│       └── settings.js       # Settings panel renderer
├── assets/
│   └── icons/                # Tray + app icons (add tray.png here)
├── firmware/                 # ESP32-S3 LVGL firmware (ESP-IDF)
│   └── main/
│       ├── mascots/          # Per-provider sprite headers
│       └── ui/               # LVGL screen modules
└── daemon/                   # Standalone Python BLE daemon
    ├── multi_provider_daemon.py
    ├── config.example.json
    └── requirements.txt
```

---

## Desktop Pet States

Each mascot has 5 animation states driven by live usage data:

| State | Trigger |
|---|---|
| `sleeping` | No API calls for 10+ minutes |
| `idle` | Connected, 0% usage |
| `thinking` | Active usage 10–74% |
| `excited` | Usage ≥ 75% |
| `offline` | Provider unreachable |

The pet window switches to the most active provider's mascot automatically. Right-click the pet to open the dashboard or hide it.

---

## BLE Hardware Notes

The ESP32-S3 firmware advertises as **"Claude Controller"**. Service UUID: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`. The BLE bridge in `src/ble.js` is optional — install `noble` separately if you want Electron→ESP32 direct BLE (the Python daemon is the primary path for hardware integration).

```bash
npm install noble
```

---

## Browser Demo

A self-contained device simulator runs in any modern browser — no install required:

```
demo/index.html
```

Open it directly from the filesystem to preview all dashboard screens and mascot animations.

---

## License

MIT © bionorthtech
