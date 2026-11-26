@echo off
setlocal
cd /d "%~dp0"
if not exist "node.exe" (
 echo BLOCKED: MISSING_BUNDLED_NODE
 exit /b 1
)
if not exist "inspect-diagnostic-signing.mjs" (
 echo BLOCKED: MISSING_SIGNER_PREFLIGHT
 exit /b 1
)
if not exist "app-debug.apk" (
 echo BLOCKED: MISSING_CANDIDATE_APK
 exit /b 1
)
if not exist "diagnostic-manifest.json" (
 echo BLOCKED: MISSING_MANIFEST
 exit /b 1
)
if exist "ONEPLUS-DIAGNOSTIC-SIGNER-RESULT.json" (
 echo BLOCKED: REPORT_ALREADY_EXISTS. Use a new extracted folder.
 exit /b 1
)
"node.exe" "inspect-diagnostic-signing.mjs"
echo.
echo This test NEVER installs, updates, clears, or uninstalls an APK.
echo Report: ONEPLUS-DIAGNOSTIC-SIGNER-RESULT.json
exit /b %errorlevel%
