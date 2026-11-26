# B04 — Windows Java discovery for read-only installed APK signer (selective port #517)

Date: 26.11.2026. **F0–F2:** Old #517 contains a useful isolated Windows Java resolver absent from live main. Current `scripts/check-oneplus-upgrade.mjs` used PATH `java` and the highest build-tools version regardless of an installed `apksigner.jar`. This can block a legitimate read-only APK certificate check when Android Studio JBR exists locally.

**F3 scope:** minimal port on fresh main: read-only `resolveJavaForApksigner` considers existing `JAVA_HOME`, `STUDIO_JDK`, `ANDROID_STUDIO_JDK`, Android Studio ProgramFiles JBR/JRE and LOCALAPPDATA JBR, then PATH `java`; installed SDK build-tools folder with actual `lib/apksigner.jar` is selected, else fail closed. No phone I/O is added beyond the existing explicitly invoked read-only audit. No installation, signing keys, downloader, user data or schema changes.

**F4 safety:** no certificate is inferred by finding Java; `parseSigning` remains mandatory and fail closed. Existing `--installed-only` remains metadata/audit only. A CLI run on Windows with a real device is **NOT_TESTED**; this code must not authorize APK update. Old #517 also carries stale 25 Nov status/metrics, not ported.

**F5 criteria:** exact-head Node tests plus related CI; no production deployment or Android device access. B01 independent full recovery, B04/B05 future key/upgrade/rollback and #442 original-video cleanup remain BLOCKED/FROZEN. The current source and existing user reports, if any, do not prove this newly ported helper was physically used.

**F6/F7:** after code CI on exact SHA, only code can merge by owner's PR-only permission; release, production, original video deletion and physical OnePlus install are separate decisions.
