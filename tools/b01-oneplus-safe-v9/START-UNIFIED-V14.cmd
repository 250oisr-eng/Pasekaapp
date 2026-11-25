@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-ONEPLUS-UNIFIED-V14.ps1"
echo.
echo SEND ONLY B01-RESULT.json FROM THIS FOLDER.
echo No prior test files or archive folders needed.
if exist "%~dp0B01-RESULT.json" explorer.exe /select,"%~dp0B01-RESULT.json"
pause
