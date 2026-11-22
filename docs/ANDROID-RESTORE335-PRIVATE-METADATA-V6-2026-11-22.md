# Android Restore335 V6 — safe metadata format classification (2026-11-22)

## Physical observation

On OnePlus NE2213/API36, user executed pinned V5 (script SHA PASS). All device/package/read-only gates passed. Exactly one item in diagnostic private `files`; `privateEntryType=NOT_TESTED`; `status=BLOCKED`, `detail=PRIVATE_METADATA_FORMAT_UNVERIFIED`. This is a format-validation block, **not evidence of corrupt media or lost data**. No install, write, media read or cleanup was attempted.

## Changes

V5 assumed exactly ten standard Unix permission characters followed immediately by whitespace. Some variants of `ls -lA` may have an extra ACL/SELinux suffix character. **That is a hypothesis, not established by V5 JSON.** V6 accepts exactly zero or one `.`, `+`, `@` suffix before whitespace, with strict ten-character mode validation. If no safe match, reports `privateEntryType=UNKNOWN_PRESERVE` and `metadataFormat=UNKNOWN_MODE_FORMAT_PRESERVE`; never guesses from the first character or raw output. It reports only coarse kind and format category; it does not print filenames, sizes, actual mode bits, paths or metadata lines.

V6 retains the pinned ADB SHA, exact one-authorized NE2213/API36 gates, diagnostic-only `run-as`, triple PackageManager observation, one shallow entry, and repeat `ls -A` consistency check. No content or symlink target reads, writes, restoration, deletion, or app launch. One entry may remain unknown after V6: this is an acceptable safe outcome.

## Limits

Even `REGULAR_FILE` is not a validated archive, original MP4, or restoration proof. `privateInput=UNKNOWN_PRESERVE` and `cleanup=NOT_AUTHORIZED` always. Any V6 PASS is an observation only; no automatic recovery or bee-recognition claim.

Windows PowerShell parser/static fixtures and general Android CI must pass on exact SHA before an optional device run. Physical V6 has NOT been run as of creation. No merge or deployment.
