@echo off
setlocal
cd /d "%~dp0"
if not exist "node.exe" (
 echo BLOCKED: isolated test runtime missing. Extract the complete GitHub Actions ZIP.
 pause
 exit /b 1
)
if not exist "app-debug.apk" (
 echo BLOCKED: diagnostic APK missing. Extract the complete ZIP.
 pause
 exit /b 1
)
if exist "ONEPLUS-RECOVERY-RESULT.json" (
 echo BLOCKED: prior report exists. Preserve it, do not overwrite.
 pause
 exit /b 1
)
"node.exe" "oneplus-recovery.mjs"
echo.
echo Report: ONEPLUS-RECOVERY-RESULT.json
echo Only isolated diagnostic package was eligible for installation.
pause
