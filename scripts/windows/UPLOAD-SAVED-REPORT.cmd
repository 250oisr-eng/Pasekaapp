@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Upload-Saved-Report.ps1"
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
