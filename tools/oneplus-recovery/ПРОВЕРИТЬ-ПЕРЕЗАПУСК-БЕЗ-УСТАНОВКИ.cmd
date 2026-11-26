@echo off
setlocal
cd /d "%~dp0"
if not exist "node.exe" (
 echo BLOCKED: diagnostic Node runtime missing. Extract the complete ZIP.
 pause
 exit /b 1
)
if not exist "diagnostic-manifest.json" (
 echo BLOCKED: diagnostic manifest missing. Extract the complete ZIP.
 pause
 exit /b 1
)
if exist "ONEPLUS-RESTART-ONLY-RESULT.json" (
 echo BLOCKED: prior restart report exists. Preserve it, do not overwrite.
 pause
 exit /b 1
)
"node.exe" "inspect-restart-only.mjs"
echo.
echo Report: ONEPLUS-RESTART-ONLY-RESULT.json
echo This probe NEVER installs, uninstalls, clears or replaces an APK.
echo Only the isolated diagnostic package is eligible for stop/relaunch.
pause
