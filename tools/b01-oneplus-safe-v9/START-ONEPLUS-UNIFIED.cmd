@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-ONEPLUS-UNIFIED-V11.ps1"
echo.
echo SEND ONLY the JSON in unified-results\run-*\b01-unified-result.json.
echo Do not copy any TAR or old scripts into this folder. Do not upload TAR.
pause
