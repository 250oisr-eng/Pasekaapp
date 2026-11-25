PASEKA B01 / V15 SINGLE INDEPENDENT PC CANDIDATE CAPTURE
========================================================

IMPORTANT: This reads PRIVATE app data from your OnePlus ONLY if you type
CAPTURE. A safe candidate is NOT a complete backup and restore is NOT tested.
Never upload private TAR, MANIFEST or raw data to any chat or cloud.

WHY: Real OnePlus NE2213 V14 proved public adb shell returned 2050 bytes
(2 extra bytes; invalid TAR), whereas exec-out returned a valid 2048
byte public TAR. This version uses binary exec-out for BOTH the public
preflight and, separately, a gated private candidate.

ONE CLEAN PACKAGE / ONE LAUNCH / ONE JSON:
1. Unzip this single ZIP into any NEW Windows folder. No old tests needed.
2. Connect your authorized OnePlus via USB. Close the Paseka app normally.
   Official SDK ADB >=1.0.41 and Windows PowerShell 5.1 must be available.
3. Double-click START.cmd. The tool checks app stopped, model, adb and
   shell_v2, then tests binary exec-out PUBLIC TAR.
4. After public gate passes, one user consent is required:
   - Type exactly CAPTURE to authorize reading PRIVATE app data to a
     NEW LOCAL PC candidate file.
   - Press Enter / anything else to stop without reading private data.
5. Send ONLY B01-RESULT.json, shown automatically in Windows Explorer.
   Do not attach any TAR, MANIFEST, SQLite, video, log or other file.

PERSISTENCE: You delete old test folders. So when CAPTURE is approved,
the private TAR and MANIFEST are stored OUTSIDE this disposable test folder:
  %USERPROFILE%\PASEKA-B01-KEEP-PRIVATE-CANDIDATES\candidate-<random>\
Only fixed ready local drives are allowed, not a network drive or symlink
path. The code never overwrites an existing candidate. DO NOT delete that
folder. If it is removed, the candidate and any future restore evidence
are lost; another extraction would be necessary.

LIMITS AND SAFETY:
- Device side: reads via ADB, no writes, APK install/uninstall, clear,
  force-stop, restore, deletion or network uploads.
- Local PC: creates a fresh private candidate + SHA256 manifest; no
  overwrites. Public diagnostic stream <=64 MiB; private <=8 GiB.
- If phone access, permissions, app state, disk or TAR verification fail,
  stop with a BLOCKED report; incomplete candidates are NOT backups.
- Even after successful capture, Gallery/MediaStore, separate originals
  and other origins are NOT yet verified. Independent empty-target restore
  is NOT tested. NO APK update or deletion of video allowed.
- Candidate is local to the PC and is not a second offsite backup.
- No real private data or TAR is included in the released ZIP.

Bundled files: START.cmd, RUN-ONEPLUS-UNIFIED-V15.ps1,
B01-ONEPLUS-SAFE-V9.ps1, README.txt. All scripts are self-contained.
