# Android video archive — two independently pinned synthetic MP4s, isolated app export regression

Date: 2026-11-21. Branch: `test/android-two-blob-app-export-gate-2026-11-21`, stacked Draft PR #325 on #324.

## Fixture provenance and hashes

Two video files were generated locally using FFmpeg (solid black and white frames, each 16×16, 1 fps, 1 second, MPEG-4 Part 2 in MP4). Both local files are 893 bytes. `ffprobe` parsed one MPEG-4 video frame at 16×16 in the black fixture; the fixtures' base64 bytes are pinned in `tests/video-archive-two-blob-export.test.mjs`. These are entirely synthetic; no real bee footage, protected data, third-party license, or download is involved. Android hardware/software decoding is **NOT TESTED**.

- Black source SHA-256: `794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f`.
- White source SHA-256: `bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff`.

## Regression scope

The tests load the **actual application** `js/paseka-archive.js` and exercise `exportArchiveFromDatabase`, `parseArchiveBlob`, `verifyArchive`, `readArchiveEntry` and `validateArchiveForRestore`. They compare independent SHA-256 values for both inputs with the exported entry bytes, and check archive metadata, deterministic sort and lack of orphan hive references. Another test uses `fake-indexeddb` with `main` and `entrance_media`, writes two synthetic video records to a brand-new isolated DB, closes and reopens it, then reads and exports the same exact bytes. No existing database is opened.

Negative cases: single-bit media corruption, missing source Blob, and a nonempty recognition ledger triggering fail-closed legacy PASEKA01 export.

## Evidence / safety boundary

- Previous physical external archive result `EXTERNAL_TWO_BLOB_SHA_PASS` is in `docs/ANDROID-SYNTHETIC-TWO-VIDEO-PHYSICAL-RESULT-2026-11-21.md`. That external source is separate from the two new pinned playable fixture bytes.
- `npm test` and CI are **NOT ASSUMED PASS** until exact-head results have been inspected.
- This code is an isolated Node regression, **not an Android test APK**. No physical Android restore, real application UI capture/export, hardware MP4 playback, automated bee recognition, or source deletion has been demonstrated.
- `recognitionSucceeded=false`, `cleanupAuthorized=false` throughout. No deletion, reset, uninstall, main merge or production deployment.

## Next blocked proof

Only after verifying CI on exact head: integrate the same two pinned fixtures through the isolated archive test APK's normal capture/storage path, export PASEKA01 from the real test app, re-read both video source SHA, stop and relaunch the test package, then verify both app-export and IndexedDB. Do not use or overwrite any existing user videos or archives; if the test package already holds data, choose a new isolated test package, never clear it silently.
