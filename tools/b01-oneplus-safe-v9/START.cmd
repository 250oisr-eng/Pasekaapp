@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0B01-ONEPLUS-SAFE-V9.ps1"
echo.
echo Open the newest results\run-* folder. Share ONLY b01-v9-result.json.
pause
