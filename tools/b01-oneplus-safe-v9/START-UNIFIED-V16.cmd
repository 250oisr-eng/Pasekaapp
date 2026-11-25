@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-ONEPLUS-UNIFIED-V16.ps1"
echo.
echo SEND ONLY B01-RESULT.json. NEVER UPLOAD YOUR PRIVATE TAR, MANIFEST OR RECONSTRUCTED FILES.
if exist "%~dp0B01-RESULT.json" explorer.exe /select,"%~dp0B01-RESULT.json"
pause
