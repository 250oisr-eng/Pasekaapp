PASEKA B01 - INDEPENDENT PUBLIC-ONLY TEST V13 / Windows
======================================================
Current user contract: all previous test ZIPs/folders may already be deleted.
This package REQUIRES NO PREVIOUS TESTS, TARs, result JSONs or scripts.

ONE ACTION:
1. Extract this ONE ZIP into a NEW folder (any normal local folder).
2. Keep the OnePlus NE2213 connected by USB and Android debugging authorized;
   app ru.paseka.journal should be closed normally (do NOT force stop).
3. Double-click START.cmd. No other scripts need running or copying.
4. Share ONLY unified-results/run-*/b01-unified-result.json.

INCLUDED IN THIS ZIP:
- START.cmd, one launch point
- RUN-ONEPLUS-UNIFIED-V13.ps1, one aggregated sanitized report
- B01-ONEPLUS-SAFE-V9.ps1, bundled version 9.1 public-only USB probe
- B01-PUBLIC-TAR-FORENSIC-V10.ps1, bundled offline TAR classifier
- README.txt, this file
No old archive, APK, database, user data or result is included.

EXTERNAL HARDWARE / SDK PREREQUISITES:
- Windows with built-in Windows PowerShell 5.1, authorized OnePlus NE2213
- Official Android SDK platform-tools adb.exe >= 1.0.41 and AdbWinApi.dll
  already installed at %LOCALAPPDATA%\Android\Sdk\platform-tools;
  can also use platform-tools next to START.cmd if both files exist.
- A reliable USB link. No network or Android app install required.
If prerequisites are missing, the test fails closed and reports a code.

PRIVACY, SAFETY, HONEST STATUS:
- Never reads private app files: bundled probe is invoked only with -PublicOnly.
- Never installs, force-stops, clears, updates, restores, copies or deletes
  Android app or personal media.
- It tests whether Android ADB can transport a PUBLIC system-file TAR
  into a fresh PC local candidate, then classifies its integrity.
- Raw PUBLIC TAR stays on YOUR PC. Do NOT send TAR files, media, logs, keys,
  or any personal data; only send the one aggregate JSON.
- An acceptable PUBLIC TAR is NOT a backup of your app, IndexedDB or videos.
  Full backup and independent restore remain NOT_VERIFIED (B01 BLOCKED).
- This is a safe diagnostics step, NOT a full app data extraction.
- NO dependency on previous test folders; you may delete previous test
  folders on your own PC. Do not delete your REAL ORIGINAL data or backups.
