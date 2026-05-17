#!/usr/bin/env bash
# Build and flash Clawdmeter firmware to the connected ESP32-S3.
# Requires ESP-IDF v5.x to be installed and sourced.
#
# Usage:
#   ./flash.sh              # build + flash via auto-detected port
#   ./flash.sh /dev/ttyUSB0 # specify port explicitly
#   ./flash.sh --monitor    # flash then open serial monitor

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-}"
MONITOR="${2:-}"

if [ -z "${IDF_PATH:-}" ]; then
  echo "ERROR: IDF_PATH not set. Source esp-idf export.sh first."
  echo "  . \$IDF_PATH/export.sh"
  exit 1
fi

cd "$SCRIPT_DIR"

echo "==> Building Clawdmeter firmware…"
idf.py build

FLASH_ARGS="flash"
if [ -n "$PORT" ] && [ "$PORT" != "--monitor" ]; then
  FLASH_ARGS="$FLASH_ARGS -p $PORT"
fi

echo "==> Flashing…"
idf.py $FLASH_ARGS

if [ "${MONITOR:-}" = "--monitor" ] || [ "${PORT:-}" = "--monitor" ]; then
  echo "==> Opening monitor…"
  idf.py monitor ${PORT:+-p $PORT}
fi
