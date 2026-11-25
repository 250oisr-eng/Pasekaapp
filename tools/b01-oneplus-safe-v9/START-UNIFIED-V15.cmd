@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-ONEPLUS-UNIFIED-V15.ps1"
echo.
echo ONLY B01-RESULT.json IS SAFE FOR CHAT. NEVER SEND THE PRIVATE TAR OR MANIFEST.
if exist "%~dp0B01-RESULT.json" explorer.exe /select,"%~dp0B01-RESULT.json"
pause
