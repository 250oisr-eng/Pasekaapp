# P2 — безопасный список видеозаписей по метаданным (25.11.2026)

## F0–F2
Current main `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2` reads all `entrance_media` objects through `getAll()`, retaining original video Blob objects even when rendering a text-only queue. A previously prepared solution exists in stacked Draft #425; **only** its `listEntranceVideos()` routine and focused regression test were selectively carried into a new root Draft. No other code from #425 (including deletion paths) is copied.

**LIMITED_SAFE_DRAFT:** purely read-only cursor enumeration into metadata-only array; existing `getEntranceVideo(id)` continues to read complete original on demand. User-facing sort order remains descending `capturedAt`. No change to stored format, schema, stores, write transactions, reference identity, app profiles, camera, AI model, or media retention.

## F3–F5 invariants
- Original video Blob must not be written, removed, truncated or replaced.
- Cursor transaction is `readonly`; Promise succeeds only after transaction `oncomplete`. Aborts/errors reject.
- Metadata projection preserves original fields except binary `blob`, including legacy records; schema and history are not migrated.
- `tests/p2-entrance-metadata-cursor.test.mjs` checks order, fields, Blob byte SHA after DB close/reopen, legacy fixtures, failure propagation, and absence of `getAll/put/delete/clear` in the list routine.
- Real OnePlus RAM/battery savings are **NOT_MEASURED**. A cursor returning `cursor.value` still clones one record with its Blob per step; this patch reduces simultaneous retained originals, **not** necessarily all browser transient memory consumption.
- P0 full video recovery, physical real recognition and auto-deletion remain BLOCKED / FROZEN #442.

## F6
No merges, deployment, APK install, external permissions, user-data writes, or original-video deletion. Exact GitHub Fast/Android/Governance CI results must be checked by SHA; physical device proof is separately gated.
