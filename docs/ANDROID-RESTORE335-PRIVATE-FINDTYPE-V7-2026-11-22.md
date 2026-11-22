# Android Restore335 V7 — read-only file type using bounded Toybox find

Date 2026-11-22. Confirmed physical V6 JSON: `status=PASS`, `privateEntryCount=1`, `privateEntryType=UNKNOWN_PRESERVE`, `metadataFormat=UNKNOWN_MODE_FORMAT_PRESERVE`; all pinned ADB/device/package gates passed; no installations, writes, payload reads or cleanup.

## Decision

Do **not** relax the unknown `ls -lA` permission-mode parser again: the device reported unknown, without raw metadata; causes cannot be distinguished from a JSON-only report. Switch to Android Toybox `find`'s documented type filters `-type [bcdflps]`, `-mindepth`, `-maxdepth` rather than guessing mode formatting. Source: [Android upstream toybox help](https://android.googlesource.com/platform/external/toybox/+/988e2e2ba7c9a7540de39bb77185f20c83da8eb6/android/mac/generated/help.h).

## V7 safety contract

`tools/android-restore335-private-findtype-stage-v7.ps1` inherits V4's pinned ADB SHA, single authorized OnePlus NE2213/API36, three PackageManager diagnostic-package observations, pinned `run-as` working directory, read-only `files` existence checks and shallow `ls -A` count. Requires exactly one entry and rejects control characters in its private in-memory name.

Seven **fixed literal** `toybox find files -mindepth 1 -maxdepth 1 -type TYPE` queries (TYPE in f,d,l,b,c,p,s), no `-L`, `-exec`, `-delete`, filename arguments, traversal deeper than one level, payload read or write. Each result must either be empty or match the one private in-memory path exactly; zero classes becomes `UNKNOWN_PRESERVE`, more than one class blocks, unexpected format/path blocks. Re-list `files` and block if changed. JSON reports only type class, not name, size, raw path or bytes.

`privateInput` remains `UNKNOWN_PRESERVE`. Even `REGULAR_FILE` does not prove that a valid archive, source video or 2 MP4 restore input exists. Cleanup, application installation and restoration are prohibited; no main merge/deployment.

## Verification and limitations

Windows PowerShell parser + Node static negative tests and general Android build/CI on exact SHA are required before optional device testing. A formatted command being valid for an upstream Toybox version is not proof it works on this exact phone; real V7 remains NOT_TESTED. No new device test should be requested before full software checks. Files with unusual names or changes during observation fail closed.
