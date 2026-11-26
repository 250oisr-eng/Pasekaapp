# F0–F2: B05 Android Debug APK provenance — **non-production safety check**

Date: 2026-11-26. Root `main=346b35035861257be45dae93ee0573cbd4de9082`.
Status **LIMITED_SAFE_DRAFT**; **B05 long-lived private signing key remains BLOCKED**.

## A. User scenario / existing coverage (F0–F1)

A developer sees downloadable `paseka-debug-apk` from CI but cannot safely infer whether it may replace the installed `ru.paseka.journal` on OnePlus. `scripts/check-oneplus-upgrade.mjs` (merged #500) can compare package metadata and certificate with *installed* APK when authorized ADB is available, but **no physical device/PC is available this cycle**. Old Draft #469 is large/conflicted, and has only ephemeral CI signer evidence, not owner-controlled keystore.

The purpose of **this small change** is to attach verifiable digest and signer *identity of the freshly built CI debug APK*, clearly marked non-production. It does **not** compare to actual OnePlus certificate, perform upgrade, create/rotate/store signing keys, or claim rollback.

Inputs: CI-generated `android/app/build/outputs/apk/debug/app-debug.apk`, Android SDK `aapt` and `apksigner`, checkout commit SHA. Output: JSON provenance + conspicuous no-install warning within debug artifact. Scope: Android CI and new static/audit regression tests only. No runtime/UI/IndexedDB/Service Worker changes, no user data, no secrets. Offline user behavior unchanged.

## B. Feasibility (F2)

- Present: Android SDK build-tools 35 in `.github/workflows/android-debug.yml`, generated APK via `assembleDebug`, existing parsers `parseBadging`, `parseSigning` from `scripts/check-oneplus-upgrade.mjs`. No paid resources.
- Not present: permanent signing keystore under owner's secure custody, backup of that key, installed OnePlus signer proof on current device, safe production rollback. **STOP for B05 resolution, any production update or launch**.
- Proven safe route: parse **local build output only**, run `apksigner verify --print-certs` (verification command, not signing), require expected package ID, positive versionCode, exactly one SHA-256 certificate, literal full 40-hex checkout commit and computed APK SHA-256. Reject malformed/ambiguous outputs.
- `status: DEBUG_ARTIFACT_ONLY`, `productionUpgradeAuthorized: false` and `installedOnePlusSignerMatch: NOT_TESTED` must not be overwritten by successful CI.

## C. Invariants / regression and stop criteria

1. Artifact marked **DEBUG/NOT FOR ONEPLUS** even though its Android package ID is the same as the installed app. CI debug keys are *not* durable provenance.
2. Refuse to generate misleading provenance if APK missing/symlink, package mismatch, version invalid, certificate missing/ambiguous or build SHA invalid.
3. No `keytool -genkeypair`, `keystore`, `jarsigner`, release signing, install, publish or network upload other than existing CI artifact upload.
4. Any failure blocks **artifact upload**; never label a failed audit as PASS. Regression tests use fabricated metadata only, no user file.
5. If debug CI and fast tests PASS on current exact SHA, mark `CI_VERIFIED_EXACT_SHA` for provenance only. **Never infer B05 resolution**.

F3–F6: implement smallest dedicated verifier + tests, one PR rooted in main; confirm exact-head Fast/Android/Governance; leave Draft unmerged. F7 release explicitly forbidden without owner authorization.
