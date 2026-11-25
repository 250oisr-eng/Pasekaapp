@echo off
setlocal
cd /d "%~dp0"
if not exist "node.exe" (
  echo B01_BLOCKED_INCOMPLETE_WINDOWS_KIT
  pause
  exit /b 3
)
if not exist "scripts\run-b01-oneclick.mjs" (
  echo B01_BLOCKED_INCOMPLETE_WINDOWS_KIT
  pause
  exit /b 3
)
echo PASEKA B01: Local full-archive proof ONLY. Never changes your phone.
echo Looking for exactly one paseka-full-idb-YYYY-MM-DD.json beside this file, in Downloads, or on Desktop.
"node.exe" "scripts\run-b01-oneclick.mjs"
set "result=%ERRORLEVEL%"
echo.
echo Report: B01-FULL-ARCHIVE-RESULT.json (in this folder).
echo Do NOT send the original .json archive, TAR, videos or private data.
pause
exit /b %result%
