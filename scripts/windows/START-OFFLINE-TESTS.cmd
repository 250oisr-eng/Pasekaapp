@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MANUAL OFFLINE TEST - ISOLATED APK ONLY
echo Before continuing, turn OFF both Wi-Fi and mobile data on OnePlus.
echo No device network setting will be changed by this script.
echo Connect authorized USB and press any key to begin.
pause >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-Paseka-Tests.ps1" -Offline
echo.
pause
