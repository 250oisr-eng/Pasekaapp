@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0run-diagnosis.ps1"
echo.
pause
endlocal
