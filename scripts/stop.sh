#!/usr/bin/env bash
set -e

echo "=========================================="
echo "🛑 Stopping LYNQ Communication..."
echo "=========================================="

# Gracefully terminate daemon and Vite UI by port and process name
fuser -k 4848/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 5555/udp 2>/dev/null || true

# Kill any remaining Node processes running LynqDaemon
pkill -f "LynqDaemon" 2>/dev/null || true

echo "✅ All LYNQ Communication processes have been stopped."
