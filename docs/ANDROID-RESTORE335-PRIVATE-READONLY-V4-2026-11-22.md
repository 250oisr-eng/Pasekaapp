# Android Restore335 private read-only V4 — 2026-11-22

## Physical evidence
User supplied V3 result: `status=BLOCKED`, `detail=PRIVATE_FILES_NONEMPTY_NO_ACTION`. Pinned ADB, NE2213/API36, exactly one authorized device, diagnostic PM triple check, directory/path predicates PASS. Private `files` exists and is nonempty. `privateInput=UNKNOWN_PRESERVE`. No install, write, media read or cleanup.

## V4 change
`tools/android-restore335-private-readonly-stage-v4.ps1` is a copied V3 with only the nonempty-directory gate adjusted. It runs bounded `toybox ls -A files` inside the exact isolated `run-as ru.paseka.journal.archive.restoreproof335` context after unchanged device/package/pwd checks. Listing remains in process memory. V4 explicitly retains whitespace in filenames and removes only trailing CR/LF transport delimiters; an exact-command guard prevents this mode for any other ADB command. It reports **only the count** (1–64); it emits no names, file contents, sizes, hashes, or directory paths. A null-byte or unbounded count blocks. It never traverses entries, launches apps, installs, restores, overwrites, removes, moves, or reads media.

`status=PASS` only means the constrained directory inventory completed; it does NOT imply that restore input exists or that any MP4 is valid. `privateInput=UNKNOWN_PRESERVE`, `cleanup=NOT_AUTHORIZED`. A directory with more than 64 entries blocks to avoid unbounded observation; absence and contradiction paths preserve V3 semantics.

## Tests / risk
`tests/android-restore335-private-readonly-v4.test.mjs` verifies static invariants; Windows workflow parses PowerShell and runs Node static checks. These checks are not physical device proof. Android environment cannot be invoked through this GitHub connector. CI must be checked on exact HEAD before test PASS is claimed.

**Known limitation:** `ls -A` is newline-delimited, so an entry containing a newline may be counted as more than one; the count is diagnostic only and not authoritative for a restore decision. Unexpected or sensitive contents remain unknown, untouched. In a future step, design an explicitly verified file-provenance check before considering restore. No automatic cleanup or source deletion.

## Non-goals
No production application install, PWA release, main merge, user-media deletion, real bee recognition, two-MP4 restore, backup mutation or external directory access.

## Confirmed physical V4 (2026-11-22)
User ran the pinned launcher on OnePlus NE2213/API36 and supplied exact JSON: `status=PASS`, `adb/device/model/sdk/adbSha256=PASS`, diagnostic package `PRESENT_UNTOUCHED`, production package `ABSENT`; all three PM observations present; `directoryTest=TRUE`, `pathTest=TRUE`, `privateFilesClass=NONEMPTY_PRESERVE`, `privateEntryCount="1"`, `privateInput=UNKNOWN_PRESERVE`, `writes=NOT_ATTEMPTED`, `mediaRead=NOT_ATTEMPTED`, `cleanup=NOT_AUTHORIZED`. This proves only one observed entry in the isolated diagnostic private `files` listing, **not its name, type, original provenance, video validity or restore readiness**.

The Windows CMD wrapper then printed `V4_DEVICE_CHECK_BLOCKED_OR_FAILED` despite the JSON `PASS`. The wrapper was checking `$LASTEXITCODE`, but the script's PASS branch did not explicitly `exit 0`; a stale external-command exit status is a plausible cause of this **wrapper-level false failure**, not evidence of Android-side failure. To remove this ambiguity, the script now explicitly exits 0 on PASS and 2 on BLOCKED, with a dedicated static regression. This later change has not been physically retested; the actual V4 device observation remains trustworthy within its limited read-only scope.

Do not rerun V4 merely to clear the launcher message. Do not clear, install over, uninstall, restore, read or delete unknown data. The next stage should be a carefully bounded, explicitly read-only provenance/type inspection of the **one** private entry, designed and tested before any physical execution. No user-input media should be read to identify it without a separate safety review.
