# Android Restore335 — V9 null-delimited read-only type observation

Date: 2026-11-22. Device: user-confirmed OnePlus NE2213 / API 36, isolated diagnostic package `ru.paseka.journal.archive.restoreproof335`.

## Confirmed physical evidence from V8

Actual JSON `ANDROID_RESTORE335_FIND_SHAPE_V8`: `status=BLOCKED`, `detail=PRIVATE_FIND_PATH_MISMATCH_PRESERVE`, `findMismatchFilter=f`, `findMismatchClass=OTHER_OPAQUE_MISMATCH`, `privateEntryCount=1`, `privateEntryType=NOT_TESTED`, `privateInput=UNKNOWN_PRESERVE`. Pinned ADB SHA, single authorized phone, exact model/API, triple PM identity, isolated `run-as`, directory/path checks passed; `writes/installs/mediaRead=NOT_ATTEMPTED`, `cleanup=NOT_AUTHORIZED`. The wrapper printed `V8_BLOCKED_REPORTED_IN_JSON`, consistent with intended blocked exit. One nonempty find output for filter f is **a lead, not yet proof of a validated file type**.

## Why V9 differs

V7/V8 compared Toybox's displayed path text with a path formed from `ls -A` output. V8 demonstrated that this exact string comparison can fail, but did not establish why; do **not** silently accept an arbitrary path prefix or infer names.

The upstream Android Toybox `find` command supports `-mindepth`, `-maxdepth`, `-type [bcdflps]` and `-print0` (null-terminated match output): https://android.googlesource.com/platform/external/toybox/+/refs/heads/main/android/linux/generated/help.h . V9 uses the type predicate and NUL-terminated record count, not pathname spelling.

## Hard boundaries

- Inherit V4/V8's SHA-pinned ADB binary, exactly one authorized NE2213/API36, diagnostic package PM triple confirmation, production app left untouched, read-only private cwd test, `files` existence and exactly-one-entry check.
- Only seven fixed `toybox find files -mindepth 1 -maxdepth 1 -type <one of f,d,l,b,c,p,s> -print0` commands; no file names from user, shell escaping, `-L`, `-exec`, `-delete`, output-file, MediaStore or reading file payload.
- Accept empty output as zero results, or exactly ONE nonempty NUL-terminated record no longer than 4,096 characters. Reject truncated, multi-record, unterminated, oversized and contradictory class results; re-list source folder and replay the positive filter with exact equality before reporting the coarse kind.
- No names, paths, raw matches, mode bits, timestamps, sizes, symlink targets, video bytes or archive content in JSON.
- `typeEvidence=ONE_NULL_TERMINATED_MATCH_PRESERVE` describes a read-only *type-filter observation*, **not ownership or archive validity**. `privateInput=UNKNOWN_PRESERVE`; `cleanup=NOT_AUTHORIZED` always. `PASS` is not a media recovery, 2-MP4 restoration, recognition, or safe-delete result.
- If phone Toybox does not support `-print0`, stop `BLOCKED` without retry or alternate commands. The supported feature in upstream sources is not a physical device guarantee.
- No production data, IndexedDB, backups, installation, uninstall, main merge or deployment.

## Testing and status

`tests/android-restore335-private-null-type-v9.test.mjs` checks static privacy/safety invariants. Windows CI parses the full PowerShell and runs actual synthetic framing fixtures isolated from any ADB/device; general Android build is a separate check. Real V9 device test: **NOT_TESTED** at creation. Final CI assertions must be tied to exact code HEAD and distinguished from physical validation.
