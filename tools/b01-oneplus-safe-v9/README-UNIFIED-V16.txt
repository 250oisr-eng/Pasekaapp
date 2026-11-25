PASEKA B01 / V16 SINGLE INDEPENDENT OFFLINE ARCHIVE VERIFICATION
================================================================

WHY:
Real OnePlus NE2213 report dated 2026-11-25 documented a PRIVATE
candidate on the local PC and a matching local manifest. This software
must recalculate its actual SHA-256 locally; no user's private-file hash
or archive bytes are embedded in this public ZIP or GitHub source.
A CHILD JSON alone is NOT independent restore proof.

ONE ACTION, ONE FINAL REPORT:
1. Extract ONLY this new ZIP into ANY NEW local Windows folder.
2. Double-click START.cmd. NO USB or Android phone needed. Do not open
   other .ps1 files, do not copy previous scripts or archives.
3. Send ONLY B01-RESULT.json next to START.cmd, selected automatically
   in Windows Explorer. Never send tar, manifest, raw app data or logs.

HOW IT WORKS (all PC-local, no network):
- Finds the latest eligible candidate with MANIFEST.json under
  %USERPROFILE%\PASEKA-B01-KEEP-PRIVATE-CANDIDATES\candidate-<GUID>\.
  It does NOT use, search or require old diagnostic/test folders.
- Requires a local fixed drive, rejects reparse points, missing/corrupt
  manifest, unexpected size, wrong SHA-256 and TAR problems.
- Preflights all TAR headers, checksums, sizes, paths and EOF before any
  extraction. Forbid symlinks, hardlinks, Windows device names, traversal,
  duplicate member names and unrecognized TAR entry types. No arbitrary
  destination paths are accepted.
- Makes a NEW EMPTY PC-only reconstruction folder:
  %USERPROFILE%\PASEKA-B01-KEEP-PRIVATE-CANDIDATES\pc-reconstruction-<GUID>
  Copies only safe regular files and directories from the verified TAR,
  then independently re-opens and byte-compares each reconstructed file
  with the corresponding original TAR payload.
- Re-hashes the original TAR afterwards to confirm it stayed unchanged.
- If the reconstruction fails, never call it a backup. The partial
  local folder is marked INVALID-PC-RECONSTRUCTION-NOT-BACKUP.txt and
  is never deleted automatically. A repeated START never overwrites
  the previous B01-RESULT.json or any archive.
- Reconstructs only files actually present in the private candidate TAR.
  Does not independently inventory original phone videos or Gallery data.

IMPORTANT SECURITY:
- This test reads PRIVATE local app data; both the original candidate
  and the reconstructed files stay on YOUR PC. Do NOT share either.
  It will create a SECOND local plaintext copy of files inside the TAR.
  Safeguard your Windows account and disk. These are NOT cloud backups.
- Do NOT delete either persistent candidate folder or the reconstruction
  folder while archive verification/recovery is pending.
- No phone read/write, ADB, APK install, force-stop, network, restore to
  the Android app, or video deletion.
- PC reconstruction is NOT a functioning app restore. IndexedDB schema,
  Gallery/MediaStore, other origins, media completeness, independent
  Android restore, version migrations and startup remain NOT_TESTED.
- B01 BLOCKED until those are verified. This package never claims full
  backup based only on a TAR/PC readback PASS.

REQUIRES:
- Windows PowerShell 5.1 (built into Windows).
- The V15 PRIVATE candidate and its manifest in the persistent directory
  ABOVE, NOT any previous test package. If absent, script fails safely.
- Sufficient PC disk space (at least reconstructed bytes plus 64 MiB).
- Fixed local storage, not network mounts or symlinks. If the Windows
  user profile is synced by separate cloud software, disable that sync
  for confidential files before running; this program cannot control it.

BUNDLE: exactly START.cmd, RUN-ONEPLUS-UNIFIED-V16.ps1, README.txt.
