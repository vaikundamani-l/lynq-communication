@echo off
echo ==========================================
echo ⚡ Starting LYNQ Communication Desktop (Windows)...
echo ==========================================

REM 1. Compile backend packages if needed
if not exist "packages\core\dist" (
    echo 📦 Compiling backend modules...
    call npm run build
)

REM 2. Launch background daemon in new process
echo 🌐 Launching local networking daemon...
start "LYNQ Daemon" /B node -e "import('./packages/network-service/dist/index.js').then(async ({ LynqDaemon }) => { const daemon = new LynqDaemon(); await daemon.start(); console.log('LYNQ Daemon active on signaling port ' + daemon.profile.signalingPort); process.on('SIGINT', async () => { await daemon.stop(); process.exit(0); }); });"

REM 3. Start Vite frontend dev server
echo 🖥️ Starting UI shell on http://localhost:5173...
call npm run dev --prefix packages/web-ui
