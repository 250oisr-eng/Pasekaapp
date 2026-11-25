@echo off
setlocal
cd /d "%~dp0"
if not exist "node.exe" (
  echo PASEKA_CHECK_HUB_BLOCKED_INCOMPLETE_PACKAGE
  pause
  exit /b 3
)
if not exist "scripts\paseka-check-hub.mjs" (
  echo PASEKA_CHECK_HUB_BLOCKED_INCOMPLETE_PACKAGE
  pause
  exit /b 3
)
echo PASEKA 2.0: READ-ONLY OFFLINE CHECK CENTER
echo This does NOT modify your OnePlus, Android emulator, source archive or videos.
"node.exe" "scripts\paseka-check-hub.mjs"
set "result=%ERRORLEVEL%"
echo.
echo Only send the most recent report from PASEKA-CHECK-REPORTS.
echo Never send the original archive or private files.
if exist "PASEKA-CHECK-REPORTS" start "" explorer.exe "%~dp0PASEKA-CHECK-REPORTS"
pause
exit /b %result%
