@echo off
echo ==========================================
echo 🛑 Stopping LYNQ Communication (Windows)...
echo ==========================================

REM Stop processes by port 4848 and 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4848 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do taskkill /f /pid %%a 2>nul

echo ✅ LYNQ Communication processes stopped.
