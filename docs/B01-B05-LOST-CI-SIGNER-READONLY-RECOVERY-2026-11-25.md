# B01/B05 — сохранение данных без утраченного CI debug-ключа (25.11.2026)

## F0. Проверенные факты происхождения и подписи
- V5, пользовательский read-only отчёт OnePlus NE2213: установлен `ru.paseka.journal`, SHA-256 APK `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`, сертификат `9b10baf04e1e09bfe2d58e72b1c1eecf04b48f532940b5e91a3083bd73ddb0aa`; `apksigner verify` PASS.
- Подтверждение истории установки 24.11: GitHub Actions `Build Android APK` run #45372830530 и #45372822990, исходный code SHA `f2217095a9ae25d65f06dfaa24258eb177903887`, соответствующие исходные артефакты `14908849781` и `14910605853` **скачаны из GitHub** и проверены побайтово, не являются точным установленным файлом:
  - artifact `14908849781`: APK SHA-256 `e1620bd68ec52edfe42b0f167abb5184f60728ee019fe363a891f5962ad6bbb1`, сертификат из APK v2 block `ecf41751a9aeba353da298fa84b49649f398a0fa0791c98966570292167b80fb`.
  - artifact `14910605853`: APK SHA-256 `bf372ce33ed02e10c086bc7e42106545dd929fb7fbe9786d8e97705b440dfe73`, v2 cert `15c87fd5a8322651b0e0cbbb536fbd731080be7d7daf4a9839e7ed0b6b07d280`.
  - same source SHA but different artifact certs = builds do not share a fixed debug signer. Cert hashes above extracted from signing block, not each artifact independently cryptographically verified; mismatch is conclusive for *identity*.
- GitHub #520 Android #45571119849 official `apksigner verify` CI debug cert `c26be541646150290a25bdd0d55c4c24ae3098cc1f69ccd9bec220b869495f22` differs from installed OnePlus. V6 local Windows standard `debug.keystore` missing. No original private key discovered.
- Original code SHA `f2217095` had **manual JSON-only** `downloadBackup()` for state; full IndexedDB/Blob archive `downloadDisasterArchive` did **not** exist in that revision. External videos and user data are therefore not proven recoverable via old in-app JSON export.

## F1–F2. Technical conclusion
Android's APK update certificate check cannot be bypassed safely. APK key rotation requires old signing key to authorize a lineage. If source was an ephemeral GitHub runner debug key and no preserved private key exists, re-signing `ru.paseka.journal` with a newly created key does **not** update the installed application in place; deleting and reinstalling risks user data loss. This is not a coding bug repairable by a different apksigner invocation. Criterion B05 remains external `BLOCKED`.

Workaround = first achieve an independent, reproducible read-only **data recovery** route, then prepare a **new independent package ID** with an owner-controlled backed-up long-lived signing key and import through a separately reviewed recovery mechanism; keep old package present until new environment is independently verified. No switch/merge/install authorized here.

## F3. V7 read-only local PC candidate
Standalone Windows package `PASEKA-APP-PRIVATE-READONLY-V7.zip`, ZIP SHA-256 `5172b33b19556ebfd2609b7c2ac01770004aea6404f21bb0b5173ac7463491ba`, created for *optional physical test*. It looks up installed `ru.paseka.journal` on the one authorized NE2213 via ADB, asks Android `run-as` for read-only access to a debuggable package, then streams `tar` of the app-private directory **only to a PC-local timestamped file** with an 8 GiB cap, validates TAR headers/end marker and computes local SHA-256. No `am force-stop`, `install`, `uninstall`, `clear`, `restore`, network, original-video deletion, signing-key action, or write to the phone. It never uploads personal TAR to ChatGPT/GitHub. If `run-as` refuses, it reports `BLOCKED` and does not produce a TAR. Code has only local structural/static ZIP checks — Windows runtime **NOT_TESTED**.

Even if TAR succeeds, it is only a **candidate snapshot**, potentially inconsistent if LevelDB changed during reading, not an external full archive: independent restore, app/hive content, MediaStore/Gallery/Downloads, video copy provenance and all B01 validation remain **NOT_VERIFIED**. Recommended only after user normally closes the app (without force-stop). User must retain TAR securely on PC, copy to second drive and *never attach it to ChatGPT*; only JSON report may be shared.

## F4–F5. Machine-verifiable report contract
`scripts/assess-oneplus-private-backup-v7.mjs` and `tests/b01-private-run-as-report-v7.test.mjs` validate only sanitized V7 JSON:
- For wrong device/package, any device-mutating action, invalid TAR SHA/counts, false independent-restore/media claims, or inconsistent result => `BLOCKED_*`.
- A structurally checked local TAR containing IndexedDB path hints => `LOCAL_PRIVATE_SNAPSHOT_INTEGRITY_HINTS_ONLY` with `fullBackupVerified=false`, `independentRestoreVerified=false`, `upgradeAllowed=false`. Missing IDB hints likewise cannot be presented as backup.
- This does **not** execute the Windows PowerShell script or inspect any user TAR in CI.

## F6–F7. Physical proof triggers / next tasks
1. If the user can perform one safe physical test, run local V7 on PC with OnePlus and provide **only** `results/oneplus-private-backup-v7-result.json`. Do not upload TAR, install new APK, clear data or uninstall old app.
2. Only if a local candidate tar exists, develop a **separate read-only verifier and independent restore on an empty isolated target**, plus inventory of Gallery/MediaStore and separate copies.
3. Only after proven B01 complete independent restore and user permission, plan new package ID + long-lived local signing key, tested migration, rollback and physical QA.

**NO_REINSTALL / NO_DATA_CLEAR / NO_DEPLOY / NO_MERGE / NO_ORIGINAL_DELETE.**

## V7 физический отказ и переход на V8 — 25.11.2026

Пользовательский отчёт V7 `2026-11-25T08:07:06Z`: `status=BLOCKED`, `errors=[ADB_READONLY_COMMAND_FAILED]`, `deviceModel=null`, `runAsAvailable=false`, `archiveCreated=false`, `archiveBytes=0`, `archiveSha256=null`, `archiveValidTar=false`, `independentRestore=NOT_TESTED`. Никаких изменений телефона или данных. Отсутствие модели показывает, что **до проверки run-as** не был успешно завершён `adb devices -l` или `adb shell getprop`; по V7 нельзя утверждать ни отказ Android run-as, ни отсутствие данных. Сначала необходимо диагностировать точный ADB этап.

В исходном PowerShell V7 имелось обобщённое исключение `ADB_READONLY_COMMAND_FAILED` и имя формального параметра `$args`, совпадающее с автоматической переменной PowerShell. Это возможные недостатки реализации, но **причина физического отказа V7 не доказана**. Подготовлен отдельный локальный V8 ZIP SHA-256 `b6b75ca1aa88a458f7bc6e31a8a200431461bc9e87c624f0e70bef834b42f814`: параметр `$arguments`, диагностические поля `failureStage`, `failureCategory`, `lastAdbExitCode`, запрет утечки serial/пути/данных; в случае успешных проверок продолжает ограниченный read-only TAR на ПК. ZIP integrity/статический контроль пройдены, реальный Windows тест V8 **NOT_TESTED**. Не запрашивать повтор V3–V7; пользователь присылает **только** `results/oneplus-private-backup-v8-result.json`, никогда TAR.

Статус B01 full backup + independent restore по-прежнему BLOCKED; B05 original signer private key BLOCKED. Никакой установки/очистки приложения, удаления медиа или обхода Android sandbox не выполнять.
