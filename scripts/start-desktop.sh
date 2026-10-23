#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=========================================="
echo "⚡ Starting LYNQ Communication Desktop..."
echo "=========================================="

# 1. Build workspace packages if dist is missing
if [ ! -d "packages/core/dist" ] || [ ! -d "packages/storage/dist" ] || [ ! -d "packages/network-service/dist" ]; then
  echo "📦 Compiling backend modules..."
  npm run build
fi

# 2. Start the local networking daemon in background
echo "🌐 Launching local networking daemon..."
node -e "
  import('./packages/network-service/dist/index.js').then(async ({ LynqDaemon }) => {
    const daemon = new LynqDaemon();
    await daemon.start();
    console.log('✅ LYNQ Daemon active on signaling port ' + daemon.profile.signalingPort);
    process.on('SIGINT', async () => {
      await daemon.stop();
      process.exit(0);
    });
  });
" &
DAEMON_PID=$!

cleanup() {
  echo ""
  echo "🛑 Stopping LYNQ Communication..."
  kill "$DAEMON_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Start Vite frontend dev server
echo "🖥️  Starting UI shell on http://localhost:5173..."
npm run dev --prefix packages/web-ui
