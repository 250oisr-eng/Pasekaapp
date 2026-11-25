@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0B01-PUBLIC-TAR-FORENSIC-V10.ps1"
echo.
echo Share ONLY the JSON in forensics-results. NEVER share public/private TAR.
pause
