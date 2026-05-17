#!/usr/bin/env python3
"""
Clawdmeter Multi-Provider Daemon
Polls Claude, OpenAI, DeepSeek, Ollama, and LM Studio for usage data,
then sends a compact JSON payload to the Clawdmeter device via BLE.

Usage:
    python3 multi_provider_daemon.py [--config config.json] [--interval 60]
"""

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import time
import argparse
from pathlib import Path
from typing import Optional

try:
    import aiohttp
except ImportError:
    sys.exit("pip install aiohttp bleak")

try:
    from bleak import BleakClient, BleakScanner
except ImportError:
    sys.exit("pip install bleak")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
)
log = logging.getLogger("clawdmeter")

# ── BLE constants (must match firmware) ──────────────────────────────────────
BLE_DEVICE_NAME = "Clawdmeter"
BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
BLE_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# ── Provider indices (must match firmware providers.h) ────────────────────────
PROV_CLAUDE   = 0
PROV_OPENAI   = 1
PROV_DEEPSEEK = 2
PROV_OLLAMA   = 3
PROV_LMSTUDIO = 4

# ──────────────────────────────────────────────────────────────────────────────
# Config loader
# ──────────────────────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "claude": {
        "enabled": True,
        # leave api_key blank to auto-detect from keychain / ~/.claude/.credentials.json
        "api_key": "",
    },
    "openai": {
        "enabled": True,
        "api_key": "",   # or set OPENAI_API_KEY env var
    },
    "deepseek": {
        "enabled": True,
        "api_key": "",   # or set DEEPSEEK_API_KEY env var
    },
    "ollama": {
        "enabled": True,
        "base_url": "http://localhost:11434",
    },
    "lmstudio": {
        "enabled": True,
        "base_url": "http://localhost:1234",
    },
    "poll_interval": 60,   # seconds between full provider poll
    "task_interval": 10,   # seconds between task progress poll
}


def load_config(path: Optional[str]) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if path and Path(path).exists():
        with open(path) as f:
            user = json.load(f)
        # Deep merge one level
        for k, v in user.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k] = {**cfg[k], **v}
            else:
                cfg[k] = v
    # Override from env vars
    if os.environ.get("OPENAI_API_KEY"):
        cfg["openai"]["api_key"] = os.environ["OPENAI_API_KEY"]
    if os.environ.get("DEEPSEEK_API_KEY"):
        cfg["deepseek"]["api_key"] = os.environ["DEEPSEEK_API_KEY"]
    if os.environ.get("ANTHROPIC_API_KEY"):
        cfg["claude"]["api_key"] = os.environ["ANTHROPIC_API_KEY"]
    return cfg


# ──────────────────────────────────────────────────────────────────────────────
# Claude credentials
# ──────────────────────────────────────────────────────────────────────────────

def _read_claude_credentials() -> Optional[str]:
    """Return the Claude OAuth Bearer token from macOS Keychain or credentials file."""
    # 1. Try macOS Keychain
    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["security", "find-generic-password",
                 "-s", "Claude API Key", "-w"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                tok = result.stdout.strip()
                if tok:
                    return tok
        except Exception:
            pass

    # 2. Try ~/.claude/.credentials.json
    cred_file = Path.home() / ".claude" / ".credentials.json"
    if cred_file.exists():
        try:
            with open(cred_file) as f:
                data = json.load(f)
            # May be { "api_key": "..." } or { "claudeAiOauthToken": "..." }
            return (data.get("api_key") or
                    data.get("claudeAiOauthToken") or
                    data.get("oauth_token"))
        except Exception:
            pass

    return None


# ──────────────────────────────────────────────────────────────────────────────
# Provider pollers
# ──────────────────────────────────────────────────────────────────────────────

async def poll_claude(session: aiohttp.ClientSession, cfg: dict) -> dict:
    """Poll Claude rate-limit headers and compute usage %."""
    result = {"connected": False, "error": ""}

    api_key = cfg["claude"].get("api_key") or _read_claude_credentials()
    if not api_key:
        result["error"] = "No Claude credentials found"
        return result

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    # Minimal request to get rate-limit headers
    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}],
    }

    try:
        async with session.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            rl_remaining = int(resp.headers.get("anthropic-ratelimit-tokens-remaining", 0))
            rl_limit     = int(resp.headers.get("anthropic-ratelimit-tokens-limit", 0))
            reset_str    = resp.headers.get("anthropic-ratelimit-tokens-reset", "")

            # Also try requests rate limit
            req_remaining = int(resp.headers.get("anthropic-ratelimit-requests-remaining", -1))
            req_limit     = int(resp.headers.get("anthropic-ratelimit-requests-limit", -1))

            tokens_used = (rl_limit - rl_remaining) if rl_limit > 0 else 0
            pct = int((tokens_used / rl_limit) * 100) if rl_limit > 0 else 0

            # Reset time
            reset_min = -1
            if reset_str:
                try:
                    from datetime import datetime, timezone
                    reset_dt = datetime.fromisoformat(reset_str.replace("Z", "+00:00"))
                    diff_s = (reset_dt - datetime.now(timezone.utc)).total_seconds()
                    reset_min = max(0, int(diff_s / 60))
                except Exception:
                    pass

            # Detect active model from response body if possible
            active_model = "claude-haiku-4-5"
            if resp.status == 200:
                try:
                    body = await resp.json()
                    active_model = body.get("model", active_model)
                except Exception:
                    pass

            result.update({
                "connected": True,
                "pct":   min(100, pct),
                "pct2":  0,  # no separate period endpoint exposed
                "tokens": tokens_used,
                "limit":  rl_limit,
                "cost":   0.0,  # would need usage API for actual cost
                "reset":  reset_min,
                "model":  active_model,
            })
    except aiohttp.ClientResponseError as e:
        result["error"] = f"HTTP {e.status}"
    except Exception as e:
        result["error"] = str(e)[:60]

    return result


async def poll_openai(session: aiohttp.ClientSession, cfg: dict) -> dict:
    """Poll OpenAI usage API."""
    result = {"connected": False, "error": ""}
    api_key = cfg["openai"].get("api_key")
    if not api_key:
        result["error"] = "No OpenAI API key"
        return result

    headers = {"Authorization": f"Bearer {api_key}"}
    today = time.strftime("%Y-%m-%d", time.gmtime())

    # Rate-limit probe (tokens remaining in current session)
    try:
        async with session.get(
            f"https://api.openai.com/v1/usage?date={today}",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status == 200:
                body = await resp.json()
                data = body.get("data", [])
                total_ctx    = sum(d.get("n_context_tokens_total", 0) for d in data)
                total_gen    = sum(d.get("n_generated_tokens_total", 0) for d in data)
                total_tokens = total_ctx + total_gen

                # Rough cost estimate (gpt-4o pricing)
                cost = (total_ctx / 1e6 * 2.50) + (total_gen / 1e6 * 10.00)

                # Determine most-used model today
                model_counts: dict[str, int] = {}
                for d in data:
                    m = d.get("snapshot_id", "")
                    model_counts[m] = model_counts.get(m, 0) + d.get("n_context_tokens_total", 0)
                active_model = max(model_counts, key=model_counts.get, default="—") if model_counts else "—"

                # OpenAI doesn't expose rate-limit % via REST; approximate via daily org limit
                ORG_DAILY_LIMIT = 10_000_000  # 10M tokens default
                pct = min(100, int(total_tokens * 100 / ORG_DAILY_LIMIT))

                result.update({
                    "connected": True,
                    "pct":   pct,
                    "pct2":  0,
                    "tokens": total_tokens,
                    "limit":  ORG_DAILY_LIMIT,
                    "cost":   round(cost, 4),
                    "reset":  -1,
                    "model":  active_model[:40],
                })
            elif resp.status == 401:
                result["error"] = "Invalid API key"
            else:
                result["error"] = f"HTTP {resp.status}"
    except Exception as e:
        result["error"] = str(e)[:60]

    return result


async def poll_deepseek(session: aiohttp.ClientSession, cfg: dict) -> dict:
    """Poll DeepSeek balance/usage."""
    result = {"connected": False, "error": ""}
    api_key = cfg["deepseek"].get("api_key")
    if not api_key:
        result["error"] = "No DeepSeek API key"
        return result

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with session.get(
            "https://api.deepseek.com/user/balance",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status == 200:
                body = await resp.json()
                # {"is_available": true, "balance_infos": [{"currency":"CNY","total_balance":"...","granted_balance":"...","topped_up_balance":"..."}]}
                is_available = body.get("is_available", False)
                infos = body.get("balance_infos", [])
                usd_info = next((i for i in infos if i.get("currency") == "USD"), None) or (infos[0] if infos else {})
                total = float(usd_info.get("total_balance", 0) or 0)
                granted = float(usd_info.get("granted_balance", 0) or 0)
                topped_up = float(usd_info.get("topped_up_balance", 0) or 0)

                # Use granted credits as proxy for pct
                orig = granted + topped_up if (granted + topped_up) > 0 else total + 5
                used = orig - total if orig > 0 else 0
                pct = min(100, int((used / orig) * 100)) if orig > 0 else 0

                result.update({
                    "connected": is_available,
                    "pct":   pct,
                    "pct2":  0,
                    "tokens": 0,
                    "limit":  0,
                    "cost":   round(used, 4),
                    "reset":  -1,
                    "model":  "deepseek-chat",
                })
            elif resp.status == 401:
                result["error"] = "Invalid API key"
            else:
                result["error"] = f"HTTP {resp.status}"
    except Exception as e:
        result["error"] = str(e)[:60]

    return result


async def poll_ollama(session: aiohttp.ClientSession, cfg: dict) -> dict:
    """Poll Ollama local server."""
    result = {"connected": False, "error": ""}
    base = cfg["ollama"].get("base_url", "http://localhost:11434").rstrip("/")

    try:
        async with session.get(
            f"{base}/api/ps",
            timeout=aiohttp.ClientTimeout(total=4),
        ) as resp:
            if resp.status == 200:
                body = await resp.json()
                models_running = body.get("models", [])
                # /api/ps lists currently loaded models with size_vram etc.
                first = models_running[0] if models_running else {}
                active_model = first.get("name", "").split(":")[0] or "—"

                # VRAM usage as proxy for "pct"
                vram_used  = sum(m.get("size_vram", 0) for m in models_running)
                vram_total = first.get("details", {}).get("parameter_size", 0) or 8_000_000_000
                pct = min(100, int(vram_used * 100 / vram_total)) if vram_total > 0 else 0

                all_model_names = ",".join(m.get("name", "").split(":")[0] for m in models_running)

                result.update({
                    "connected": True,
                    "pct":   pct,
                    "pct2":  0,
                    "tokens": 0,
                    "limit":  0,
                    "cost":   0.0,
                    "reset":  -1,
                    "model":  active_model[:40],
                })
            elif resp.status == 404:
                # /api/ps not available; fall back to /api/tags
                async with session.get(f"{base}/api/tags",
                                       timeout=aiohttp.ClientTimeout(total=4)) as r2:
                    if r2.status == 200:
                        result.update({"connected": True, "pct": 0, "model": "idle"})
            else:
                result["error"] = f"HTTP {resp.status}"
    except aiohttp.ClientConnectorError:
        result["error"] = "Not running"
    except Exception as e:
        result["error"] = str(e)[:60]

    return result


async def poll_lmstudio(session: aiohttp.ClientSession, cfg: dict) -> dict:
    """Poll LM Studio local server (OpenAI-compatible API)."""
    result = {"connected": False, "error": ""}
    base = cfg["lmstudio"].get("base_url", "http://localhost:1234").rstrip("/")

    try:
        async with session.get(
            f"{base}/v1/models",
            timeout=aiohttp.ClientTimeout(total=4),
        ) as resp:
            if resp.status == 200:
                body = await resp.json()
                models = body.get("data", [])
                active_model = models[0].get("id", "—")[:40] if models else "—"

                result.update({
                    "connected": True,
                    "pct":   0,  # LM Studio doesn't expose memory usage via API yet
                    "pct2":  0,
                    "tokens": 0,
                    "limit":  0,
                    "cost":   0.0,
                    "reset":  -1,
                    "model":  active_model,
                })
            else:
                result["error"] = f"HTTP {resp.status}"
    except aiohttp.ClientConnectorError:
        result["error"] = "Not running"
    except Exception as e:
        result["error"] = str(e)[:60]

    return result


# ──────────────────────────────────────────────────────────────────────────────
# Task tracker (reads ~/.claude/projects/ JSONL files)
# ──────────────────────────────────────────────────────────────────────────────

def read_claude_tasks() -> list[dict]:
    """Parse active Claude Code sessions from ~/.claude/projects/."""
    tasks = []
    projects_dir = Path.home() / ".claude" / "projects"
    if not projects_dir.exists():
        return tasks

    for proj_dir in sorted(projects_dir.iterdir()):
        if not proj_dir.is_dir():
            continue
        for jsonl_file in sorted(proj_dir.glob("*.jsonl"), reverse=True)[:3]:
            try:
                lines = jsonl_file.read_text(errors="replace").strip().splitlines()
                if not lines:
                    continue

                tokens_in = tokens_out = tokens_limit = 0
                model = ""
                label = ""
                active = False
                started_at = 0

                for line in lines:
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    msg_type = msg.get("type", "")

                    # First human message = task label
                    if not label and msg_type == "human":
                        content = msg.get("message", {}).get("content", "")
                        if isinstance(content, list):
                            content = " ".join(
                                c.get("text", "") for c in content if isinstance(c, dict)
                            )
                        label = str(content)[:48].replace("\n", " ")

                    # Usage in assistant messages
                    if msg_type == "assistant":
                        usage = msg.get("message", {}).get("usage", {})
                        tokens_in  = usage.get("input_tokens",  tokens_in)
                        tokens_out = usage.get("output_tokens", tokens_out)
                        tokens_limit = usage.get("cache_read_input_tokens", tokens_limit) or tokens_limit
                        model = msg.get("message", {}).get("model", model) or model
                        active = True
                        ts = msg.get("timestamp", 0)
                        if ts and not started_at:
                            started_at = int(ts)

                # Only include if seen within last 30 minutes
                if active and started_at and (time.time() - started_at) < 1800:
                    tasks.append({
                        "label":   label or proj_dir.name[:32],
                        "model":   (model or "claude")[:32],
                        "in":      tokens_in,
                        "out":     tokens_out,
                        "limit":   tokens_limit or 200000,
                        "provider": PROV_CLAUDE,
                    })
            except Exception:
                pass
        if len(tasks) >= 8:
            break

    return tasks[:8]


# ──────────────────────────────────────────────────────────────────────────────
# BLE manager
# ──────────────────────────────────────────────────────────────────────────────

class BLEManager:
    def __init__(self):
        self._client: Optional[BleakClient] = None
        self._address: Optional[str] = None

    async def find_device(self) -> Optional[str]:
        log.info("Scanning for Clawdmeter…")
        device = await BleakScanner.find_device_by_name(
            BLE_DEVICE_NAME, timeout=10.0
        )
        if device:
            log.info("Found %s  addr=%s", device.name, device.address)
            return device.address
        return None

    async def connect(self) -> bool:
        if not self._address:
            self._address = await self.find_device()
        if not self._address:
            log.warning("Clawdmeter not found in scan")
            return False
        try:
            self._client = BleakClient(self._address)
            await self._client.connect()
            log.info("BLE connected")
            return True
        except Exception as e:
            log.warning("BLE connect failed: %s", e)
            self._client = None
            return False

    async def send(self, data: bytes) -> bool:
        if not self._client or not self._client.is_connected:
            if not await self.connect():
                return False
        try:
            # Write in 512-byte chunks (BLE MTU safe)
            mtu = 512
            for i in range(0, len(data), mtu):
                await self._client.write_gatt_char(
                    BLE_CHAR_UUID, data[i:i+mtu], response=False
                )
            return True
        except Exception as e:
            log.warning("BLE send failed: %s", e)
            self._client = None
            return False

    async def disconnect(self):
        if self._client:
            try:
                await self._client.disconnect()
            except Exception:
                pass
            self._client = None


# ──────────────────────────────────────────────────────────────────────────────
# Main poll loop
# ──────────────────────────────────────────────────────────────────────────────

async def run(cfg: dict, dry_run: bool = False):
    ble = BLEManager()
    last_full_poll = 0.0
    cached_providers: dict = {}

    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        while True:
            now = time.time()
            providers = dict(cached_providers)

            # Full provider poll every poll_interval seconds
            if (now - last_full_poll) >= cfg["poll_interval"]:
                log.info("Full provider poll…")
                enabled = [
                    ("claude",   poll_claude(session, cfg)),
                    ("openai",   poll_openai(session, cfg)),
                    ("deepseek", poll_deepseek(session, cfg)),
                    ("ollama",   poll_ollama(session, cfg)),
                    ("lmstudio", poll_lmstudio(session, cfg)),
                ]
                results = await asyncio.gather(
                    *[coro for _, coro in enabled],
                    return_exceptions=True,
                )
                for (name, _), result in zip(enabled, results):
                    if isinstance(result, Exception):
                        log.error("Poll %s: %s", name, result)
                        providers[name] = {"connected": False, "error": str(result)[:60]}
                    else:
                        providers[name] = result
                        log.info("  %-10s connected=%-5s  pct=%3s%%",
                                 name,
                                 str(result.get("connected", False)),
                                 result.get("pct", "?"))

                cached_providers = providers
                last_full_poll = now

            # Always poll tasks
            tasks = read_claude_tasks()

            payload = json.dumps({
                "v": 2,
                "providers": providers,
                "tasks": tasks,
                "ts": int(now),
            }, separators=(",", ":")).encode()

            log.debug("Payload %d bytes", len(payload))

            if dry_run:
                print(json.dumps({
                    "v": 2,
                    "providers": providers,
                    "tasks": tasks,
                    "ts": int(now),
                }, indent=2))
            else:
                ok = await ble.send(payload)
                if not ok:
                    log.warning("Will retry BLE next cycle")

            await asyncio.sleep(cfg["task_interval"])


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Clawdmeter multi-provider daemon")
    parser.add_argument("--config",   default="~/.clawdmeter.json",
                        help="Path to config JSON (default: ~/.clawdmeter.json)")
    parser.add_argument("--interval", type=int, default=None,
                        help="Full poll interval in seconds (overrides config)")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Print JSON to stdout instead of sending via BLE")
    parser.add_argument("--debug",    action="store_true",
                        help="Enable debug logging")
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    config_path = os.path.expanduser(args.config)
    cfg = load_config(config_path)
    if args.interval:
        cfg["poll_interval"] = args.interval

    log.info("Clawdmeter daemon starting  interval=%ds", cfg["poll_interval"])
    asyncio.run(run(cfg, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
