PASEKA B01 / V20 / ISOLATED ANDROID EMULATOR TRANSFER
=======================================================

SAFETY: EMULATOR ONLY. NEVER INSTALL ON ONEPLUS, NEVER DELETE ORIGINALS.

This bundle contains a separate Android APK, portable Node.exe,
ADB utilities, aapt.exe, and one START-EMULATOR-V20.cmd launcher.
Source user files remain exclusively on your local Windows PC.
No personal data is uploaded to GitHub, ChatGPT, or the internet.

BEFORE FIRST START
------------------
1. Keep the original B01 TAR, MANIFEST and V16 PC reconstruction
   under %USERPROFILE%\PASEKA-B01-KEEP-PRIVATE-CANDIDATES\.
2. Android Studio must have Android SDK 35 / Google APIs x86_64 image.
   Optional: run CREATE-ISOLATED-AVD-V20.cmd to create and boot a NEW
   PASEKA_B01_ISOLATED_TEST virtual device automatically. This helper
   refuses to reuse, wipe, rename or overwrite an existing virtual
   device and never sends commands to a physical phone.
   Alternatively create and boot a NEW EMPTY virtual device in Device
   Manager with name PASEKA_B01_ISOLATED_TEST.
3. Close any other emulators. A connected real OnePlus is allowed in
   the ADB device list but it is NEVER selected or operated upon.
4. Extract THIS ZIP into a NEW folder. Do not mix with V16-V18.
5. Double-click START-EMULATOR-V20.cmd. Only this launcher is needed.
6. Send ONLY the new B01-RESULT.json from the package folder.

HARD CHECKS BEFORE ANY EMULATOR WRITE
-------------------------------------
- Exactly one online serial of the form emulator-NNNN.
- ro.kernel.qemu=1; hardware ranchu/goldfish; emulator fingerprint.
- AVD name starts PASEKA_B01_ISOLATED_.
- Main Paseka appId ru.paseka.journal NOT installed in target.
- Isolated diagnostic appId NOT previously installed in target.
- Actual APK identity = ru.paseka.journal.diagnostic.restore,
  checked by Android aapt before starting any installation.
- Only one preserved pc-reconstruction-<GUID> source is accepted.
- Restored source must be in app_webview/Default/IndexedDB with
  LevelDB CURRENT, MANIFEST and .log markers.
- Source reparse/symlink/special files or unsafe paths are rejected.

TRANSFER
--------
Private bytes are streamed as a TAR through ADB stdin directly into
run-as ru.paseka.journal.diagnostic.restore. No TAR or extracted data
is stored in an ADB shared staging directory. Each private member is
rehashed inside the emulator and matched against its PC source digest,
without printing paths or digest values in the public JSON report.

POSITIVE V20 MEANS ONLY
-----------------------
* The selected local IndexedDB directory was copied byte-for-byte into
  the separate diagnostic app on a new isolated emulator.
* It DOES NOT mean IndexedDB could open it or any app record was
  restored or that the complete original app/video backup exists.

AFTER SUCCESSFUL V20
--------------------
Start the "Paseka B01 Isolated Diagnostic" app INSIDE THAT EMULATOR
ONLY. Tap "Проверить базу только для чтения". It checks whether the
existing database can be opened by Android WebView at https://localhost,
whether required stores exist, and their counts. The app does not
decode keys/values or mutate the DB via IndexedDB APIs.
A screenshot or a JSON result without private values can be shared.

If the app reports an error, STOP. Do NOT edit, delete, repair or
manually copy any original WebView file. This is an experimental
debug-app test and may encounter Chromium/WebView version differences.

Do not remove the TAR, V16 reconstruction or any source videos.
Full B01 backup/restore and video-cleanup permissions remain BLOCKED.
