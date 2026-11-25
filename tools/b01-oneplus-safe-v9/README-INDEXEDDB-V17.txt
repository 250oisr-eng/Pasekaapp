PASEKA B01 V17 / INDEXEDDB FILE-SET AUDIT (PC ONLY)
==================================================

This does NOT restore the Android app or read database records.

1. Extract this new three-file ZIP to a new PC folder.
2. Double-click START.cmd. No phone, ADB or previous test package is used.
3. Share ONLY B01-RESULT.json from beside START.cmd. Never upload any
   TAR, MANIFEST, app_webview files, PC reconstruction or private folder.

The tool automatically finds the newest persistent pc-reconstruction-<GUID>
under %USERPROFILE%\PASEKA-B01-KEEP-PRIVATE-CANDIDATES\. The prior V16
reconstruction must remain preserved. The tool enumerates *only* local
filesystem metadata (paths for classification, size/count), never reads
file contents and never prints/exports real paths, names or records.

It checks for WebView IndexedDB .leveldb directories containing markers
CURRENT, MANIFEST-* and at least one *.ldb/*.sst/*.log. Positive status
PC_INDEXEDDB_FILESET_MARKERS_FOUND_NOT_RESTORED means ONLY that a
plausible file set exists. It does NOT validate LevelDB CRC, database
schema, journal history, usable IndexedDB, Android restore, Gallery or
video completeness. Absence of markers requires review, not deletion.

Symlinks/junctions, unsafe/nonlocal roots, incomplete V16 folders,
excessive members and oversized trees are rejected. There are no
writes to source data, network calls, ADB operations or cleanup.
Only a fresh B01-RESULT.json is written beside the V17 START command;
an existing report is not overwritten. No private data enters Git/CI.

DO NOT DELETE the original TAR, its manifest or V16 reconstruction.
Keep all source files protected in your local Windows account.

FURTHER BLOCKERS: Independent recovery of a functioning Android/WebView
IndexedDB on an isolated blank target, exact records/media and all
Gallery/MediaStore origins remain NOT_TESTED. No APK update, app wipe,
video deletion or production restore is authorized.
