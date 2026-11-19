@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Manually disable phone Wi-Fi and mobile data; connect authorized USB.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Invoke-Paseka-Test-Agent.ps1" -Offline
pause
