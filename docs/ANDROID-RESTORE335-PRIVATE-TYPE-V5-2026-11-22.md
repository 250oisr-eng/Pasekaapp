# Restore335 V5 — read-only type classification of one diagnostic private entry

Date: 2026-11-22. Based on user-confirmed physical V4 result: `status=PASS`, exactly one `files` entry, names and type unknown, no video/media bytes read, no writes, no cleanup.

## Purpose and boundary

Do not attempt restoration. After all V4 pinned ADB / single authorized NE2213 API36 / three PM observations / private `run-as` checks, V5 lists exactly one private `files` entry by `toybox ls -A files`, then obtains only shallow metadata from `toybox ls -lA files`. The script returns only a coarse kind (REGULAR_FILE, DIRECTORY, SYMLINK_NO_FOLLOW, OTHER_NO_FOLLOW) and count. No filenames, paths, size, timestamps or Blob bytes are emitted. It repeats the `ls -A` listing and fails closed if changed.

Metadata output is handled only in-process; permission errors, unexpected format, multiple entries, binary content, or listing change lead to BLOCKED without writes. It does not read file payload, follow symlinks, walk directories, launch the app, install, restore or delete.

## Limitations / non-proofs

- `ls -lA` output format can vary with Android/toybox; unmatched format is BLOCKED rather than guessed.
- Filenames with embedded newlines or unusual control characters may invalidate inference; do not infer provenance.
- Metadata is a point-in-time observation subject to concurrency; two inventory snapshots reduce ambiguity but do not establish immutable ownership.
- A REGULAR_FILE is **not evidence** of valid input, MP4, source-original, archive, or recoverability; `privateInput=UNKNOWN_PRESERVE`.
- Any PASS indicates only the read-only type metadata operation completed. No physical execution has yet been performed.
- Source media and protected backups remain untouched. `cleanup=NOT_AUTHORIZED`. Actual bee recognition and full two-MP4 restore are not verified.

## Verification

`tests/android-restore335-private-type-v5.test.mjs` (static negative invariants), `.github/workflows/android-restore335-readonly-v5.yml` (Windows PowerShell parser and Node tests). Await exact SHA CI before any manual test; physical execution needs access to user's PC/phone, which the GitHub connector does not provide.

No main merge, production deployment or data mutation is authorized.
