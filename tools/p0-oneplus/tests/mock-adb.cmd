@echo off
setlocal EnableExtensions
if not defined P0_MOCK_STATE_DIR (echo ERROR: mock directory missing 1>&2 & exit /b 91)
if "%~1"=="devices" goto devices
if "%~1"=="-s" shift
if "%~1"=="MOCKSERIAL" shift
if "%~1"=="shell" goto shell
if "%~1"=="install" goto install
if "%~1"=="logcat" goto logcat
echo Unexpected mock command: %* 1>&2
exit /b 90
:devices
echo List of devices attached
echo MOCKSERIAL  device product:OnePlus model:NE2213
exit /b 0
:shell
shift
if "%~1"=="getprop" goto getprop
if "%~1"=="pm" goto pm
if "%~1"=="date" (echo 1770000000&exit /b 0)
if "%~1"=="monkey" (echo Events injected: 1&exit /b 0)
if "%~1"=="am" (echo restart>"%P0_MOCK_STATE_DIR%\stopped.flag"&exit /b 0)
echo Unexpected shell command: %* 1>&2
exit /b 92
:getprop
if "%~2"=="ro.product.model" (echo NE2213&exit /b 0)
if "%~2"=="ro.build.version.sdk" (echo 36&exit /b 0)
exit /b 93
:pm
if exist "%P0_MOCK_STATE_DIR%\installed.flag" echo package:/data/app/mock/base.apk
exit /b 0
:install
if "%P0_MOCK_INSTALL_FAIL%"=="1" (
 echo Failure [INSTALL_FAILED_TEST] 1>&2
 exit /b 1
)
echo 1234 KB/s (8354671 bytes in 1.0s) 1>&2
echo Success
echo installed>"%P0_MOCK_STATE_DIR%\installed.flag"
exit /b 0
:logcat
if exist "%P0_MOCK_STATE_DIR%\stopped.flag" (
 echo 1770000002.000  123  456 I chromium: PASEKA_P0_DISASTER_PROOF_RESULT {"packageId":"ru.paseka.journal.disasterproof2","status":"PASS","code":"P0_DISASTER_WEBVIEW_RESTORE_PASS","checks":[]}
 echo 1770000003.000  123  456 I chromium: PASEKA_P0_DISASTER_PROOF_RESULT {"packageId":"ru.paseka.journal.disasterproof2","status":"PASS","code":"P0_DISASTER_PHYSICAL_RESTART_PASS","checks":[]}
) else (
 echo 1770000002.000  123  456 I chromium: PASEKA_P0_DISASTER_PROOF_RESULT {"packageId":"ru.paseka.journal.disasterproof2","status":"PASS","code":"P0_DISASTER_WEBVIEW_RESTORE_PASS","checks":[]}
)
exit /b 0
