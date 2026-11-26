# B01 — selective read-only TAR header audit from historical PR #509

**26.11.2026 · F0–F2.** On verified `main=fbc4fb82c2ae8d7b33e10e4b3e8982f77c0b7633`, `scripts/audit-oneplus-tar.mjs` and its negative tests were absent. The old #509 includes useful *local TAR header indexing* but an outdated `PROJECT_STATUS.md`. This is a minimal main-based port of only the missing reader and independent regression tests.

**F3 scope.** Node.js only. Open an expressly specified local regular file read-only, cap at 512 MiB, validate header checksums/octal fields/block bounds/EOF/traversal, report counts of *recognized filename patterns* (IndexedDB/LevelDB/SQLite/media). Unsupported TAR metadata is marked REVIEW_REQUIRED. Added tests confirm no archive mutation and reject oversized maxBytes overrides. No extraction, restoration, file deletions, ADB, app installation, phone access, user data in Git or network calls.

**F4 safety.** Presence of matching filenames is not evidence that the file is a complete/usable backup. Absence of recognized paths is not evidence of absent phone data. Unsupported formats or external media sources remain unknown. `allUserDataBackedUp`, `independentRestoreVerified` and `videoRecoveryVerified` always report `false`. This parser does not replace bounded JSON archive verification or the independent full-restore B01 gate.

**F5–F7.** Full and negative Node regressions and appropriate CI must pass on exact new PR HEAD. Passing CI authorizes neither a production restore nor release. On OnePlus, original videos and all backups remain untouched; B01, B04/B05 and #442 restrictions remain unchanged. After selective integration, historical #509 can be closed as superseded with branch and original physical reports preserved.
