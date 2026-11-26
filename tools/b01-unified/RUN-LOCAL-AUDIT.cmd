@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0choose-local-files.ps1"
if errorlevel 1 (
  echo Local audit did not complete. No APK or OnePlus data was changed.
  pause
)
endlocal
