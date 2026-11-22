# Android Restore335 — V7 physical mismatch / V8 opaque output-shape diagnosis

Date: 2026-11-22.

## Confirmed physical V7

User launched pinned V7 on OnePlus NE2213/API36; exactly one private item found in the isolated diagnostic package. ADB binary SHA, sole authorized phone, package triple-check, `run-as` directory and path tests passed. Result `status=BLOCKED`, `detail=PRIVATE_FIND_PATH_MISMATCH_PRESERVE`, `privateEntryType=NOT_TESTED`, `privateInput=UNKNOWN_PRESERVE`. `installs/writes/mediaRead=NOT_ATTEMPTED`; `cleanup=NOT_AUTHORIZED`. V7 Windows CMD subsequently reflected this BLOCKED status; it was not an independent media failure.

This report does NOT identify the item, prove that it is media/archive input, or establish that Toybox output is malformed. V7 rejected a path-string mismatch; raw text was correctly not emitted.

## V8 scope

`tools/android-restore335-find-output-shape-v8.ps1` inherits V7's complete identity/permission gates and strict shallow `find` type filters, with **no relaxation of exact path matching or any restoration/cleanup activity**. On the first mismatch only, its JSON adds a coarse `findMismatchClass` enum and the fixed filter character `findMismatchFilter` (one of f,d,l,b,c,p,s), never the private filename, path string, byte size, or raw stdout. Coarse classes: `DOT_SLASH_PREFIX`, `EXTRA_PATH_PREFIX`, `MULTILINE_OUTPUT`, `CONTROL_CHARACTER`, `OTHER_OPAQUE_MISMATCH`. If output matches, both fields are `NONE`.

Unexpected output still returns `BLOCKED` with `PRIVATE_FIND_PATH_MISMATCH_PRESERVE`; this is deliberate. The two shallow `ls -A` snapshots, single-entry requirement, exact diagnostic package and prior fail-closed behavior remain. V8 returns `PASS` only for a verified matching output and it never upgrades `privateInput` from `UNKNOWN_PRESERVE`.

## Non-goals and limits

No media content read, stat, symlink traversal, arbitrary filenames as command arguments, install, write, restore, delete, cleanup, production deploy or main merge. Even if an output-shape class is determined, it provides no file provenance or authority to manipulate content. No physical V8 has been performed as of creation; exact-SHA Windows static checks and Android CI must be reviewed before optional physical execution.
