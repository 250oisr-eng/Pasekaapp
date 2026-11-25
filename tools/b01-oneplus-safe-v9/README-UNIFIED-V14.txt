PASEKA B01 / SINGLE TEST V14 - PUBLIC USB TRANSPORT / WINDOWS
===========================================================

WHY V14:
Your 2026-11-25 read-only OnePlus V9.1 result:
  PUBLIC_TAR_INVALID_TAR_BLOCK_ALIGNMENT_OR_LENGTH_INVALID
The uploaded intermediate b01-v9-result JSON cannot show why: no
byte length, remainder or TAR classification. This V14 captures those
facts, automatically compares two PUBLIC-ONLY transports if necessary,
and produces exactly ONE JSON at the root of the new test folder.

ONE LAUNCH:
1. Extract this ONE ZIP into a NEW LOCAL Windows folder. Previous
   V8-V13 test files and reports can be absent/deleted. Do not copy
   anything into the new folder from old test runs.
2. Connect authorized OnePlus NE2213 by USB and close app normally.
   Use official Android SDK adb.exe >=1.0.41 with AdbWinApi.dll.
   Keep the files from the official SDK in the standard Android path
   or supply official platform-tools in a subfolder of this test.
3. Double-click START.cmd.
4. SEND ONLY B01-RESULT.json next to START.cmd. The runner
   automatically selects the JSON in Windows Explorer.

WHAT IT DOES:
- Checks exact device, ADB version, shell_v2, run-as privilege
  and app process stopped with existing fail-closed gates.
- Makes one new small PUBLIC system TAR via ADB shell, classifies
  byte count, remainder modulo 512, header, EOF and printable/error
  tail. If that public transport fails at TAR gate, tries the SAME
  public-only test with adb exec-out for comparison.
- Uses only bundled scripts in the new ZIP. No previous tests needed.
- Never prompts for CAPTURE and never reads app-private data.
- Never installs APK, writes to the Android app, force stops it,
  restores, uninstalls, clears data, deletes media, or uses network.
- Original generated PUBLIC test TARs stay in the local subfolder.
  Do NOT attach or upload TAR, logs, media or private data.
- If B01-RESULT.json already exists in that folder, the script
  does not overwrite it. Re-extract the ZIP to a NEW folder for a
  different run.

WHAT IT DOES NOT PROVE:
- PUBLIC file TAR is NOT an app/IndexedDB/video backup, even if valid.
- No independent restore or original video cleanup is authorized.
- The result may narrow the cause of the previous TAR error, but
  cannot prove an unsupported root cause from partial evidence.
- B01 remains BLOCKED until all live data/media + independent restore
  are verified. Never delete real original media or real backups.

BUNDLE (exactly 5 files):
  START.cmd
  RUN-ONEPLUS-UNIFIED-V14.ps1
  B01-ONEPLUS-SAFE-V9.ps1
  B01-PUBLIC-TAR-FORENSIC-V10.ps1
  README.txt
