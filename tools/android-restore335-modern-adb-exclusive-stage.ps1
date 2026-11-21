# Retired after the physical NE2213/API36 parser probe in PR #341.
# Keep the entry point for callers of older instructions. No device operations.
[CmdletBinding()]
param([string]$AdbPath)

Write-Host 'STATUS: BLOCKED'
Write-Host 'DETAIL: RESTORE335_DD_CONV_EXCL_REJECTED_ON_NE2213'
Write-Host 'ANDROID_PRIVATE_WRITE: NOT_ATTEMPTED'
Write-Host 'RESTORE_COMMIT: NOT_TESTED'
Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
exit 2
