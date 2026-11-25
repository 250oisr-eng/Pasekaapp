@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-ONEPLUS-UNIFIED-V12.ps1"
echo.
echo SHARE ONLY unified-results\run-*\b01-unified-result.json.
echo Keep all TAR files local and unchanged.
pause
