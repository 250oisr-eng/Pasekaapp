# Fail-closed video queue transitions — 2026-11-20

## Context
Existing `PasekaEntranceAnalysis.transitionVideoQueue` accepted `details` with an unrestricted object spread, allowing a status update to overwrite `id`, `hiveId`, `blob`, `bytes`, `blobSha256`, or optimistic recognition flags. It also permitted a generic `analyzing → completed` transition without evidence from a real video recognizer or durable ledger. The production entrance capture queue is currently local-only and has no real video recognizer.

## Change
- The existing queue transition API remains available; allowed operational statuses and timestamps continue to work.
- `transitionVideoQueue(...,'completed',...)` now always returns `{ok:false,reason:'recognition_evidence_required'}`. A separate future verified recognition workflow must establish a durable, source-bound result; this API cannot assert it.
- Other transitions preserve every source and existing record field. Only `status`, `updatedAt`, specific known transition timestamps, and bounded `lastError` are newly computed. Unrecognized caller-supplied fields are ignored.
- Tests assert attempted changes to original source ID, hive ID, Blob, digest, bytes and optimistic `cleanupAuthorized` are ignored. Failure and retry transitions still function.
- The legacy deletion helper remains unconditional false, and the actual delete path remains rejected. No direct database writes or migration are introduced.

## Limitations
- This is a guard on this helper; it does not prove no other unsynchronized writer exists. A comprehensive write-path audit remains required before source and cleanup claims.
- The local JPEG stage from the preceding Draft PR is not connected to this queue or to a provider. No AI recognition or server upload was activated.
- Physical Android, camera-created external MediaStore copies, staging/backups, tombstones and deletion remain unresolved and blocked.
- CI must be checked on the exact SHA; a successful test suite does not substitute for physical-device tests.
