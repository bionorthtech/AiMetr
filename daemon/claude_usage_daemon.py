#!/usr/bin/env python3
"""
Enhanced Claude usage daemon — optionally forwards data to Clawdmeter ESP32 via BLE.
This is the legacy Python component for users who still want hardware BLE support
without running the full Electron app.
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import httpx

try:
    from bleak import BleakClient, BleakScanner
    BLE_AVAILABLE = True
except ImportError:
    BLE_AVAILABLE = False

# ── Config ───────────────────────────────────────────────────────────────────

DEVICE_NAME      = "Claude Controller"
POLL_INTERVAL    = 60          # seconds
BLE_RETRY_DELAY  = 10          # seconds

GATT_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
GATT_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# ── Credentials ──────────────────────────────────────────────────────────────

def get_claude_token():
    """Try multiple credential sources in order."""
    # 1. Environment
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]

    # 2. ~/.claude/.credentials.json
    cred_path = Path.home() / ".claude" / ".credentials.json"
    if cred_path.exists():
        try:
            data = json.loads(cred_path.read_text())
            tok = (
                data.get("claudeAiOauth", {}).get("accessToken")
                or data.get("apiKey")
                or data.get("api_key")
            )
            if tok:
                return tok
        except Exception:
            pass

    # 3. macOS Keychain
    if sys.platform == "darwin":
        try:
            result = subprocess.check_output(
                ["security", "find-generic-password", "-s", "claude.ai", "-w"],
                stderr=subprocess.DEVNULL,
                timeout=3,
            )
            tok = result.decode().strip()
            if tok:
                return tok
        except Exception:
            pass

    return None

# ── API polling ───────────────────────────────────────────────────────────────

async def fetch_usage(client: httpx.AsyncClient, token: str) -> dict:
    """Poll Anthropic API and extract rate-limit headers."""
    try:
        resp = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": token,
                "anthropic-version": "2023-06-01",
            },
            timeout=10,
        )
        remaining = int(resp.headers.get("anthropic-ratelimit-tokens-remaining", 0))
        limit     = int(resp.headers.get("anthropic-ratelimit-tokens-limit", 0))
        reset_str = resp.headers.get("anthropic-ratelimit-tokens-reset", "")

        used = max(0, limit - remaining) if limit else 0
        pct  = round(used / limit * 100) if limit else 0

        reset_min = 0
        if reset_str:
            try:
                from datetime import datetime, timezone
                reset_dt  = datetime.fromisoformat(reset_str.replace("Z", "+00:00"))
                reset_min = max(0, int((reset_dt - datetime.now(timezone.utc)).total_seconds() / 60))
            except Exception:
                pass

        return {
            "session%": pct,
            "weekly%":  pct,
            "session_reset_minutes": reset_min,
            "weekly_reset_minutes":  reset_min,
            "status": "connected",
            "tokens_used":  used,
            "tokens_limit": limit,
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "session%": 0, "weekly%": 0}

# ── BLE ───────────────────────────────────────────────────────────────────────

async def find_device():
    if not BLE_AVAILABLE:
        return None
    devices = await BleakScanner.discover(timeout=5)
    for d in devices:
        if d.name == DEVICE_NAME:
            return d.address
    return None

async def send_to_device(address: str, payload: dict) -> bool:
    if not BLE_AVAILABLE:
        return False
    try:
        async with BleakClient(address, timeout=10) as client:
            data = json.dumps(payload).encode()
            await client.write_gatt_char(GATT_CHAR_UUID, data)
            return True
    except Exception as e:
        print(f"[BLE] Send failed: {e}")
        return False

# ── Main loop ─────────────────────────────────────────────────────────────────

async def main():
    print("[AIMetr daemon] Starting…")
    token = get_claude_token()
    if not token:
        print("[ERROR] No Claude credentials found. Set ANTHROPIC_API_KEY or run Claude Code first.")
        sys.exit(1)

    print(f"[AIMetr daemon] Got credentials. BLE available: {BLE_AVAILABLE}")

    device_address = None
    if BLE_AVAILABLE:
        print(f"[BLE] Scanning for '{DEVICE_NAME}'…")
        device_address = await find_device()
        if device_address:
            print(f"[BLE] Found device at {device_address}")
        else:
            print("[BLE] Device not found. Will retry later.")

    async with httpx.AsyncClient() as client:
        while True:
            print(f"[{time.strftime('%H:%M:%S')}] Polling Anthropic API…")
            payload = await fetch_usage(client, token)
            print(f"  Session: {payload['session%']}%  Tokens: {payload.get('tokens_used', 0)}/{payload.get('tokens_limit', 0)}")

            if device_address and BLE_AVAILABLE:
                ok = await send_to_device(device_address, payload)
                if not ok:
                    print("[BLE] Disconnected, rescanning…")
                    device_address = await find_device()

            await asyncio.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    asyncio.run(main())
