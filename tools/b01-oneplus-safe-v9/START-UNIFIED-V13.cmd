@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-ONEPLUS-UNIFIED-V13.ps1"
echo.
echo SHARE ONLY unified-results\run-*\b01-unified-result.json.
echo NEVER upload any TAR, personal data or backup to ChatGPT.
pause
