Write-Host "==========================================" -ForegroundColor Red
Write-Host "🛑 Stopping LYNQ Communication..." -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Red

Get-NetTCPConnection -LocalPort 4848, 5173 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

Write-Host "✅ LYNQ Communication processes stopped." -ForegroundColor Green
