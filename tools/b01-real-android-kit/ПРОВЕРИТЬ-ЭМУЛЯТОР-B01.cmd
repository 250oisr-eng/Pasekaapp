@echo off
setlocal
cd /d "%~dp0"
echo PASEKA B01 - emulator-only preflight. No data transfer.
node "%~dp0b01-emulator-owner-stage.mjs" --probe
echo.
echo To stage a verified COPY of the archive to a confirmed emulator only,
echo run the following command after reviewing the code:
echo   node b01-emulator-owner-stage.mjs --stage
echo.
echo No physical OnePlus or production package is ever selected.
pause
