PASEKA B01 / Windows / ONE STANDALONE TEST V12
================================================

1. Unzip this SINGLE ZIP into ANY NEW local folder. Do NOT copy
   files into your old V9, V9.1, V10 or V11 directories.
2. Double-click START.cmd. It is the ONLY entrypoint for the user.
3. The test searches for PREVIOUS public-only-v9.tar under old
   results/run-*/ folders, read-only and without moving any file.
   It includes redirected Downloads and all available fixed local
   drives (maximum 25,000 directory visits; 90 seconds per tier).
   No personal file contents are scanned.
4. If automatic discovery fails, Windows offers to SELECT the
   EXISTING public-only-v9.tar file in place. Do NOT copy it.
5. If none exists and you CANCEL the file dialog, the test offers
   to type PUBLIC for a NEW PUBLIC-ONLY USB read-only probe.
   Only typing the exact word PUBLIC authorizes that public test.
   No user consent -> no ADB and safe BLOCKED result.
6. Even with PUBLIC, private app data is NOT accessed, no
   CAPTURE prompt is presented and no APK/restore/delete occurs.
7. Share ONLY the newest:
   unified-results/run-*/b01-unified-result.json
   Never share any TAR, .db, media, phone logs or private filenames.

Safety and limitations:
- The local search skips reparse points, system directories,
  network root paths; count and time are bounded.
- Search returns only counts / classes; file paths are NEVER
  included in the JSON.
- This detects the cause class of the PUBLIC TAR error; it
  DOES NOT produce a complete backup or independent restore.
- Even if the public TAR is syntactically valid, B01 remains
  BLOCKED for actual OnePlus app backup and media coverage.
- Use only official ADB >=1.0.41 with shell_v2 for any
  explicitly authorized PUBLIC-only USB test.
- Do not alter or delete prior results or old archives.
- If your archive is unavailable and no USB permission is
  given, the result correctly records lack of evidence.
