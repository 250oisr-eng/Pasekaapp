PASEKA B01 V9 — RESTRICTED READ-ONLY ONEPLUS / WINDOWS

This tool does NOT repair the installed app or prove independent recovery.
It does NOT send data to ChatGPT, GitHub or a cloud service.

PRECONDITIONS
1. Windows PowerShell 5.1. ONE authorized USB OnePlus NE2213.
2. An official Google SDK Platform-Tools install with recent adb (1.0.41+).
   The tool looks for platform-tools\adb.exe next to START.cmd,
   then %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe.
   DO NOT copy only adb.exe without its official platform-tools DLL files.
   Download SDK Platform Tools only from https://developer.android.com/tools/releases/platform-tools
   and accept the Google SDK license yourself. This ZIP does NOT include Google's SDK.
3. Close the app ru.paseka.journal normally. The tool refuses to capture if a
   running app process is detected; it will NOT stop or reset the app for you.
4. Keep the ZIP in a LOCAL PRIVATE folder, not a cloud-synced folder.
5. DO NOT run START from OneDrive, Dropbox, public/shared folders or Git repository.
6. Free disk space for a private candidate >= 8 GiB. Output has a hard 8 GiB cap.

RUN
Double-click START.cmd. A public Android system file is tested first, via
ADB shell v2 (separate stderr/exit status). Any failure blocks private reads.
Only on a PUBLIC PASS, the script asks for literal CAPTURE. Any other input
stops after public-only proof. New local TARs are never overwritten.

RESULTS
Share ONLY the newest results\run-*\b01-v9-result.json. NEVER upload .tar, APK,
private filenames, personal records, photos, videos or device logs.
The results folder may contain candidate/partial TAR files with sensitive data.
Keep those private, preferably encrypted at rest; do not treat partial files
as backups, and do not delete old archives without a separate decision.

LIMITS
The TAR covers only the app-private run-as cwd; external Gallery, MediaStore,
Downloads, Android external app files, other web origins, backups on the phone,
and recovery keys are not proven included. No restore has been tested.
Even a valid TAR is a CANDIDATE, not a full independent backup.
No install, force-stop, clear, restore, app writes, delete or remote capture.

V9.1 DIAGNOSTIC CORRECTION (25 NOV 2026)
The user V9 report failed before device identification: adb 1.0.41 was found,
but the script emitted only ADB_READONLY_COMMAND_FAILED and no TAR tests ran.
This was insufficient to identify which preflight command failed.
V9.1 records fixed probe IDs, numeric exit code and a REDACTED stderr class,
never stderr contents, serials, TAR member paths or app data.
If the FIRST `adb devices -l` returns exit 0 plus ONLY the canonical host
ADB server-started banner, exactly one clean `adb devices -l` retry is
allowed. Any other stderr/nonzero exit/repeated startup still BLOCKS.
This is a bounded host-startup exception, NOT permission to ignore TAR
stderr or remote errors. On error share only b01-v9-result.json.
The JSON has scriptRevision=v9.1-adb-host-startup-diagnostics.
