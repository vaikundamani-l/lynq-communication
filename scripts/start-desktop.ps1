Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "⚡ Starting LYNQ Communication Desktop (PowerShell)..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (-not (Test-Path "packages/core/dist")) {
    Write-Host "📦 Compiling backend modules..."
    npm run build
}

Write-Host "🌐 Launching local networking daemon..."
$daemonScript = @"
import('./packages/network-service/dist/index.js').then(async ({ LynqDaemon }) => {
  const daemon = new LynqDaemon();
  await daemon.start();
  console.log('✅ LYNQ Daemon active on signaling port ' + daemon.profile.signalingPort);
  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });
});
"@

$daemonJob = Start-Process node -ArgumentList "-e", "`"$daemonScript`"" -PassThru -NoNewWindow

try {
    Write-Host "🖥️ Starting UI shell on http://localhost:5173..." -ForegroundColor Green
    npm run dev --prefix packages/web-ui
} finally {
    Write-Host "🛑 Stopping LYNQ daemon..." -ForegroundColor Yellow
    if ($daemonJob -and -not $daemonJob.HasExited) {
        Stop-Process -Id $daemonJob.Id -Force -ErrorAction SilentlyContinue
    }
}
