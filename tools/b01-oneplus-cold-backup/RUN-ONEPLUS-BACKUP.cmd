@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0choose-backup-destination.ps1"
if errorlevel 1 (
 echo Backup was blocked. No APK or OnePlus data was changed.
 pause
)
endlocal
