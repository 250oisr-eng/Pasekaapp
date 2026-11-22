## P0 — PASEKA02: автономная проверка staging → commit → quarantine после перезапусков (2026-11-23)

- Ветка `test/p0-v2-multirestart-quarantine-evidence-2026-11-23` основана на Draft #422 exact HEAD `4899f5ec5593131d2eaf1dda5706ecbe2e3177ec`, Fast #45081290606 **1220/1220** и Android #45081290597 **success**. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` без изменений.
- Добавлены **два новых теста** `tests/video-archive-v2-entrance-quarantine-rollback.test.mjs`: (1) staging+reopen+SHA→isolated entrance commit+reopen+SHA→quarantine rollback+reopen+SHA, сохранение ledger/state/history/двух защищённых копий; (2) staged Blob изменён до нового открытия DB, commit обязан отказать без записи в live stores/потери staged evidence.
- Изолированный PASEKA02 эксперимент **не подключён** к UI/runtime; автоматическая очистка оригиналов и Restore335 остаются STOP. Тестовый IndexedDB — `fake-indexeddb`, не физический Android/отключение питания/MediaStore. Этот блок не закрывает весь P0 или P1.
- CI на точном HEAD нового Draft PR должен быть проверен отдельно; до этого результат новых тестов — **PENDING**. Следующий этап: runtime-full-media migration/restore проектировать отдельно на основе отрицательных проверок, не активируя её без доказательств и разрешения.

---

## P1 проверенный кодовый HEAD — 2026-11-23

- На CODE/TEST SHA `ba1a9a4efc64280ef33dc717f6b08b24a6ce685d` Fast Quality #45081133712 **1220/1220 PASS**, 0 failures/skipped; Android Debug #45081133626 **completed/success**. Это целевые регрессионные и сборочные проверки, не физическое Android/production доказательство.
- Цепочка P1: Draft #418 concurrent writes; #419 offline SW cache scope; #420 cross-tab + v2/v4 migration; #421 документальная карта PR; #422 abort/reopen + Farrar isolation. Все не слиты в main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. Ни один PR автоматически не закрыт.
- P1 **NOT READY** из-за физических испытаний и недоинтегрированного live PASEKA02/P0. Restore335 STOP, media cleanup DISABLED. Следующая безопасная задача: в рамках P0 предоставить доказательное runtime state/media восстановление без потерь; затем device/physical acceptance, интеграция по разрешению пользователя и повторный audit на актуальных SHA.

---

## P1 — тест прерывания записи и изоляции Farrar/sectional (2026-11-23)

- PR #420 exact HEAD `b8aa09cc7d848c28be75f76b4984b25fa749ef86`: Fast #45080849658 **1218/1218 PASS**, Android Debug #45080849673 **success**.
- Draft #421 документационно инвентаризировал 349 открытых PR на момент снимка, не делая merge.
- Новый блок P1: тест `writeMainWithBackup` после DataCloneError и restart сохраняет старые main+backup; OP-04 для секционного улья не затрагивает legacy Farrar hive/layout. Два новых регрессионных теста, ни одного изменения runtime/schema/media.
- Следующее: новый exact-HEAD CI, затем финальная сверка незакрытых P1 ворот. P0 OPEN и физическое устройство недоступно для доказательства; не объявлять P1 полностью готовым.

---

## P1.6 — карта зависимостей PR (2026-11-23)

- После #420 проведена read-only инвентаризация GitHub: 349 open PR, все Draft, 30 base=main, 319 stacked, рабочая цепочка P0→P1 из 32 PR до #420; 542 commits ahead/0 behind от main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- Файл `docs/P1-КАРТА-ОТКРЫТЫХ-PR-2026-11-23.md` перечисляет 30 корневых PR, текущий маршрут, неполные base→PR ссылки и запреты автоматической интеграции.
- Это документационная инвентаризация, не merge/закрытие/применение к main; P1.6 интеграционная часть NOT READY без diff audit и разрешения. P0 OPEN. Следующий шаг — CI на точном HEAD #420 и безопасный аудит оставшихся P1 проверок.

---

## P1 — расширенная матрица миграций и независимых вкладок (2026-11-23)

- P1 Draft #419 `2865f5c3761cf4f2d46c754672f2358fbed66254`: Fast #45080691201 success **1215/1215**, Android Debug #45080691220 success. Offline SW `v317` исправлен в Draft, в main не перенесён.
- Новый дочерний блок: `tests/indexeddb-startup-guard.test.mjs` проверяет независимые IndexedDB connections, upgrade v2→v5 (сохранение main/backup), v4→v5 (сохранение video/staging/history Blob). Только тесты и документы; без runtime, реальных записей и миграции production.
- Проверка нового HEAD и полная матрица P1 остаются следующими шагами. P0 OPEN, реальный Android/Restore335/media cleanup STOP.

---

## P1 — офлайн-изоляция Service Worker (2026-11-23)

- Draft PR #418 на `1ac3b974f025e5313bd52f22353a5176bf4a94ce` проверен: 1210/1210 Fast Quality и успешный Android Debug APK workflow. Main не изменён.
- Новый дочерний блок P1: в `sw.js` ограничен кеш только собственными файлами оболочки и навигацией по scope, устранено удаление чужих кешей и HTML-fallback для JS, добавлен поведенческий тест. Версия оболочки `v317`; проверки на финальном SHA следующего PR отдельно, не наследуются от #418.
- P0 остаётся OPEN; P1.1–P1.7 остаются незакрыты до полного доказательного аудита. Следующая задача — exact-HEAD CI новой ветки и карта интеграционных зависимостей PR.

---

## Контрольная точка P1 — 2026-11-23 (частичное выполнение)

- P0 **OPEN**; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`, PR #417 `c6afbc101d0083e7e9d3a7329fab1eb4a4727754` (Fast/Android/emulator success, физический Android не проверен).
- P1 открыт отдельной дочерней веткой `test/p1-indexeddb-concurrent-writes-2026-11-23`, не меняющей runtime; две регрессионные проверки защищают конкурентные сохранения и abort при DataCloneError. Документ проверки: `docs/P1-СТАБИЛИЗАЦИЯ-2026-11-23.md`.
- P1.1–P1.7 **не закрыты** до проверки интеграций, полной матрицы отказов, физического устройства и точного HEAD CI. Не сливать PR, не публиковать, не трогать оригиналы видео. Следующий шаг: exact-HEAD CI тестов этого P1 PR, затем аудит остальных путей записи.

---

### 2026-11-23 — verified P0 Android 15 emulator smoke, Draft #417

- **Exact code/test SHA `cc9fc690e1e48c0e2b1e42a722f2e54267e2247d`**: [Fast Quality #45078984977](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45078984977) **completed/success, 1208/1208 PASS, zero failed/skipped**; [Android Debug #45078984963](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45078984963) **completed/success** (debug APK build/upload); [emulator-only #45078984940](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45078984940) **completed/success** (Android API 35 emulator-5554, real APK cold-start and restart after disabling Wi-Fi and mobile data, process alive, no app AndroidRuntime fatal).
- First emulator SHA `f29d414ac397d2074de30e32badc29588bf22af9`: emulator booted but workflow **FAILED** before installing APK because external action invokes `script` under `/bin/sh`, which rejected `set -euo pipefail`. Moved build/test into explicit Bash script `scripts/run-p0-emulator-ci.sh`, tightened the activity-start check to reject timeout; reran all checks on exact revised code SHA.
- This is **emulator-only startup evidence**, NOT physical Android, IndexedDB byte-integrity across restart, external Android Camera/MediaStore/Gallery/Downloads copies, actual bee recognition, safe cleanup or real PASEKA02 restoration. Physical user phone remains disconnected; Restore335 private source unresolved. **P0 OPEN / Restore335 STOP / deletion disabled**.
- Draft #416 integration parent SHA `5365b2585e3314f166e9cf731a30cf97d91ef402` had successful Fast #45078502472 and Android #45078502603 after reconciling #415 docs; both PRs remain Draft, no main/prod merge. Results above pertain to code SHA; this documentation-only commit will create a new HEAD and requires its own CI check.

---

## 2026-11-23 — P0 device-independent integration and Android emulator proof (Draft #417)

- Parent [Draft #416](https://github.com/250oisr-eng/Pasekaapp/pull/416) reconciled with parent #415 docs in commit `5365b2585e3314f166e9cf731a30cf97d91ef402` (GitHub pull/416 `mergeable=true`). No PR merged into main, no real media altered. Before reconciliation #416 code/test SHA `4a866a52f4957899442e8e7fc12557b6403f9ee0` passed Fast #45077090132 **1205/1205** and Android Debug #45077090061 **success**; merged-working-tree CI must be checked independently.
- Created [Draft #417](https://github.com/250oisr-eng/Pasekaapp/pull/417), branch `test/p0-android-emulator-offline-smoke-2026-11-23`: independent free Android 15 emulator-only cold-start / offline restart smoke, fail-closed on any non-emulator serial and `ro.kernel.qemu!=1`, with static regression checks and isolated APK. No physical user phone interaction, no new archive restore activation or cleanup.
- **Physical user phone is disconnected**; no proof can be claimed of actual MediaStore/Gallery/Camera/Downloads copies, real-device power cycle or actual recognition. P0 **OPEN**, Restore335 **STOP** (original private source name unverified), full live PASEKA02 integration and irreversible cleanup not authorized.
- Evidence/release gate matrix: `docs/P0-ВОРОТА-ФИЗИЧЕСКОЙ-ПРОВЕРКИ-2026-11-23.md`. Exact HEAD Fast/Android/emulator results **PENDING** until workflows finish; never infer success from parent CI. Next: fix emulator failures if present, then prepare synthetic-only physical ADB proof that is dormant until device becomes available.
- No main merge, production deployment, physical data deletion or new feature enablement.

---

## 2026-11-23 — P0 live entrance original protection, Draft #416

- Parent [Draft #415](https://github.com/250oisr-eng/Pasekaapp/pull/415) code SHA `c5d927bef3d4d4f68463bb54dcab453e328d2a79` verified Fast #45077008257 **1200/1200 PASS** and Android #45077008321 **completed/success**. Main remains unchanged; #415 docs-only HEAD CI must be separately tracked.
- Current [Draft #416](https://github.com/250oisr-eng/Pasekaapp/pull/416), branch `fix/video-manual-delete-failclosed-2026-11-23`, exact code/test SHA `4a866a52f4957899442e8e7fc12557b6403f9ee0`: [Fast Quality #45077090132](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45077090132) **completed/success, 1205/1205 tests PASS, 0 fail/skipped**; [Android Debug #45077090061](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45077090061) **completed/success** with full regressions/debug APK build/upload.
- Confirmed live UI risk: `index.html` manual `removeEntranceVideo` called unconditional `deleteEntranceVideoBlob`, permitting irreversible loss even before recognition succeeded. Adapted existing fail-closed guard from old Draft #241: direct deletion rejects `ENTRANCE_VIDEO_DELETE_BLOCKED` before any IndexedDB write; UI displays disabled removal button with reason; old direct caller also rejects without showing destructive confirmation. Ported 5 tests from `tests/entrance-video-manual-delete-guard.test.mjs`. No actual deletion performed and no automatic cleanup enabled.
- P0 **NOT CLOSED**: full restore/migration to live PASEKA02, physical Android power-cycle/permission/Camera/Gallery/Downloads inventory and verified deletion after genuine recognition remain unproven. Modules isolated, no production deployment, Restore335 STOP, no merge and no changes to real user data. Docs-only final SHA requires fresh verification.
- Next single blocking stage: physical isolated Android synthetic video lifecycle (source creation, recognition evidence, durable ledger, external copy census, backup, restart, rollback and deletion safety), then only after verified evidence and explicit permission plan live rollout. No further destructive change until it is possible to perform safely.

---

## 2026-11-23 — P0 durable SHA-bound recognition ledger / live video ID collision, Draft #415

- Parent [Draft #414](https://github.com/250oisr-eng/Pasekaapp/pull/414) exact docs HEAD `54f6b10fe2a80a9b613aa063465604c083f96b81`: Fast Quality #45076740736 and Android Debug #45076740655 **completed/success**; parent code SHA `806012dd03ab32b5bccfa8bbc249746110f6a068` passed 1182/1182 tests and Android on that exact SHA. Main unchanged.
- Child [Draft #415](https://github.com/250oisr-eng/Pasekaapp/pull/415): ported preexisting `js/video-recognition-ledger.js` and `tests/video-recognition-ledger.test.mjs` from isolated v2 branch. Added `tests/archive-v2-durable-writer-crossversion.test.mjs`: real synthetic SHA-bound recognition writes to durable main ledger, PASEKA02 binary codec preserves full result, fake IndexedDB close/reopen retains ledger, v1 export rejects omission and v2 restore guard rejects older archive without recognition. No original Blob deleted; cleanupState remains `blocked_archive_safety`.
- **Confirmed live data-loss defect** discovered by inherited test: `index.html` `putEntranceVideo` used `entrance_media.put(storedRecord)`, silently replacing an original on ID collision. Fixed only new-video insert to atomic `add(storedRecord)` and changed outdated static UI test to require add and forbid put. First code SHA `0ea879e78723cfaf759a5f61a2fbd029e4e95e16` FAILED 1199/1200 due to this real regression; second code SHA `6b7a52e54e70969a67a307826dfde2f700374026` failed 1199/1200 only because old UI static test expected put; fixed at `c5d927bef3d4d4f68463bb54dcab453e328d2a79`.
- **Exact code/test SHA `c5d927bef3d4d4f68463bb54dcab453e328d2a79`:** [Fast Quality #45077008257](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45077008257) **completed/success 1200/1200 PASS, 0 fail/skip**, [Android Debug #45077008321](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45077008321) **completed/success** (regression, APK build/upload). No production writes.
- **P0 REMAINS OPEN** for physical Android restore/reboot and external Gallery/Camera/Downloads evidence; verified model recognition and proof of safe irreversible cleanup are absent. No automatic deletion; subsequent Draft #416 closes the unsafe manual deletion path. No merge/deployment, Restore335 STOP.

---

## 2026-11-23 — P0 protected pending video + quarantine recovery, Draft #414

- Parent Draft #413 final HEAD `5027f7895cac6395d1e5bf1e528faed0b665e9e5`: Fast Quality #45076448875 and Android #45076448915 both **completed/success**. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` unchanged.
- [Draft #414](https://github.com/250oisr-eng/Pasekaapp/pull/414), branch `test/archive-v2-pending-quarantine-recovery-2026-11-23`, code/test SHA **`806012dd03ab32b5bccfa8bbc249746110f6a068`**: [Fast Quality #45076558423](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45076558423) **completed/success, 1182/1182 PASS, 0 fail/skip**; [Android #45076558453](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45076558453) **completed/success** (full regression and debug APK build/upload).
- Existing isolated v2 modules from #315 now present alongside modern v1: `video-archive-v2-pending-stage.js`, `video-archive-v2-staging-verify.js`, `video-archive-v2-pinned-source.js`, `video-archive-v2-entrance-atomic.js`, `video-archive-v2-entrance-quarantine-rollback.js`, `video-archive-v2-copy-inventory.js`. Five original fake-indexeddb suites were carried and strict evidence fixtures adapted. Quarantine **preserves** original Blob in protected full_backup, no irreversible deletion, and all audit outputs deny cleanup authorization.
- **NOT_DONE / P0 STILL BLOCKED:** full live PASEKA02 restore and legacy migration, original SHA and tombstone lifecycle across physical Android reboot, external Gallery/Downloads/Camera copy inventory, proven model recognition and actual cleanup. Modules isolated, no runtime index.html/SW loading, no actual user data touched, Restore335 STOP. Tests do not prove physical Android operation. Draft, no merge/deployment.
- Next: integrate existing isolated durable SHA-bound recognition writer with restart/cross-version regression, verify exact CI. Documentation-only commits after code SHA require fresh HEAD checks.

---

### 2026-11-23 — Draft #413 SHA-verified PASEKA02 metadata-only recovery and journal Data URL SHA

- **Exact verified code/test SHA `87d63fa51d7bcd3abdc9db43e0052cf2b749dbf6`**: [Fast Quality #45076278599](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45076278599) **completed/success, 1067/1067 tests PASS, 0 fail, 0 skipped**; [Android Debug #45076278725](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45076278725) **completed/success**, regression tests and debug APK build/upload.
- First code SHA `9ae6ea4c5de83d9ee754c401f55e7b84bc1f04d6` **FAILED 26/1058** because the modern `paseka-sha256.js` missed `hashVideoDataUrlHex` from the older v2 source line; this caused `V2_RECORD_ADAPTER_UNAVAILABLE` in isolated journal-video and dry-run tests. Integrated only the existing streaming Data URL SHA implementation (Sha256/abort-safe) into current SHA module without replacing modern Blob algorithm; added `tests/sha256-journal-video-dataurl.test.mjs` covering large multipart video, Android octet-stream, invalid base64/encoding and abort. No real files touched.
- All five inherited v2 test suites and modern 1000-test base now pass. **Scope remains isolated** metadata-only atomic import/rollback and read-only full-file dry-run, not an enabled product archive. PASEKA02 pending original Blob commit/quarantine/rollback, full v2 migration, physical Android reboot/Gallery/Downloads copy inventory, and original delete remain P0 blocked; no merge/deployment, Restore335 STOP.
- The current docs-only SHA resulting from this entry must receive its own exact-HEAD CI; do not inherit prior result without verification.

---

## 2026-11-23 — P0 isolated PASEKA02 metadata-only atomic commit/rollback, Draft #413

- Parent [Draft #412](https://github.com/250oisr-eng/Pasekaapp/pull/412) HEAD `cc494662fd15ca0d7209ee151f3f9f07ede5a169`: Fast Quality #45075921205 **completed/success 1000/1000 PASS**; Android #45075921196 **completed/success**, debug APK build/upload. The first #412 code SHA failed 999/1000 because one negative test fixture lacked fields newly required by #411; corrected before final 1000/1000 PASS. No real data.
- Child [Draft #413](https://github.com/250oisr-eng/Pasekaapp/pull/413), branch `test/archive-v2-metadata-atomic-recovery-2026-11-23`: port from existing isolated v2 branch #315, retaining safety-only functionality: `video-archive-v2-record-media.js`, `video-archive-v2-metadata-atomic.js`, `video-archive-v2-export-candidate.js`, `video-archive-v2-restore-dry-run.js` and five original test suites. Synthetic fixtures populated with mandatory verified state-revision and hash timestamp from #411.
- **Metadata-only** atomics verify PASEKA02 file and live ledger, require empty originals/protected copies, perform transactional state import with rollback snapshot and explicit rollback on isolated fake IndexedDB; recovery inspector is read-only, retains historic ledger. These API outputs still explicitly deny `archiveSafe` and `cleanupAuthorized`. Export candidate/record-media adapter and dry-run verify hashes and cross-store guards without enabling product restore.
- Code/test SHA `9f936afb044caf570e03dad11f54b5505a605470`: CI **NOT_YET_CONFIRMED**. No production v2 UI, no IndexedDB migration or real video data. Full pending-entrance Blob stage/commit/quarantine, copy inventory, physical Android reboot/Camera/Gallery/Downloads, real recognition and deletion remain P0 blockers. No merge/deploy and Restore335 STOP. Next: run CI at exact child HEAD; fix fixtures and code regressions; then integrate isolated protected pending-video staging and atomic rollback under tests.

---

## 2026-11-23 — P0 v2 five-store preflight + aborted write lock integration, Draft #412

- Parent [Draft #411](https://github.com/250oisr-eng/Pasekaapp/pull/411), final HEAD `bb9d11e382f33a69b8631bb4351abc4b15e60cd9`: Fast Quality #45075564230 **completed/success, 968/968 PASS**, Android #45075564355 **completed/success**, debug APK regression/build/upload, no merge.
- New [Draft #412](https://github.com/250oisr-eng/Pasekaapp/pull/412), branch `test/archive-v2-five-store-restore-preflight-2026-11-23`, imported from existing isolated Draft #315: `js/video-archive-v2-snapshot.js`, `js/video-archive-v2-restore-db-preflight.js`, `js/video-archive-v2-commit-lock-guard.js` and three original test suites. The two tests with recognition fixtures now supply mandatory `stateRevisionId` and `sourceHashVerifiedAt` introduced by #411.
- `tests/archive-v2-five-store-reopen-integration.test.mjs`: no-write ledger/tombstone read-only preflight and **always-aborted** five-store writer gate across IndexedDB close/reopen; second scenario creates protected V2 full_backup quarantine *after* successful preflight, expects final write-lock refusal `V2_COMMIT_EXISTING_ARCHIVE_HISTORY` and refusal after reopen `V2_RESTORE_EXISTING_ARCHIVE_HISTORY`; original source bytes and history preserved.
- First child SHA `a029cd8c58a2a0fce330132b557944d98a3d9898`: Fast Quality **999/1000 PASS, 1 FAIL** due to inherited test fixture in `video-archive-v2-snapshot.test.mjs` missing newly required provenance, so expected `V2_RECOGNIZED_ORIGINAL_INCLUDED` was preempted by `V2_LEDGER_ENTRY_INVALID`. The fixture, not production logic, was corrected in `e9ad720dc4c96d7897be003bebded26c25d2d0ed`. New exact-SHA CI **PENDING**, no declaration of PASS until results.
- Not a live restore: modules are isolated, no runtime script tags or Service Worker activation, no IDB schema migration and no real video deletion, no user data or production operations. Full PASEKA02 protected history integration, original byte-hash proof after reboot, Android external Camera/Gallery/Downloads copy inventory and physical-device tests remain **P0 STOP**; Restore335 STOP, do not merge/deploy without separate approval.

---

## 2026-11-23 — P0 PASEKA02 provenance validation: Draft #411

- Parent [Draft #410](https://github.com/250oisr-eng/Pasekaapp/pull/410), exact final HEAD `05812b90e3eaf24b0a8c624d7c94ad0a720d273c`: Fast Quality #45075319695 **completed/success, 961/961 PASS, 0 fail/skip**; Android #45075319647 **completed/success**, debug APK built/uploaded. No merge/main/production writes.
- Confirmed source-level defect in v2 codeported from old #315: `validateRecognitionLedgerForV2` permitted `stateRevisionId` and `sourceHashVerifiedAt` keys but did not require or validate their values. Thus a portable result/tombstone could be accepted without provenance linking it to an actual state revision and source-hash verification time. Directly incompatible with the stricter recording contract and unsafe to mark as verified.
- New [Draft #411](https://github.com/250oisr-eng/Pasekaapp/pull/411), branch `fix/archive-v2-ledger-provenance-required-2026-11-23`: require nonempty bounded `stateRevisionId` and parseable string `sourceHashVerifiedAt` for every entry, in addition to SHA/size/evidence/status already checked. Update original three isolated v2 test fixture sets, add seven negative provenance cases.
- **No silent mutation/migration** of older ledger rows: missing values now fail closed. Synthetic compatibility and complete test suite/Android must be checked on exact SHA `85a0b0d1995debdfeb06928adf1a5ec4ba1c34a8`; status PENDING.
- Remaining P0: multi-store full portable v2 stage/commit/rollback recovery, historical/legacy migrations, externally managed Camera/Gallery/Downloads copies, physical Android power loss/reopen, video recognition accuracy and safe immediate cleanup. None is authorized by this validator change; Restore335 STOP, no delete, no merge or deployment.

---

## 2026-11-23 — P0: isolated PASEKA02 portable ledger/tombstone integration, Draft #410

- Parent [Draft #409](https://github.com/250oisr-eng/Pasekaapp/pull/409) final HEAD `115d7b3da40ab9ecd90d4812f2dbdf5dac232724`: Fast Quality #45075059847 **completed/success 924/924 PASS**; Android #45075059682 **completed/success**, debug APK build/upload on that exact SHA. Parent #408 also checked. Main unchanged.
- Existing v2 project branch #315 `6b6d1094ebc6bee925dd57351a8521933e162683` supplied **unchanged isolated** `js/video-archive-v2-guard.js`, `js/video-archive-v2-metadata-codec.js`, `js/video-archive-v2-restore-gate.js`, plus their 3 existing test suites. In child [Draft #410](https://github.com/250oisr-eng/Pasekaapp/pull/410) they now coexist with the current hardened v1 stack. No clone of old v1 runtime, no wholesale branch merge, no modifications to the production script-loading list.
- New `tests/archive-v1-v2-ledger-portable-integration.test.mjs`: synthetic binary PASEKA02 preserves result and `deleted` tombstone across IndexedDB close/reopen; actual PASEKA01 `exportArchiveFromDatabase` rejects nonempty recognition ledger; PASEKA02 restore gate rejects an incoming archive that omits the tombstone even after reopen. The gate explicitly returns `restoreAuthorized:false`, `archiveSafe:false`; it **never commits or deletes** data.
- Source code+test SHA `a03f04c3fafb770f27e83eb82e5d9974d9f36f91` requires **fresh CI verification**. Validation of isolated v2 components is NOT permission for product live restore: full multi-store atomic stage/commit/rollback/recovery, real archive-compat migration, offline Service Worker, Android Camera/Gallery/Downloads copy inventory and physical reboot/deletion test remain **P0 BLOCKED**. Restore335 STOP. Do not merge/publish/delete production data without user approval.
- Next: verify full suite and Android on exact final HEAD, fix failures; then adapt isolated v2 snapshot and staging/commit modules without overriding modern v1 guards and add synthetic migration/restore abort tests.

---

## 2026-11-23 — P0 legacy export after PASEKA02 quarantine, Draft #409

- Parent [Draft #408](https://github.com/250oisr-eng/Pasekaapp/pull/408), HEAD `7926e2b1f8a3bb498be0b6d1b4af9bf667693d6d`: Fast Quality #45074421414 and Android #45074421377 both **completed/success** on exact parent SHA. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` unchanged.
- Source-level gap: v1 `js/paseka-archive.js` export checked recognition ledger, but **not** V2 protected staging/history/full_backup. A missing historical ledger with nonempty V2 quarantine could allow a PASEKA01 file omitting protective lineage. Existing import gate from #408 does not mitigate misleading export.
- Child [Draft #409](https://github.com/250oisr-eng/Pasekaapp/pull/409), branch `fix/archive-v1-export-v2-quarantine-guard-2026-11-23`: `readConsistentDatabaseSnapshot` reads `main`, `entrance_media` and, when installed, all three archive safety stores in **one readonly transaction**. Fail closed on `v2pending:` staging, `kind=v2_*` history or `v2entrance:` full_backup; missing partial schema or malformed enumerations block legacy export. This same snapshot helper executes initially, after digest, and after final hashes, so late changes are rechecked.
- 11 synthetic `tests/archive-export-v2-protected.test.mjs` scenarios: 3 protected-store kinds × (present at start, arrives during async hash, remains after IndexedDB reopen) + clean empty ledger compatibility + incomplete schema. Historical DB without any archive stores retains existing behavior. No changes to database schema, archive format, media cleanup, UI, or actual videos.
- CI for new child code SHA `dca0f8d4d072699fcfe5900631f27128c0d2ad52` **PENDING until exact workflow results**. Parent results do NOT certify this code. Physical Android reboot, real .paseka roundtrip, PASEKA02 portable ledger/tombstone preservation, full copy audit and deletion remain **P0 BLOCKED**. No merge/deploy/production modifications. Next verify CI, fix regressions; then continue isolated ledger migration and synthetic cross-version recovery checks.

---

### 2026-11-23 — Draft #408 P0 PASEKA01↔PASEKA02 protected-copy guard: verified code SHA

- **Exact code/test+initial-docs SHA `4df96ca0edd34fed684517fc0743be86d88daf5f`**: [Fast Quality #45074270336](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45074270336) **completed/success, 913/913 tests PASS, 0 fail, 0 skipped** (job logs); [Android Debug #45074269945](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45074269945) **completed/success**, debug APK build/upload. Initial HEAD `6abb78ad8e04e9adf14d99c4b6467c5c908eae0a` failed **910/913** because 3 synthetic `archive_history` fixtures were read using undefined `id` rather than `backupId`; fixed test lookup in `4df96ca`, full suite retested. No production/user data touched.
- [Draft #408](https://github.com/250oisr-eng/Pasekaapp/pull/408) continues #407 and adapts existing cross-version v2 guard from isolated #315 into new PASEKA01 staging/commit/rollback code, with 9 synthetic negative tests. See `docs/АУДИТ-СОВМЕСТИМОСТИ-АРХИВОВ-V1-V2-2026-11-23.md`. Results on this SHA do **not** certify any later docs-only HEAD until checked.
- No merge/deployment, no real Android restore or media deletion; portable PASEKA02 ledger/tombstones, schema/migration, full protected-copy inventory and Restore335 remain STOP. Next: verify final docs-only HEAD CI and audit cross-version race at v1 ready/recovery, without enabling deletion.

---

## 2026-11-23 — P0 legacy PASEKA01 vs protected PASEKA02: Draft #408

- **Точная ветка** `fix/archive-v1-v2-protected-copy-bridge-2026-11-23`; parent Draft #407 HEAD `6a473fffcd6675e4a1ac221a1fbccbbe99e7b64d`, Fast #45073651288 и Android #45073651334 completed/success на этом SHA. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялся.
- Интеграционный аудит: #315 и #407 разошлись, общий ancestor `f00726d0cd0565092c634a108268a0e246f90625`; v2 имеет свои реализации и тесты (PR #215–#248, #309–#315). Нельзя объединить старую ветку целиком вместо современных проверок. Полная карта и критерии: `docs/АУДИТ-СОВМЕСТИМОСТИ-АРХИВОВ-V1-V2-2026-11-23.md`.
- **Дефект пересечения версий**: актуальный `js/paseka-archive-restore.js` из #407 не имел проверки `VIDEO_LEGACY_RESTORE_V2_PROTECTED`, уже созданной в изолированной #315. В дочернем [Draft #408](https://github.com/250oisr-eng/Pasekaapp/pull/408) перенесена адаптированная fail-closed проверка `v2pending:` staging, `kind=v2_*` history, `v2entrance:` full_backup. Preflight единым readonly snapshot, stage/commit/rollback повторная проверка в write lock. Нет изменения схемы, пользовательских записей, удаления или включения PASEKA02 UI.
- Девять синтетических регрессий по трём типам маркеров × stage/late commit/rollback добавлены в `tests/archive-staging.test.mjs`. **CI на новом code/test SHA не подтверждён**, до его проверки считать status PENDING; успешный родительский CI не наследовать.
- Следующее: проверить Fast Quality и Android на точном HEAD, исправить любые ошибки; реальный Android restore, ledger/tombstones transport, автоудаление оригиналов и Restore335 остаются STOP. PR Draft, merge/deployment не выполнять.

---

### 2026-11-23 — Draft #407 verified code/test/docs SHA (CI PASS)

- **Exact tested SHA `2416fa53a82209867eb7d150db394c885296b268`**: Fast Quality [#45073507018](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45073507018) **completed/success, 904/904 tests PASS, 0 fail, 0 skipped** (job logs). Android Debug [#45073507005](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45073507005) **completed/success**: regression suite, debug APK build/upload. These results cover this code/test SHA; documentation commits made later require separate HEAD verification.
- Draft [#407](https://github.com/250oisr-eng/Pasekaapp/pull/407) remains stacked on #406 and unmerged; `main`/production untouched. Synthetic tests do **not** establish that real phone video restore or deletion is safe. Original media deletion, real restore, v2 recognition ledger/tombstones, Restore335 remain **STOP / NOT_TESTED**.
- Next: validate docs-only final HEAD and prepare bounded v2 provenance/tombstone integration audit. No merge or production deployment without explicit approval.

---

## 2026-11-23 — STABILIZATION_ONLY P0: stale staging status write-lock guard, Draft #407

- Parent **Draft #406** final HEAD `60b23a40e4386492593b973bec49c925e4828b61`: Fast Quality #45073200522 completed/success, Android #45073200503 completed/success, both on exact final parent HEAD. Parent #406 code/test SHA `53fb59cac14a735c32bcad2a7be698a5deef6031`: 886/886 tests PASS, 0 fail/skip, Android build/upload success.
- Child [Draft #407](https://github.com/250oisr-eng/Pasekaapp/pull/407), branch `fix/archive-staging-session-stale-write-guard-2026-11-23`, base #406, **code/test SHA `ea48e80f5ea59ac634b69620df893288fc1434c2`**. These parent checks do NOT verify this child.
- Source-level concurrency defect: `updateSession` could replace advanced `stagingEpoch`, `stagedCount`, identity or media baseline when a stale caller marked an existing `staging` session `ready` or `failed`. New guard in `js/paseka-archive-restore.js` verifies exact persisted stage/session identifiers, manifest/backup, epoch/count, entry total and both media baselines inside IndexedDB readwrite lock **before any status write**. Mismatch => `STAGING_SESSION_CHANGED`; staging records preserved. Ready-idempotence logic from #406 unchanged.
- `tests/archive-ready-session-idempotency.test.mjs`: 2 positive + 16 negative synthetic fake-indexeddb scenarios added; verify that stale ready/failed finalization does not change persisted staging. No IndexedDB migration, archive format or runtime media cleanup changes.
- CI for child SHA requires separate confirmation. No real-device restore, video recognition, original deletion or rollback performed; `main`/production unchanged, no merges/deployment. Restore335 remains STOP. Next: verify Fast Quality and Android exact SHA; then portable v2 recognition ledger and tombstone transport, without enabling destructive actions.

---

### Проверка нового кода — 2026-11-23 (exact code/test SHA)

- **Code + tests + initial docs HEAD `53fb59cac14a735c32bcad2a7be698a5deef6031`**: Fast Quality [#45073061756](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45073061756) **completed/success, 886/886 tests PASS, 0 failures, 0 skipped** (по job logs); Android [#45073061805](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45073061805) **completed/success**, regression и Android debug APK build/upload. Проверено на точном SHA, не переносить результат автоматически на последующие документационные коммиты.
- Draft PR [#406](https://github.com/250oisr-eng/Pasekaapp/pull/406) поверх #405. Изменения затрагивают только идемпотентность готовой staging-сессии, 6 synthetic регрессионных тестов; физическое устройство, реальные видео, восстановление и удаление **NOT_TESTED**, `main`/production **не изменялись**, Restore335 STOP.
- Следующий шаг: CI финального docs HEAD, затем P0 перенос истории распознавания v2 и tombstones; не сливать PR без разрешения.

---

## 2026-11-23 — STABILIZATION_ONLY / P0: ready staging idempotence hardening (Draft, CI pending)

- Parent: Draft #405 HEAD `7d358d2fa713a04a0e691e2f8888e01a9d826b1a`; Fast Quality #45072345871 completed/success 880/880, Android #45072345960 completed/success on that exact parent SHA. Эти результаты **не** подтверждают новый код.
- Рабочая ветка `fix/archive-ready-session-baseline-idempotency-2026-11-23` (последовательная зависимость после #405). Исправление в `js/paseka-archive-restore.js`: при повторном завершении уже `ready` staging-сессии сравниваются не только количество записей, epoch и manifest fingerprint, но и session/backup identity, оба сохранённых отпечатка исходной медиатеки. Legacy ready без metadata baseline не принимается как идентичная.
- Новый `tests/archive-ready-session-idempotency.test.mjs`: 1 положительный и 5 отрицательных synthetic fake-indexeddb сценариев; сверка неизменности staging при отказе. Не утверждать PASS до фактической проверки точного HEAD.
- Scope: idempotent ready-session finalization only; без изменения IndexedDB schema, .paseka, backup payload, runtime recognition, физического удаления файлов или релиза. `main`, production, реальные записи/видео не тронуты.
- Следующий приоритет: получить Fast Quality + Android CI для точного code/test SHA; при ошибке исправить тест/код, затем финальная повторная проверка HEAD. После этого вернуться к P0 v2 portable recognition ledger/tombstones и реальному Android preflight; Restore335 остаётся STOP. Ни один Draft не сливать без разрешения пользователя.

---

## 2026-11-23 — P0 live media metadata stage/commit Draft #405: exact-SHA CI PASS

- **Проверенный code+test+initial-docs SHA `d64403df8f8be199256711cee523cdf881f75074`**: [Fast Quality #45072184778](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45072184778) **completed/success, 880/880 PASS, 0 FAIL, 0 skipped**. [Android Debug #45072184732](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45072184732) **completed/success**, full regression tests, debug APK build и upload PASS. ZIP artifact [#14773369098](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45072184732/artifacts/14773369098), 3,461,897 bytes (**это не SHA бинарного APK**).
- [Draft #405](https://github.com/250oisr-eng/Pasekaapp/pull/405) основан на #404, no merge/main. `js/paseka-archive-restore.js`: дополнение к legacy `mediaRecordsFingerprint` v3 — полный JSON-compatible fingerprint всех метаданных живых видео (кроме Blob, для которого остается отдельный SHA), сохранённый в новых staging sessions как `baselineMediaMetadataFingerprint`. В stage проверяется повторно под staging write lock; в commit проверяется перед валидацией и **повторно в финальном write lock непосредственно до destructive replace**. Новые поля/status/retry/quality не теряются при гонке: операции блокируются `RESTORE_MEDIA_METADATA_CHANGED`. Нет автоматического исправления/удаления старых staged sessions без новой проверки: `STAGING_MEDIA_METADATA_BASELINE_MISSING`.
- **6 fake-indexeddb synthetic tests:** нормальный import с уже существующим видео; status changed after stage; новый lastError; изменение status во время async validateState между двумя фазами; legacy staging без нового metadata-baseline; изменение при Blob SHA до резервирования сессии. `Fast Quality` и `Android` на указанном SHA полностью успешны; **физическое устройство/реальная БД не тестировались**, пользовательские данные не изменяли.
- Родительский [Draft #404](https://github.com/250oisr-eng/Pasekaapp/pull/404) код SHA `bfe6ee477dc55d5f41e3db83524a5689be369fdc`, Fast Quality #45071867747 **874/874 PASS**, Android #45071867750 **completed/success** — отдельная подтверждённая проверка. Никаких SHA результаты не «наследуют».
- После текущих docs-only коммитов `HEAD` меняется: exact-HEAD CI проверять отдельно. **Ограничения:** STABILIZATION_ONLY; full v2 portable ledger/tombstones всё ещё НЕ интегрирован, Restore335 STOP; настоящие backup restore/media deletion/cleanup/Android device NOT_TESTED/NOT_AUTHORIZED. `main`, production не менялись, PR остаются Draft/unmerged, никаких deploy/merge.
- **Следующий приоритет:** оценить интеграцию накопленных Draft PR с миграциями IndexedDB/offline SW и полным v2 ledger без изменения main; регрессионное покрытие P0/P1 и только после разрешения пользователя — план безопасного объединения.

---

## 2026-11-23 — P0: полный baseline метаданных live video при stage/commit (Draft, CI PENDING)

- **Родитель:** Draft [#404](https://github.com/250oisr-eng/Pasekaapp/pull/404) HEAD `6f31c433b6162755abba91324f61c3833346a8cc`; на отдельно проверенном code SHA `bfe6ee477dc55d5f41e3db83524a5689be369fdc` [Fast Quality #45071867747](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45071867747) **874/874 PASS** и [Android #45071867750](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45071867750) completed/success. Результат родителя не доказывает новый код.
- **P0 риск:** v3 `mediaRecordsFingerprint` пропускал queue status/retryCount/new metadata поля **также для существующей live media при staged import**; между подготовкой и фактическим `entrance_media.clear()` изменение метаданных без смены байтов могло быть молча потеряно.
- **Минимальное дополнение без изменения v3 fingerprint/архива/схемы:** функция `fullMediaMetadataFingerprint(records)` детерминированно учитывает все поля IndexedDB video record **кроме Blob** (его bytes проверяются отдельно), включая неизвестные новые поля и SHA256. При stage вычисляется и сохраняется новое поле session `baselineMediaMetadataFingerprint`, повторно сверяется под staging write lock перед сохранением сессии. Commit проверяет его после Phase A video SHA и снова в финальной readwrite-транзакции сразу перед live media replacement; изменения => `RESTORE_MEDIA_METADATA_CHANGED` без потери state/media/history/rollback. Пожилые staged session без baseline не импортируются **fail-closed** с `STAGING_MEDIA_METADATA_BASELINE_MISSING`; необходимо сначала удалить только явно выбранную staged сессию штатным безопасным способом и заново загрузить проверенный архив, не удалять реальные источники. Они не переписываются автоматически.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **6 synthetic/fake-indexeddb тестов**: корректный импорт с ранее существовавшим legacy-видео и rollback snapshot; status изменён после stage; новый error metadata; изменение status через async state-validator между Phase A и final write lock; блокировка старого staged session без нового baseline; изменение status во время async hash до stage-session reservation. Без реального видео, физического устройства, удаления/миграции.
- **Новый SHA CI: PENDING**. STABILIZATION_ONLY, Restore335 STOP, v2 ledger/tombstones и real deletion NOT_TESTED/NOT_AUTHORIZED. Main, production, PR merges/deploy не изменялись. Следующий шаг: exact CI+Android, исправление отклонений, обновление статуса и переход к аудиту других P0/P1 блокеров.

---

## 2026-11-23 — P0 rollback защищает ВСЮ imported-video metadata: Draft PR #404, exact-SHA PASS

- **Точный проверенный code+test SHA `bfe6ee477dc55d5f41e3db83524a5689be369fdc`**: [Fast Quality #45071867747](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45071867747) **completed/success: 874/874 PASS, 0 FAIL/0 SKIPPED**. [Android #45071867750](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45071867750) **completed/success**: full regression, debug APK build and upload PASS; ZIP [#14772584960](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45071867750/artifacts/14772584960), 3,461,072 bytes, expires 2026-12-06 (**не SHA бинарного APK**).
- **Не скрывать неуспешные прогоны:** первый SHA `a5c7f5284fabf3146e2b5ee8591516aa824aab42` — [Fast #45071624933](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45071624933) **864 PASS / 10 FAIL**, Android #45071624944 failed. Ручные legacy fixtures не содержали SHA-256-верифицируемого import manifest; старый тест ошибочно называл новое metadata «harmless»; один позитивный тест предполагал сохранение прежней revision вместо нового audit revision. Фикстуры исправлены, v3 fingerprint в production не менялся. Второй SHA `61be560c7ad9fb4846f2804753b39eb0eac53049` — [Fast #45071781618](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45071781618) **873 PASS/1 FAIL**, Android #45071781634 failed: одна тестовая инъекция не предоставила cryptoProvider.subtle для криптографической сверки manifest. Это исправлено, третий CI на точном SHA полностью PASS. Защитные проверки не ослаблялись.
- [Draft PR #404](https://github.com/250oisr-eng/Pasekaapp/pull/404) поверх #403: `rollbackCommittedArchive()` связывает `importSession.manifest` с `archive_history.fingerprint` через SHA-256 и проверяет все импортированные metadata поля каждого video against original manifest как в Phase A, так и в финальном IDB readwrite lock; blob/hash и derived orphan flag отдельно защищены существующими проверками. Риски queue status/retryCount/custom metadata, TOCTOU поздней записи, изменение manifest => отказ с сохранением записей. Legacy `mediaRecordsFingerprint` v3 НЕ изменён (важно для совместимости сохранённых snapshot).
- **6 новых synthetic test cases** + обновлённые старые synthetic fixtures и contradictory metadata test; реальной БД/Android-девайса/исходных пасечных видео не использовали. После проверенного SHA docs-only commits изменяют HEAD, поэтому не приписывать им CI без новой проверки. Main/production без изменений, все PR Draft, без merge/deploy.
- **Следующий P0:** метаданные уже существующих live videos могут измениться между `stageArchiveForRestore` и `commitStagedArchive`, а v3 media fingerprint также пропускает поля очереди. Запланировать отдельный fail-closed metadata baseline guard, совместимость legacy staging и регрессии; не активировать v2 ledger или auto-delete до полного безопасного переноса.
- **Блокеры остаются:** `.paseka` v2 ledger/tombstones не интегрирован; Restore335 STOP; реальные restore/cleanup/source delete NOT_TESTED/NOT_AUTHORIZED; STABILIZATION_ONLY.

---

## 2026-11-23 — P0: откат обязан сохранять более новые метаданные видео (Draft, CI PENDING)

- **Родитель:** Draft PR #403, HEAD `2830ebbd385882aafef1a1d1ee2c2c7d71b261d5`; на том exact SHA [Fast Quality #45070945126](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070945126) **868/868 PASS** и [Android #45070945114](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070945114) completed/success. Это результат родителя, не текущей правки.
- **P0 дефект:** `mediaRecordsFingerprint` v3 в `js/paseka-archive-restore.js` намеренно учитывает только часть полей (`id,blobSha256,hiveId,capturedAt,duration,width,height,bytes,orphan`) и **не учитывает статус очереди, retryCount, имя, дополнительные поля и метаданные качества**. При неизменных Blob и revision журнала `rollbackCommittedArchive` мог признать медиа «неизменёнными» и выполнить `entrance_media.clear()`, потеряв новые сведения. Это анализ исполнимого сценария, не сообщение о реальном повреждении Android.
- **Минимальное исправление без миграции:** перед восстановлением и повторно в финальной readwrite-транзакции сравниваются *все недеривативные поля* каждой текущей imported-video записи с исходным `importSession.manifest.entries[*].metadata`. Из сравнения исключаются только Blob, контролируемый SHA256 и выводимый `orphanedHiveReference`. `importSession.manifest` в Phase A криптографически сверяется с `archive_history.fingerprint`, а в Phase B проверяется на неизменность, вместе с history fingerprint. Код отказа `ROLLBACK_MEDIA_METADATA_CHANGED` или `ROLLBACK_IMPORT_MANIFEST_CHANGED`; rollback snapshot/history/main/media сохраняются. Старый `mediaRecordsFingerprint` v3 **не переписывается**, что важно для совместимости ранее записанных снимков.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **6 новых synthetic/fake-indexeddb сценариев** с двумя искусственными видео: успешный откат неизменённых записей; обновлённые статус, retryCount, неизвестное новое поле; статус, изменённый при асинхронном rollback валидаторе; подмена metadata в импортном manifest. Проверка сохранности пользователя в негативных сценариях. Без реальных пчелиных видео/БД.
- **CI для нового SHA пока НЕ ПРОВЕРЕН**. Схема/формат .paseka, миграции, Android permissions, production не менялись. Все PR Draft, `main` не затрагивать, слияния/развёртывания не проводить. Restore335 STOP; v2 ledger/tombstones и безопасная реальная очистка остаются P0 BLOCKED.
- **Следующая задача:** exact-SHA Fast Quality и Android, исправление проверяемых ошибок; далее P0 аудит защиты метаданных от изменения **в промежутке между stage и commit**, также без изменения формата.

---

## 2026-11-23 — P0 no-overwrite staging PR #403: exact code/test SHA CI PASS

- **Точный проверенный code/test SHA `041e122c71df04a1e068deb2ec930f0cc896ad7e`**: [Fast Quality #45070773982](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070773982) **completed/success, 868/868 PASS, 0 FAIL, 0 skipped**. [Android #45070773969](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070773969) **completed/success**: регрессионные тесты, полная debug APK сборка и artifact upload. ZIP [#14773141531](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070773969/artifacts/14773141531), 3,459,084 bytes (**размер ZIP, не SHA APK**).
- **Первый CI неуспешен:** SHA `17a06f4eccb5b7e916d60cbe4dc4e19dbe8906ef`, [Fast Quality #45070679086](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070679086) **866 PASS / 2 FAIL из 868**, [Android #45070679117](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070679117) **failed** на regression stage. Новый synthetic mock ожидал native `ConstraintError`, а fake-indexeddb вернул общий `IndexedDB transaction failed`; существующий тест quota эмулировал ошибку через устаревший перехват `store.put()`, игнорируя новый `add()`. Исправлены **только тестовые ожидания/инъекция quota для put+add**, исходный fail-closed код не ослаблен.
- [Draft PR #403](https://github.com/250oisr-eng/Pasekaapp/pull/403) дочерний от #402, main не затрагивает. `putStagingEntryAndUpdateSession` запрещает перезапись любой существующей строки с совпавшим `id` (`STAGING_ENTRY_ID_CONFLICT`), создаёт новые только `store.add()`, как нативную защиту, включая нештатное враньё `get()`. 4 новых synthetic fixture теста с двумя фальшивыми видео: штатный импорт, чужой kind, такой же kind и скрытый existing row; исходные байты staging сохранены. Quota-regression продолжает реально проверять abort и данные после повторного открытия.
- Docs-only коммиты после указанного SHA меняют HEAD и требуют отдельного exact-SHA CI, не приписывать им проверки кода. **Ограничения:** STABILIZATION_ONLY, Restore335 STOP, полный v2 ledger/tombstone portable archive НЕ интегрирован; real device/restore/media/cleanup/deletion NOT_TESTED/NOT_AUTHORIZED. Нет merge, production, deployment, изменений схемы/формата архива.
- **Следующий шаг:** проверить целостность цепочки Draft #401→#402→#403, CI docs-only HEAD и продолжить оценку P0 рисков исходных данных/recognition ledger до начала новых функций.

---

## 2026-11-23 — P0: запрет перезаписи staged Blob при primary-key конфликте (Draft, CI pending)

- **Родитель:** Draft PR #402 на SHA `b19ced33c1b2933d6e15e5bd98515d11b1ceda46`. Его кодовый SHA `c283c74930ff20a2dcf2959c8bf4c8fac791fcd0` отдельно прошёл [Fast Quality #45070364455](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364455) **864/864 PASS** и [Android #45070364533](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364533) **completed/success**; parent checks не подтверждают новый код.
- **Риск:** `putStagingEntryAndUpdateSession()` при `store.get(record.id)` с уже существующей строкой того же `sessionId` и любым `kind !== 'session'` ранее делал `store.put(record)`, **молча перезаписывая staged Blob**. При конкурентной или неконформной записи возможна утрата оригинальной временной копии, даже если последующая проверка full archive заблокирует commit.
- **Правка:** каждую запись манифеста stage записывает один раз; если ключ уже существует независимо от вида/владельца — abort `STAGING_ENTRY_ID_CONFLICT`. При ожидаемом отсутствии `store.add()` вместо `store.put()` гарантирует родную уникальность первичного ключа даже при недостоверном ответе `get()`. `stagedCount` увеличивается только для действительно нового ключа. При отказе live main/media/history не изменяются, существующая временная Blob-копия сохраняется. Нет изменений модели IndexedDB, .paseka, миграций или формата.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **4 synthetic fixture сценария** с созданным внутри теста .paseka из двух фальшивых Blob: штатный stage; поздняя посторонняя строка `rollback_video`; поздняя строка `video` с тем же ключом; адаптер `get()`, скрывающий реально существующую строку — в этом случае native `add()` обязан отклонить транзакцию и сохранить байты. Тесты не используют реальные пасечные записи и не удаляют исходное видео.
- **Точный новый CI: PENDING**, до подтверждения ничего не считать PASS. STABILIZATION_ONLY, Restore335 STOP, v2 ledger/tombstones и безопасное реальное удаление ещё не реализованы. Main/production/merge/deploy не затрагивались.
- Следующее: запустить/проверить exact-SHA Fast Quality и Android, исправить любые failures, зафиксировать код SHA, и продолжить P0 lineage/integration audit.

---

## 2026-11-23 — Draft PR #402: stored null recognition ledger P0, exact-SHA CI PASS

- **Code+tests+initial-docs SHA `c283c74930ff20a2dcf2959c8bf4c8fac791fcd0`**: [Fast Quality #45070364455](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364455) **completed/success, 864/864 PASS, 0 fail, 0 skipped**. [Android #45070364533](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364533) **completed/success**, regression suite, full debug APK build and artifact upload success; ZIP artifact [#14773350972](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45070364533/artifacts/14773350972) 3,458,857 bytes (**не SHA бинарного APK**).
- [Draft PR #402](https://github.com/250oisr-eng/Pasekaapp/pull/402) основан на #401 и остаётся unmerged; `main` = `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` на старте цикла. В `js/paseka-archive.js` и `js/paseka-archive-restore.js` только отсутствующий `undefined` ledger допускается как empty key; сохранённый `null` блокирует v1 export/stage/commit/rollback с `VIDEO_LEDGER_UNVERIFIED`. Read-only staging copy inspector показывает `ok:false`, не `no_recognition_history`.
- Добавлено 7 synthetic tests: 5 отказов на stored null, позитивный пустой валидный ledger и запрет непустой истории; проверена неизменность state/staging/history/rollback. Это **не** утверждение о реальном повреждении IndexedDB/Android.
- После точного проверенного SHA будут docs-only коммиты: **не считать новый HEAD проверенным без отдельного CI**. В format/schema/permissions/production/устройство/реальные видео ничего не менялось. STABILIZATION_ONLY, Restore335 STOP; v2 ledger/tombstones/provenance ещё не интегрированы, удаление видео и restore не авторизованы. Merge/deploy не выполнялись.
- **Следующая P0 проверка:** запрет перезаписи существующей staging-записи при частичном импорте/гонке, включая конфликт по первичному ключу `id`, с синтетическими регрессиями и новым stacked Draft PR.

---

## 2026-11-23 — P0: stored null recognition ledger ≠ отсутствующая история (Draft; CI pending)

- Родитель: [Draft #401](https://github.com/250oisr-eng/Pasekaapp/pull/401) на SHA `1ca21b55482620e508aed199b87e031975e1ecf3`, Fast Quality #45069993189 и Android #45069993246 завершены **completed/success** на этом SHA. Родительская проверка не доказывает новых изменений.
- Анализ чтения `main/video_recognition_ledger_v1` выявил fail-open `if (value == null) return` в `js/paseka-archive.js` и `js/paseka-archive-restore.js`, а также `ledger == null` в read-only `inspectStagingRecognitionCopies`. IndexedDB `get(missingKey)` возвращает только `undefined`, поэтому **существующий `null` — недостоверное сохранённое значение**, не подтверждение пустой истории. Ранее v1 export/staging/commit/rollback допускали этот случай, а audit сообщал `no_recognition_history`. Это установленная логическая граница, не наблюдённый сбой физической Android БД.
- Минимальная правка **трёх guards в двух JS модулях**: только `undefined` означает отсутствие ledger; `null` запрещает v1 архив `VIDEO_LEDGER_UNVERIFIED`, а inspection возвращает `ok:false, reason:'VIDEO_LEDGER_UNVERIFIED'`. Корректный legacy `{version:1,entries:[]}` остаётся допустим, непустой ledger по-прежнему запрещает v1 export/import.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **7 synthetic/fake-indexeddb сценариев** для real stored `null` (export, staging, audit, commit, rollback) с проверкой сохранности state/staging/history/rollback, плюс пустой валидный ledger и непустой ledger, который по-прежнему блокируется. Никакие пользовательские данные не читались/удалялись.
- Новый код/test SHA **пока не проверен CI**; не переносить parent PASS. Никаких миграций, изменений формата `.paseka`, Service Worker, Android permissions, видеозаписей или production. STABILIZATION_ONLY, Restore335 STOP, перенос `ledger/tombstones` v2 не реализован и удаление оригиналов запрещено.
- Следующий этап: точный Fast Quality + Android CI, исправление failures, запись проверенного SHA и продолжение P0 аудита границ наследования/истории без merge/deploy.

---

## 2026-11-22 — P0 lookup lineage: Draft PR #401, exact CI PASS

- **Точный проверенный code+tests+initial-docs SHA `f6a253466129cdab2a15eb4913cc6da136c9a28d`**: [Fast Quality #45069818039](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069818039) **completed/success 857/857 PASS, 0 FAIL/0 skipped**. [Android #45069818031](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069818031) **completed/success**, regression suite, debug APK build и upload PASS. ZIP artifact [#14772668626](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069818031/artifacts/14772668626), 3,458,386 bytes, **это ZIP size, не hash APK binary**.
- [Draft PR #401](https://github.com/250oisr-eng/Pasekaapp/pull/401) основан на Draft #400 (`2bf06bf9de810579978357ad95cafa158d5d144d`), 7 изменённых файлов, без конфликтов на момент проверки. Предыдущий #400 проверен отдельно на code SHA `c8a71df8b44f75d064448b2b4f20f02092dfb59c`: [Fast Quality #45069529560](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529560) **847/847 PASS**, [Android #45069529612](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529612) **completed/success**. После его docs-only update HEAD `2bf06bf...` также прошли Fast Quality #45069689485 и Android #45069689728.
- Исправление `js/paseka-archive-restore.js`: `undefined` — единственное допустимое отсутствие history/staging lookup; `null`, `false`, чужой `backupId`, неправильные `kind/id/sessionId` → fail-closed `ARCHIVE_HISTORY_IDENTITY_UNVERIFIED`/`STAGING_BACKUP_LOOKUP_UNVERIFIED` до создания staging или финальной записи импорта. 10 новых synthetic regression tests, включая повторную подготовку того же верного архива. Main/media/staging/history/backup сохраняются при ошибках.
- Синтетический ответ неконформного IndexedDB адаптера — защитная модель, это **не утверждение**, что настоящий Android IndexedDB уже возвращал false/null. Реальный full restore/cleanup/удаление не испытаны и не авторизованы. `main` на старте цикла `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; production не изменён, никаких merge или deploy.
- После проверенного code SHA последующие docs-only изменения меняют HEAD; не приписывать им те же exact-SHA проверки без отдельного CI. STABILIZATION_ONLY остаётся активным: P0 архив v2 + ledger/tombstones/provenance и Restore335 STOP, P1 legacy migrations/offline/Android и массовая зависимость PR ещё незавершены.
- **Следующий приоритет:** межмодульный аудит полноты/проверяемости backup v1, границы ledger v2, источника распознанного видео и rollback lineage, без изменения формата, удаления пользовательских данных или слияния.

---

## 2026-11-22 — P0: fail-closed идентичность history и backupId-index lookup (Draft, CI pending)

- **Родитель:** Draft [#400](https://github.com/250oisr-eng/Pasekaapp/pull/400), HEAD `2bf06bf9de810579978357ad95cafa158d5d144d` (последующие docs к проверенному родительскому SHA). Его code+tests SHA `c8a71df8b44f75d064448b2b4f20f02092dfb59c` прошёл [Fast Quality #45069529560](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529560) **847/847 PASS** и [Android #45069529612](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529612) **completed/success**; не приписывать этот результат новым изменениям.
- **Риск:** `getHistory()` и `findSessionByBackupId()` использовали `result || null`, объявляя `false`, `null` и иные недостоверные результаты IndexedDB отсутствующей history/staging-сессией. Затем `commitStagedArchive()` финально проверял history лишь при truthy result. При неконформном драйвере/адаптере можно было начать новый импорт или заменить неподтверждённую историю backup.
- **Исправление `js/paseka-archive-restore.js`**: IndexedDB `get` должен возвращать `undefined` при отсутствии строки. Любой иной результат обязан быть объектом с точным `backupId`, для staging также `kind:'session'`, корректными `id === sessionId`. Подтверждено в read-only lookup и **повторно под финальным readwrite lock** для history. Ошибки `ARCHIVE_HISTORY_IDENTITY_UNVERIFIED`, `STAGING_BACKUP_LOOKUP_UNVERIFIED`; без удаления/импорта в случае ошибки. Совместимый корректный индексированный legacy session сохраняет поведение.
- **10 новых fake-indexeddb тестов**: 4 непроверенных history results, 4 неправильных lookup staged backup-ID, одна недостоверная history внутри commit write lock с проверкой сохранности main/staging/history/full_backup и одна позитивная повторная подготовка того же архива. Только synthetic adapter, без реальных записей и Blob.
- **CI нового SHA: PENDING.** Формат .paseka, схема IndexedDB, физические данные, live media, PWA и Android permissions не меняются. STABILIZATION_ONLY / Restore335 STOP; v2 recognition ledger/tombstones не интегрированы, исходное видео и backup удалять нельзя. Main/production без изменения, merge/deploy запрещены.
- **Следующее:** exact-SHA Fast Quality/Android CI, фиксация failures и результатов, затем дальнейший аудит замещения данных без разблокировки restore/video deletion.

---

## 2026-11-22 — P0 staging ownership PR #400: CI проверен на точном code SHA

- **Code+tests SHA `c8a71df8b44f75d064448b2b4f20f02092dfb59c`**: [Fast Quality #45069529560](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529560) **completed/success: 847/847 PASS, 0 FAIL, 0 skipped**. [Android Debug #45069529612](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069529612) **completed/success**: regression tests, APK build и upload PASS; ZIP artifact #14771909618 (3,457,863 bytes, **не SHA бинарного APK**).
- Первоначальный CI того же Draft PR на предыдущем SHA `9af470743af816d55df7ef1cf4b69c85308ae526` **FAILED**: Fast Quality #45069473880 — 846 PASS / 1 FAIL из 847; Android #45069473877 failed на регрессионном тесте. Это была неточная ожидаемая ошибка теста: неверный kind истинного заголовка уже блокировался раньше с `STAGING_SESSION_INCOMPLETE`, а тест ошибочно требовал `STAGING_RECORD_SET_MISMATCH`. Проверка скорректирована, защиту не ослабляли; повторные прогоны на точном code SHA успешны.
- [Draft PR #400](https://github.com/250oisr-eng/Pasekaapp/pull/400) — дочерний от #399, не main. Код `commitStagedArchive` проверяет всё множество staging rows (включая заголовок), ownership и уникальные ключи в финальной IDB readwrite-транзакции **до удаления временных данных**. 3 synthetic TOCTOU regressions подтверждают сохранение main/media/history/backup/staging при посторонних/перемещённых строках.
- Последующие docs-only коммиты имеют собственные HEAD и не наследуют CI без отдельной проверки. Схема БД, backup v1, ledger, реальные медиа и production **не изменены**. Restore335 STOP, v2 ledger/recognition provenance остаётся P0, пользовательские оригиналы и backup удалять нельзя. `main` без изменений, no merge/deploy.
- **Следующий P0 шаг:** проверить корректность идентификаторов `archive_history` и `archive_staging` при повторных импортах, не позволяя malformed индексированным значениям выглядеть отсутствующими строками. Затем negative tests и CI в отдельном stacked Draft.

---

## 2026-11-22 — P0: защита полного состава staging в финальной write-транзакции импорта (Draft; CI pending)

- **Прямой родитель:** Draft #399, HEAD `415ded603be7d9650ed511ce80965d16cf56020e`; его code SHA `9ae7a9ddc56991958fbc4a7be175c2b6db7edb6e` отдельно прошёл 844/844 Fast Quality и Android Debug. Это не подтверждает текущие изменения.
- **Причина:** в `commitStagedArchive()` Phase A `readStagedArchive()` проверяла весь набор записей; Phase B после асинхронного валидатора проверяла только content rows (не kind=session), поэтому поздняя дополнительная строка с `sessionId` и `kind:'session'` не меняла fingerprint, но затем массовый цикл удаления удалял эту неожиданную строку вместе с легитимными staged rows. Кроме того, изменение индексируемого `sessionId` самого заголовка между фазами раньше не отвергалось отдельно.
- **Устранение:** `js/paseka-archive-restore.js` перед любыми write операциями в финальном IndexedDB readwrite-lock требует строго `session.id === sessionId`, `session.sessionId === sessionId`, ровно `totalEntries + 1` staged rows, все с тем же sessionId, уникальными ненулевыми ключами, единственным заголовком под canonical ID и без других session-kind строк. Ошибка `STAGING_RECORD_SET_MISMATCH` отменяет всю транзакцию; live state, archive history, backup и staged originals сохраняются.
- **Тесты:** `tests/archive-restore-enumeration-failclosed.test.mjs` — 3 новых сценария fake-indexeddb, модификации **после проверенного preview, до финального write lock**: лишний заголовок, header reindexed to another owner, неверный kind заголовка. Отдельно сравниваются состояние main, entrance_media, full_backup, archive_history и staging. Никаких реальных пользовательских данных не изменено.
- **Проверки нового SHA:** PENDING, не объявлять успех до exact Fast Quality/Android. Схема IndexedDB, v1 .paseka, ledger, Android permissions и live media не меняются. STABILIZATION_ONLY; Restore335 STOP, v2 ledger/tombstones и настоящее безопасное удаление НЕ РАЗБЛОКИРОВАНЫ. Main/production/deploy не затронуты; слияние без отдельного разрешения запрещено.
- **Следующий шаг:** exact-SHA CI исправления, устранение failures и документальная фиксация; затем очередной P0 аудит lineage и флага сохранности ledger.

---

## 2026-11-22 — Draft PR #399, P0 rollback snapshot identity: exact-SHA CI PASS

- **Exact code+tests+initial-docs SHA `9ae7a9ddc56991958fbc4a7be175c2b6db7edb6e`**: [Fast Quality run #45069026386](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069026386) **completed/success, 844/844 PASS, 0 FAIL, 0 skipped**. [Android run #45069026486](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069026486) **completed/success**: regression tests, debug APK build, artifact upload succeeded. [APK artifact #14772915036](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45069026486/artifacts/14772915036) is a ZIP, size 3,457,518 bytes, expires 2026-12-06; **ZIP size is not APK binary SHA**.
- [Draft PR #399](https://github.com/250oisr-eng/Pasekaapp/pull/399) now based on latest #398 HEAD `dde1e1d9485b1ef171a4888542d6dc5a99f7141d`; earlier attempt created branch from parent code SHA `3506848c...` before later parent docs-only commits. For clean stacking, our newly created branch was safely replayed onto exact current parent and the self-created PR branch updated with a checked lease; no parent/user data overwritten. Compare to parent shows **7 expected paths only**, GitHub reports mergeable=true; PR remains Draft/unmerged.
- Code `js/paseka-archive-restore.js`: enforce identity of rollback snapshot header, state and video primary keys, unique row IDs, source `record.id === originalId`; recheck after async validation. Six synthetic/fake-indexeddb tests added (one valid full rollback with previous synthetic Blob; five corrupt identity variants). Reject invalid snapshot with `ROLLBACK_SNAPSHOT_IDENTITY_INVALID`, preserve main/media/staging/history. No migration, new feature or format change.
- `main` unchanged (`8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` at cycle start); no merge/deploy/production, no real media, original video cleanup or real restore. STABILIZATION_ONLY continues. **Docs-only status commits after verified code SHA are not automatically considered exact-HEAD code/test CI PASS.**
- Further P0: archive v1 still rejects nonempty `video_recognition_ledger_v1`; v2 ledger/tombstone format not integrated. Full real backup/restore and device validation remain blocked; Restore335 STOP. Next: P0 audit of recognized video ledger transport and origin/backup lineage; no real deletion or auto-unlock.

---

## 2026-11-22 — P0 архив: строгая идентичность rollback snapshot до восстановления (Draft, CI pending)

- Родительская ветка Draft #398 на SHA `3506848c07b4a9062e78e0efc9ca8bd180bdfc2f`, базируется на #397. На parent exact SHA: [Fast Quality #45068666037](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068666037) **838/838 PASS**, [Android #45068665898](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068665898) completed/success. Эти результаты не являются проверкой нового исправления.
- **Сценарий риска:** `rollbackCommittedArchive()` ранее проверял счётчики, виды и SHA-256 Blob, но не требовал точного primary key для `rollback_state`/`rollback_video`, не сопоставлял `originalId` с `record.id`. Изменённый неавторизованный staged-снимок с прежним числом строк мог быть принят как валидный, и при реальном откате подменить журнал или видео. Это анализ дефекта логики и изолированный synthetic scenario, **не утверждение о наблюдённой поломке устройства**.
- Минимальное исправление `js/paseka-archive-restore.js`: `assertRollbackSnapshotIdentity` до state/video restoration, после асинхронной валидации в повторном чтении. Проверка соответствия `sessionId`, header, уникальности ключей, точного `:state` и `:video:<originalId>`, связи `originalId === record.id`; код `ROLLBACK_SNAPSHOT_IDENTITY_INVALID`. Финальная write-транзакция уже сравнивает тот же fingerprint снимка под lock, поэтому переиспользуется старый concurrency guard. Формат существующих snapshot/IndexedDB/архива **не изменён**.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: **6 synthetic/fake-indexeddb** сценариев — успешный полный откат с предыдущим видео, неверный ключ state, неправильный sessionId header, неправильный originalId, неправильный record.id, неправильный video key; при отказах утверждается неизменность main/media/staging/history. Оригинальные видео, реальная БД и production не затрагивались.
- До CI на новом точном SHA не утверждать PASS. Все PR Draft/unmerged. `main` на старте `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. Restore335 STOP; v2 ledger/tombstone транспорт в .paseka всё ещё не разработан, v1 сознательно блокирует импорт/экспорт при ненулевом v1 ledger. **Следующий шаг:** проверить новый Fast Quality и Android на точном SHA; устранить любые failures; после фиксации перейти к следующему P0 аудиту без merge/deploy/удаления.

---

## 2026-11-22 — PR #398: sequential P0 live state guard, exact code/test SHA PASS

- **Проверенный code/test+docs SHA**: `3506848c07b4a9062e78e0efc9ca8bd180bdfc2f`. [Fast Quality #45068666037](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068666037) **completed/success, 838/838 tests PASS, 0 fail/skip**. [Android #45068665898](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068665898) **completed/success**, debug APK build/upload; artifact #14772561698, archive 3,457,147 bytes, **not** a separately calculated binary APK checksum. New docs-only commits AFTER the checked SHA do not automatically inherit exact-SHA validation.
- Draft PR [#398](https://github.com/250oisr-eng/Pasekaapp/pull/398) is now a **true stacked child** of Draft [#397](https://github.com/250oisr-eng/Pasekaapp/pull/397), base HEAD `768033a561f68bbe25639eb858b49ab03fbe94dd`. Rebased own branch via compare, new commits and exact SHA lease; #397's safe rollback-discard code/tests/doc updates are preserved. Relative to #397: 7 files, 9 code added/1 removed, 47 lines new tests (8 negative + 2 positive scenarios), and 5 docs. No competing sibling PR changes retained in current #398 diff.
- **Defect fixed**: In `commitStagedArchive` final readwrite transaction, `values.currentState || null` treated malformed falsy persisted journal rows like an empty database when `expectedRevision=null`. New guard `RESTORE_LIVE_STATE_UNVERIFIED` prevents overwrite, preserves current journal/staging/history/full_backup. Actual absent state still accepts import, and legacy object with `meta` but no revision keeps its rollback copy.
- Limits: validation is type/shape fail-closed, not a complete integrity proof of every valid-looking state. No IndexedDB migration, no archive schema change, no production/main writes, no merge/deploy, no real restore/cleanup/video deletion. Restore335 STOP, v2 ledger and complete portable backup integration remain P0 blockers.
- **Next single step:** continue P0 audit of archive v1/v2 coverage and recognition ledger retention, preserving fail-closed cleanup; no expansion to new feature work during STABILIZATION_ONLY.

---

## 2026-11-22 — P0: malformed live journal при restore, последовательно поверх #397 (CI новой правки ожидается)

- Текущий `main` SHA `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; в него ничего не вносилось. Родительский Draft PR #397 — code/test SHA `f29eafbff7376ab51a95dc0b3e9a550c4b86c9b6`, docs HEAD `768033a561f68bbe25639eb858b49ab03fbe94dd`, проверен отдельно: Fast Quality #45068360057 и Android #45068359996 завершены success. Результат родителя **не доказывает** новые изменения.
- Для избежания конкурирующих sibling PR #397/#398 новая правка `commitStagedArchive` перенесена в отдельную последовательную рабочую ветку от точного HEAD #397. Тесты #397 на удаление rollback snapshot с проверкой ключей и `kind` сохранены; десять тестов защиты исходного журнала добавлены следом.
- **Выявленный дефект:** выражение `values.currentState || null` в финальной readwrite-транзакции при ожидаемой `null` revision ошибочно трактовало сохранённые `false`, `0`, пустую строку как отсутствие state, потенциально заменяя недостоверный журнал без корректного rollback snapshot. Новый `RESTORE_LIVE_STATE_UNVERIFIED` запрещает такое восстановление для non-object/Array/invalid `meta`, не записывая новые данные.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: восемь негативных fake-indexeddb кейсов с настоящими некорректными значениями в main/state, плюс позитивные проверки реального отсутствия state и legacy meta без revisionId. Не изменяются IndexedDB version, формат архива, существующие миграции и ветвление UI.
- **Verification:** новый code/test/Docs HEAD пока **NOT_VERIFIED**, ожидаются Fast Quality и Android CI на точном SHA. Реальное видео, физическое восстановление и очистка NOT_TESTED/NOT_AUTHORIZED; Restore335 STOP; v2 ledger перенос в архив ещё не завершён. Ни merge, ни production/deploy, ни удаление оригиналов не разрешены.
- Следующий шаг: обновить stacked Draft #398 на проверенную базу #397 и выполнить полную регрессию/Android на точном SHA; при любом FAIL исправить в той же ветке. Затем продолжить один P0 блок сохранности архива.

---

## 2026-11-22 — PR #397: P0 rollback snapshot discard guard, exact code/test SHA PASS

- Code+test+initial-docs SHA **`f29eafbff7376ab51a95dc0b3e9a550c4b86c9b6`**: [Fast quality #45068360057](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068360057) **completed/success, 828/828 tests PASS, 0 FAIL, 0 SKIPPED**; [Android Debug #45068359996](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45068359996) **completed/success**, regression tests PASS, full APK build/upload PASS, ZIP artifact #14771829960 (3,456,981 bytes; NOT a binary APK SHA).
- Дочерний **Draft PR [#397](https://github.com/250oisr-eng/Pasekaapp/pull/397)** основан на #396; исправление `discardArchiveRollbackSnapshot()` проверяет строгую форму primary keys, отсутствие дубликатов и индексированные kind `rollback_session/rollback_state/rollback_video` **без чтения Blob**. Девять новых synthetic/fake-indexeddb проверок, включая сохранение state/history/staging при неконформных индексах. Ошибки блокируют операцию, не позволяют трактовать недостоверные данные как пустые.
- Действующий `main` на момент начала: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`; ни один PR не объединялся, no production/deployment, реальное восстановление, удаление видео и cleanup не проводились. **Дальнейшие docs-only commits имеют отличный от тестового SHA HEAD; не приписывать им CI на code SHA без отдельной проверки.**
- STABILIZATION_ONLY продолжается. P0 архив v2 с полной историей распознавания и реальным безопасным restore остаётся нерешённым. Restore335 STOP. **Следующий один шаг:** аудит совместимости v1/v2 ledger и rollback lineage, затем минимальный fail-closed fix с synthetic regression; без merge/deploy/удаления пользовательских данных.

---

## 2026-11-22 — P0: проверка принадлежности записей при удалении rollback snapshot (Draft, CI pending)

- GitHub `main` на старте цикла: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. Родительский Draft #396: HEAD `65fb6a28217d252de866b3c1686e6b8968e3676a`; прямого слияния с main нет. Его code/test SHA `dbce7c3f188047ae791b0b783fc69483d331a80b` проверялся отдельно (819/819 и Android Debug PASS); результаты не переносятся на новый код.
- Новый узкий P0 дефект: `discardArchiveRollbackSnapshot()` удалял все ключи по `sessionId`, если совпали только число записей, заголовок и статус; он не проверял точную структуру первичных ключей и типы строк. При нештатном/повреждённом индексировании мог удалить неожиданные staged-записи вместо fail-closed. Исправление касается только **уже существующей операции явного отказа от снимка отката**, не добавляет разрешения на удаление оригиналов видео.
- Код `js/paseka-archive-restore.js`: проверка типа/уникальности/допустимого префикса ключей, проверка вторичного индекса `kind` для `rollback_session`, `rollback_state`, `rollback_video` через **getAllKeys без загрузки Blob**, откат readwrite-транзакции при неуверенной принадлежности, сохранение первой установленной ошибки при конкурентных abort-событиях. Коды: `ROLLBACK_DISCARD_KEYS_UNVERIFIED`, `ROLLBACK_SNAPSHOT_INVALID`, `ROLLBACK_DISCARD_KIND_INVALID`, `ROLLBACK_DISCARD_KINDS_UNVERIFIED`.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: добавлены **9 сценариев** на synthetic/fake-indexeddb: корректный discard, подменённый ключ при неизменном количестве строк, неверный kind, 3 некорректных kind-list и 3 некорректных primary-list. Проверка сохранности state/staging/history при отказах. **CI/Android pending** до подтверждения на точном SHA.
- Изменений схемы IndexedDB, backup-формата, product-разрешений, `main`, production или реальных данных нет. Сохранить STABILIZATION_ONLY; Restore335 STOP; real video/restore/cleanup/deletion NOT_TESTED/NOT_AUTHORIZED. Следующее одно действие: проверить Fast Quality и Android CI на точном кодовом SHA, исправить любые ошибки; затем обновить PR и handoff без заявления о проверке последующих docs-only SHA.

---

## 2026-11-22 — PR #396: final code+tests SHA PASS; Draft/unmerged

- **Exact verified code/test SHA**: `dbce7c3f188047ae791b0b783fc69483d331a80b`. [Fast Quality #45067205123](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45067205123) **completed/success: 819/819 PASS, 0 failures, 0 skipped**. [Android #45067205158](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45067205158) **completed/success**, full debug APK build and artifact upload; artifact #14771673588, ZIP/artifact 3,456,295 bytes, not a verified APK binary SHA.
- The first run [#45067124172](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45067124172) **FAILED** (815 pass, 4 fail) and is explicitly retained in history. Three failures found another unchecked row listing in `readStagedArchive()`; the fourth was a wrong synthetic injection phase. Both fixed before the successful exact SHA rerun.
- Scope: malformed `getAll()` results now fail closed during staged manifest reading, commit, finalization and rollback (Phase A/recheck/write lock). 6 new synthetic regression tests. Real media and device restore/cleanup **NOT_TESTED**, Restore335 STOP, v2 ledger unresolved.
- Draft PR [#396](https://github.com/250oisr-eng/Pasekaapp/pull/396) stacked on #395, no merge/main change/production/deployment. Documents added **after verified code SHA**, therefore later docs HEAD is **not independently exact-SHA CI verified**. Next: continue P0 archive lineage and compatibility audit, with explicit negative tests and without unlocking deletion.

---

## 2026-11-22 — STABILIZATION_ONLY: fail-closed staged rows enumeration (Draft, CI pending)

- Parent Draft #395 HEAD at start: `23923731d2150de751cd2acbcd6bfb29abe9fa68`; parent PR is not main. Its Fast Quality #45066838403 and Android #45066838354 were completed/success on that parent HEAD; these are **not** checks of the new code.
- New branch `fix/archive-staging-rows-failclosed-2026-11-22`; code commit `0ab1dc6d9250a35bb5b308c65e4d4654d6f05826`, test commit `6768a140b4e2163c9d0c63231c71dbf27a73faeb`.
- P0 audit found residual `getAll()` non-array fallbacks (`|| []`) for staging records across commit, rollback Phase A/recheck/Phase B and staged finalization. Instead of accepting malformed results as an empty list, `js/paseka-archive-restore.js` now checks arrays with explicit failure codes `STAGING_RECORDS_ENUMERATION_UNVERIFIED`, `ROLLBACK_RECORDS_ENUMERATION_UNVERIFIED`, `STAGING_FINALIZE_RECORDS_ENUMERATION_UNVERIFIED`.
- `tests/archive-restore-enumeration-failclosed.test.mjs`: 6 synthetic malformed-result regression cases (commit three, finalize one, rollback readonly/readwrite two). Expected abort/preservation of live journal, history and staging; no real records or deletion involved. **CI pending; do not assert PASS before checking exact HEAD.**
- No changes to main, production database, Android permissions, video cleanup permissions or release. Restore335 STOP; v2 ledger/portable archive remain unresolved. One next step: inspect Fast Quality and Android CI for exact new PR HEAD, resolve failures before further changes. No merge/deploy authorized.

---

## 2026-11-22 — P1: npm lockfile и воспроизводимые Android CI — PASS на точном SHA

- Code+tests+docs SHA **`2e7ea193a2efe55124c250fc7f8631d8bf7fa17f`**: [Fast Quality #45066672875](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066672875) **completed/success, 813/813 tests PASS, 0 FAIL** (job #137344290582). [Android #45066672884](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066672884) **completed/success, 813/813 tests PASS, 0 FAIL**, debug APK built/uploaded (job #137344279027). ZIP artifact #14770759970, ZIP digest `b4f31054e48cf8f459f6b83f3bef0290a9a55dfd7109c3d9484e2e0f4266db2a` (**это не SHA самого APK**); истекает 2026-12-06. Проверена именно установка через `npm ci`, а не прежний `npm install`.
- `package-lock.json` создан из `npm install` в успешном GitHub Actions #45066477298 (job #137343654312), root `paseka-android@1.0.0`, lockfileVersion 3, 100 transitive dependency entries, каждый с версией, HTTPS registry.npmjs.org URL и Subresource Integrity. Совпадение direct dependencies с `package.json` проверено. Временный вывод lockfile из CI удалён **до финальной проверенной сборки**.
- Три активных GitHub workflows `quality.yml`, `android-debug.yml`, `android-archive-test.yml` переведены на `npm ci --no-audit --no-fund` и cache keys по SHA lockfile. Native archive bridge `scripts/prepare-android-archive-download.mjs` добавлен в PR path filters Android CI. `tests/ci-npm-lockfile-reproducibility.test.mjs` — 7 новых проверок lock metadata/SRI/CI paths/исключения bootstrap.
- [Draft PR #395](https://github.com/250oisr-eng/Pasekaapp/pull/395) остаётся зависимым от #394; `main` и production не изменены. Фактическая экономия времени CI пока не измерена; результат — **воспроизводимые npm версии**, не доказательство отсутствия всех supply-chain рисков или физической работоспособности продукта.
- Следующие P0/P1 блокеры STABILIZATION_ONLY: lineage и безопасная интеграция архивного стека в `main` с полноценной v2 ledger/restore совместимостью; IndexedDB migration/offline SW, product Android permissions, regression физических профилей. Полевые записи пчёл недоступны в ноябре; real media deletion NOT_AUTHORIZED. Без отдельного разрешения ни merge, ни production deployment.

---

## 2026-11-22 — P1 стабилизация: воспроизводимая npm dependency graph / npm ci

- Обнаружен `package.json` c четырьмя прямыми pinned зависимостями и **отсутствующий package-lock.json**. Все три CI workflows использовали `npm install --no-audit --no-fund`, что допускало изменение вложенных npm зависимостей между сборками. Это риск воспроизводимости тестов/Android APK, не подтверждённая утечка или поломка production.
- В дочернем **Draft PR #395** поверх #394 bootstrap выполнен в успешном GitHub Fast Quality job #137343654312 (run #45066477298): npm install сгенерировал npm v3 lockfile; проверены root name/version/direct dependencies и наличие 100 nested package entries. Проверенный `package-lock.json` создан отдельным commit. Временный вывод lockfile из CI удалён после bootstrap.
- `.github/workflows/quality.yml`, `.github/workflows/android-debug.yml` и `.github/workflows/android-archive-test.yml` теперь используют `npm ci --no-audit --no-fund`; кэш npm привязан к SHA `package-lock.json`; Android PR paths дополнены `scripts/prepare-android-archive-download.mjs`, чтобы изменения native bridge не проходили мимо Android CI.
- Новый `tests/ci-npm-lockfile-reproducibility.test.mjs` проверяет совместимость root dependencies, версии и SRI всех transitive packages, использование `npm ci`, отсутствие временного lockfile log bootstrap, PR path filters, сохранность полной регрессии. До завершения очередных Fast Quality и Android CI на точном финальном SHA — **не объявлять PASS**.
- Главная ветка не изменена; не объединять PR без разрешения, не запускать deployment, не изменять реальные данные. `STABILIZATION_ONLY` остаётся активным, P0 архив/медиа/rollback и P1 offline/миграции остаются в очереди.

---

## 2026-11-22 — P0 стабилизация: staged cleanup key/kind enumeration, exact-SHA CI

- В дочернем Draft PR #394 (поверх #393, без merge) устранены два remaining fail-open fallback в `discardArchiveRestoreSession`: нештатное `index('sessionId').getAllKeys` больше не считается пустым списком, нештатное `index('kind').getAllKeys` больше не подменяется пустым списком. Ошибки `STAGING_CLEANUP_KEYS_UNVERIFIED` / `STAGING_CLEANUP_KINDS_UNVERIFIED`, вся readwrite транзакция откатывается и staged copies сохраняются.
- При многократном abort IndexedDB запросов `abortWith` теперь сохраняет **первую** установленную причину отказа, а не перезаписывает её последующим DOM `AbortError`. Это проверено негативными синтетическими сценариями; реальная очистка пользовательских данных не выполнялась.
- Добавлено 6 исполняемых тестов к `tests/archive-restore-enumeration-failclosed.test.mjs`: штатное удаление/идемпотентность, 3 malformed key list, 2 malformed kind list, сохранность state и staging. **Первый SHA `72531bb3aa415670070abe4de0eceb8de5b42b6b` FAILED**: Fast Quality #45066137553: 804 PASS / 2 FAIL из 806; причина — потеря первого error при sibling IDB abort, а не физическое удаление данных. Исправлено и проверено на exact code SHA `7962d2aa383f168be7542510152bab03d821e6dc`.
- **Fast Quality [#45066221998](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066221998): completed/success, 806/806 тестов PASS, 0 FAIL**. **Android [#45066221985](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066221985): completed/success, 806/806 тестов PASS и debug APK assembled/uploaded**. [APK ZIP artifact #14770884898](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45066221985/artifacts/14770884898), ZIP digest `b9ad0030651d6d8bdd83811b6aed96cd81a236f672786ecf0533e6ea04125acb` (это не бинарный APK SHA).
- Ветка после документальных коммитов будет иметь другой HEAD; CI доказан для **точного code SHA**, не для всех последующих docs-only commit. В `main` пока нет этих исправлений; STABILIZATION_ONLY остаётся активным, real video/cleanup/restore/deletion NOT_AUTHORIZED.
- Следующая P1 задача: воспроизводимость npm зависимостей (в репозитории отсутствует `package-lock.json`, CI использует `npm install`) и более глубокие сценарии IndexedDB rollback/старых данных. Не переключать на `npm ci` без верифицированного lockfile.

---

## 2026-11-22 — стабилизация P0: ключи и типы staging при cleanup не могут молча считаться пустыми

- При контроле архивного `discardArchiveRestoreSession` обнаружены две оставшиеся нештатные ветви: `archive_staging.index('sessionId').getAllKeys(sessionId)` с ответом `null/undefined` раньше подменялся `[]` и позволял вернуть `false` («нечего очищать») при непроверенном индексе; `index('kind').getAllKeys(kind)` с аналогичным ответом раньше также подменялся `[]`, маскируя причину отказа. Стандартный IndexedDB возвращает массив — речь о fail-closed инварианте для сломанного адаптера/регрессии, не о подтверждённом физическом дефекте.
- В `js/paseka-archive-restore.js` оба чтения теперь требуют `assertIndexedDbRows` и выдают `STAGING_CLEANUP_KEYS_UNVERIFIED` / `STAGING_CLEANUP_KINDS_UNVERIFIED`. Ошибки внутри обработчиков IndexedDB перехватываются и передаются через `abortWith`, поэтому не теряется диагностический код; транзакция abort и существующие записи staging сохраняются.
- `tests/archive-restore-enumeration-failclosed.test.mjs` дополнен шестью синтетическими сценариями: нормальный cleanup и идемпотентный повтор, три невалидных primary-key index responses, два невалидных kind-index responses с проверкой сохранности `archive_staging` и журнала. Никаких реальных файлов или cleanup пользователя тест не открывает.
- Рабочая ветка `fix/archive-cleanup-key-enumeration-guard-2026-11-22` должна идти дочерним Draft PR поверх #393. Сначала полные Fast Quality и Android CI на точном HEAD, **до проверки не писать PASS**. Даже после успеха безопасный real cleanup остаётся NOT_AUTHORIZED, `main` без изменений.
- Отдельный P1 риск для следующего цикла: `package-lock.json` отсутствует в проверенной рабочей ветке, тогда как CI использует `npm install`. Версии прямых npm зависимостей закреплены, транзитивные могут меняться между сборками. Для воспроизводимой цепочки требуется верифицированный lockfile + `npm ci` с тестом на реальных GitHub Actions; без проверенного lockfile не менять `npm install` на `npm ci` вслепую.

---

## 2026-11-22 — стабилизация: CI archive scope исправлен, exact-SHA проверки PASS

- Пользователь запретил новые функции до завершения выявленных оптимизаций и исправлений: обязательный `STABILIZATION_ONLY` записан в `AGENTS.md`, `docs/СТАБИЛИЗАЦИЯ-ПЕРЕД-НОВЫМИ-ФУНКЦИЯМИ-2026-11-22.md`, `docs/PROJECT-CONTROL.md`, правила разработки и план. Ежедневная задача «Автономная разработка „Пасеки“» обновлена на **«Автономная стабилизация „Пасеки“»** с неизменным расписанием и запретом новых функций до отдельного подтверждения пользователя. Другая автоматизация не затронута.
- В Draft PR #393 (`fix/stabilization-freeze-ci-archive-scope-2026-11-22` поверх #392) удалён глобальный `pull_request` триггер из **специализированной** сборки `.github/workflows/android-archive-test.yml`, прежде порождавший `SKIPPED` на чужих PR. Сохранились ручной `workflow_dispatch`, push выделенной архивной ветки, isolated package ID, `npm test`, Android API 35, Gradle и загрузка артефакта. Добавлен `tests/ci-isolated-archive-scope.test.mjs` (3 проверки). Обычный Fast Quality и Android PR CI не ослаблены.
- **Exact code+docs SHA `3c06a0da05921bfab7e7e4c12ee2e6bf47b83f25`**: [Fast Quality #45065566706](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065566706) **completed/success**, 800/800 tests PASS, 0 FAIL. [Android #45065566700](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065566700) **completed/success**, 800/800 tests PASS, 0 FAIL, debug APK assembled/uploaded. [Artifact ZIP #14771057212](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065566700/artifacts/14771057212), ZIP SHA256 `9e0a0587979ed4461de272ab99c88b7ffb61ee04cd9331e69672b75ff950aaa8`; не заявлять, что это хэш бинарника APK. Для нового SHA специализированный архивный workflow не запускался и не нужен, не приписывать ему PASS.
- Следующий отдельный стабилизационный блок: проверка связности и интеграционных блокеров архивного v1/v2, конкурентных IndexedDB writers и CI, без новых функций и без реальных данных. P0/P1 остаются открыты; **стабилизация НЕ ЗАВЕРШЕНА**, нового функционала не разрабатывать. После этой документальной записи code+docs exact checked SHA уже не равен новому documentation-only HEAD; отличать статусы. Main/production/реальные медиа не затронуты, merge запрещён без конкретного разрешения.

---

## 2026-11-22 — обязательная стабилизация до новых функций

- Пользователь **запретил переход к дальнейшей разработке функций**, пока не завершены оптимизация и исправления. Режим `STABILIZATION_ONLY`: разрешены аудит, точечные исправления безопасности, регрессии, оптимизация CI, миграционные тесты, документация и Draft PR. Запрещены новые пользовательские функции, экраны, технологические операции и расширение ИИ. Не снимать режим автоматически после отдельного успешного CI.
- Контрольный документ: `docs/СТАБИЛИЗАЦИЯ-ПЕРЕД-НОВЫМИ-ФУНКЦИЯМИ-2026-11-22.md`; критерии P0/P1, очерёдность, безопасные исключения из реальных ноябрьских медиа, необходимость отдельного подтверждения пользователя перед возобновлением новых функций.
- Выполнено ограниченное исправление CI: `.github/workflows/android-archive-test.yml` больше не порождает `skipped` job для чужих PR, сохраняя `workflow_dispatch`, push только по выделенной исторической archive test ветке, `npm test`, проверку изолированного appId и Gradle APK. `tests/ci-isolated-archive-scope.test.mjs` — новые статические регрессии на неизменность защит. `main` и production не изменены.
- После открытия Draft PR проверить точный code+docs SHA по Fast Quality и общему Android workflow. До завершения CI обозначать как `NOT_VERIFIED`. Отсутствующий/пропущенный workflow не равно PASS. Продолжать только стабилизацию P0/P1 и PR lineage, никаких feature задач.

---

## 2026-11-22 — P0: read-only audit protected media/history fail-closed, final exact SHA PASS

- Заключительный code/test SHA `837a36efb329b1e7fe6d1c2e63da3af6696a31e7`: [Fast Quality #45065053746](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065053746) **completed/success**, job #137339229782, **797/797 tests PASS, 0 FAIL**. [Android #45065053625](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065053625) **completed/success**, job #137339245171, **797/797 PASS, 0 FAIL**, debug APK built/uploaded. [GitHub artifact ZIP #14770873137](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45065053625/artifacts/14770873137), ZIP SHA256 `72289479e04056492e684820a6375c22ef3dd5dc4007194fa0486de54bd77c58` (не SHA самого APK), expires 2026-12-06.
- Помимо проверки stage/commit/rollback/history в предыдущем кодовом этапе, `inspectStagingRecognitionCopies` перестал выдавать `ok:true / no_recognition_history`, если в одной согласованной read-only транзакции были невалидные списки session headers, video-copy keys или archive_history. Ошибки `STAGING_SESSIONS_ENUMERATION_UNVERIFIED`, `STAGING_VIDEO_KEYS_ENUMERATION_UNVERIFIED`, `ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED`. Добавлены 4 отдельные synthetic adapter tests (здоровая пустая база и 3 повреждённых result); все тесты не мутируют данные пользователя.
- Итого новые регрессионные сценарии в `tests/archive-restore-enumeration-failclosed.test.mjs` — **15**; весь репозиторий 797/797. Первоначальный SHA `ce82bcc...` был FAILED на одном сценарии обработчика событий IndexedDB и исправлен, результат не маскировать. Проверенные code SHAs: `823b350a...` 793/793 PASS и `837a36ef...` 797/797 PASS.
- **Граница:** это страховка от malformed IndexedDB adapter, реального Android browser сбоя не было продемонстрировано; полный безопасный v2 архив с ledger/tombstones ещё архитектурный проект и **не интегрирован** в этот v1 архивный стек. Реальные видео/recognition/recovery/deletion и product permissions не тестировались. Cleanup/delete запрещены. main и production не менялись; PR #392 Draft, никакого merge.
- Следующий безтелефонный блок: read-only аудит v2 источников, модель v2 archive ledger+originals с чёткими fail-closed контрактами и синтетическими roundtrip/corruption tests прежде чем разрешать какую-либо реальную очистку. Не переносить старые ветки v2 целиком и не придумывать формат по факту отсутствия согласованной реализации.

---

## 2026-11-22 — P0: restoration/rollback media + history enumeration FAIL CLOSED, exact-SHA CI

- **Code/test SHA `823b350aaf0811dfe0adc78366f7d20eed1f044f`**: [Fast Quality #45064787022](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064787022) **completed/success**, job #137338408345, **793/793 Node tests PASS, 0 FAIL**. [Общая Android сборка #45064786997](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064786997) **completed/success**, job #137338408192, **793/793 tests PASS**, Android debug APK build/upload success. Artifact ZIP #14770707550, digest `3ddaf24b10274647951ee15d8f73daf89b3fae5cb427d0fc3da1c59bfb94ca64`; digest ZIP не является SHA APK. Специализированный isolated archive workflow #45064787126 **SKIPPED** из-за branch condition, не считать успешным.
- **Честная история ошибок:** исходный PR code SHA `ce82bccb7f306ba20570fd953f8ed4f78d4e2e5a` дал `Fast Quality FAILED` (один новый тест history enumeration получил стандартный DOM `AbortError` вместо установленного кода). Причина — синхронное исключение в IndexedDB `historyRequest.onsuccess` не перехватывалось. Исправлено `try/catch -> abortWith(error)` в том же обработчике; повторный набор PASS. Оригиналы и rollback staging сохранялись уже при первом провале.
- В `js/paseka-archive-restore.js` добавлены fail-closed Array checks для media enumeration на стадиях stage/commit/rollback и для history enumeration до staging deletion; сигналы `RESTORE_MEDIA_ENUMERATION_UNVERIFIED` и `ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED`. `tests/archive-restore-enumeration-failclosed.test.mjs` содержит 11 исполняемых синтетических проверок нормального массива, malformed read-only и readwrite ответов, stage/commit/rollback и защиту ссылок archive_history. Никакого real restoration/deletion, production DB или Restore335.
- **Важная граница:** IndexedDB по контракту выдаёт массив из `getAll()`; защита нужна для неожиданных ответов/моков/изменения адаптера. Это не равно готовности полного архива к production: v1 по-прежнему запрещает ненулевой recognition ledger, архитектурный v2 contract отдельный и не интегрирован; реальный backup/restore и delete NOT_TESTED/NOT_AUTHORIZED.
- Следующая приоритетная задача: точечные тесты v2 контрактов ledger/pending video и безопасной изоляции профилей/офлайн. Нельзя сливать PR в main без отдельного явного решения; данные пользователя не трогать.

---

## 2026-11-22 — P0: гарантии перечисления media/history во время staging/restore/rollback

- В отдельной ветке `fix/archive-restore-enumeration-failclosed-2026-11-22` поверх Draft PR #391 внесено точечное исправление `js/paseka-archive-restore.js`: `assertIndexedDbRows` запрещает интерпретировать нештатный результат `IDBObjectStore.getAll()` как пустой список. Основные пути: начальное сканирование видео при staging; повторная проверка при коротком write lock; Phase A hash baseline; Phase B commit write lock; фазы rollback; `archive_history.getAll()` перед удалением staging.
- Для медиа используется `RESTORE_MEDIA_ENUMERATION_UNVERIFIED`, для ссылок истории — `ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED`. Все эти ошибки блокируют операцию; нет автоматической очистки или восстановления из неизвестного источника. Стандартный IndexedDB при нормальной работе возвращает Array — это защита от ошибочного адаптера/рефакторинга, а не доказательство исправления известного физического сбоя Android.
- Добавлен `tests/archive-restore-enumeration-failclosed.test.mjs`: 11 синтетических сценариев (штатная пустая медиа-библиотека, 4 некорректных ответа первичного чтения, ошибка write-lock сканирования, Phase A и Phase B commit, защищённое удаление staging, Phase A и Phase B rollback), используются отдельные fake-indexeddb и подменяемые **только ответы** getAll через изолированный Proxy. Проверяется сохранность live state, archive_history и staging.
- Это кодовый + регрессионный этап; пока CI на exact SHA не завершён, не объявлять PASS. После финального documentation snapshot создать Draft PR и выполнить полный Node/Android CI на проверенном SHA. `main`/production пользовательские данные и Restore335 не затронуты, удаление видео по-прежнему запрещено.
- Далее: audit архитектуры writer-lock и v2 media-ledger/restore с отдельными независимыми фикстурами; отсутствие real recording в ноябре не блокирует развитие.

---

## 2026-11-22 — CI ускорение подтверждено на точном code SHA

- Code/test/workflow SHA `d45d6630561295efcfbd292e7893cfef06b3eac0`: [Fast Quality #45064009718](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064009718) **completed/success**, 782/782 tests PASS, 0 FAIL (job #137336001559). [Android #45064009728](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064009728) **attempt 1 CANCELLED** до Gradle во время обновлений PR; **rerun attempt 2 completed/success** (job #137336366763): 782/782 tests PASS, 0 FAIL, Android debug APK build/upload success. [Artifact #14770079580](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064009728/artifacts/14770079580) ZIP digest `6b23f9f3cac3126d61eb4395ccdb2cafaca08f1771e055ec73a08350c23c7721`; это не подтверждённый APK binary SHA.
- В `.github/workflows/quality.yml` добавлен обязательный на уровне конфигурации `pull_request` для кода/тестов, push ограничен `main`; в `.github/workflows/android-debug.yml` push также ограничен `main`, PR-прогон сохранён. `workflow_dispatch` и npm/Gradle regression не удалены, concurrency по PR number. `tests/ci-pr-branch-triggers.test.mjs` сохраняет контракт триггеров.
- Операционное правило ускорения: **заканчивать код+тесты+документы до создания Draft PR**, затем один полный CI на code SHA; документы после создания PR могут запускать новый synchronize и отменить идущие задания из-за `cancel-in-progress`. После обновления одних документов успех предыдущего code SHA не называть успехом нового HEAD.
- Остаток: новая PR-first конфигурация проверена на одном тестовом PR; систематическое уменьшение числа запусков за длительный период не измерено. Это ускорение уменьшает вероятность дублей, но не доказанная кратность экономии. Использовать Draft PR для работы; до открытия PR ветка не получает общих push CI. Никаких merge/main/production/пользовательских данных.

---

## 2026-11-22 — крупный цикл ускорения: PR-first CI вместо дублей и быстрый feedback

- По запросу пользователя на ускорение с разрешением безопасных разработческих действий создан дочерний **Draft PR #391** поверх #390. Изменены только `.github/workflows/quality.yml`, `.github/workflows/android-debug.yml`, добавлен `tests/ci-pr-branch-triggers.test.mjs`.
- Ранее `quality.yml` не реагировал на PR, только на push; Android общим workflow мог запускать **дважды** на каждый code commit (branch push и pull_request). Теперь оба набора работают по PR и по push **только в main**, плюс `workflow_dispatch`; concurrency group привязан к номеру PR. Ни `npm test`, ни Android Gradle сборка, ни artifact upload, ни permission boundaries не удалены. Базовую проверку обязательно проводить в Draft PR; push без PR теперь не выдаёт общий CI — это сознательный trade-off с обязательным Draft PR правилом.
- Добавлены регрессии на PR-триггеры, необходимое покрытие paths, branch main, workflow_dispatch, отказ от `pull_request_target`, Android assembleDebug/upload. Не трогать `main`, production и реальные пользовательские файлы.
- Code/test SHA `d45d6630561295efcfbd292e7893cfef06b3eac0`; [Fast Quality #45064009718](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064009718) и [Android #45064009728](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45064009728) запущены — точные результаты проверять отдельно после завершения. Isolated archive job #45064009733 ожидаемо skipped из-за ограничения имени ветки, не является PASS.
- Приоритет дальнейшей оптимизации: работа в **небольшом числе устойчивых Draft PR-цепочек** вместо выпуска диагностического APK на каждую микрозадачу; P0 — полный архив и откат; потом permissions/offline и приложение без реальной ноябрьской съёмки. Не удалять архивные/исследовательские ветки без доказанной ненужности, не делать массовых merge.

---

## 2026-11-22 — P0: запрет неполного архива при недостоверном списке видео

- По результатам инвентаризации [401 ветка / 317 открытых PR](https://github.com/250oisr-eng/Pasekaapp/pull/389) создан зависимый **Draft PR #390** поверх #388; `main` не изменён. В `js/paseka-archive.js` `readConsistentDatabaseSnapshot` перестал трактовать не-массивное значение `entrance_media.getAll()` как пустой список видео: теперь `VIDEO_SNAPSHOT_UNVERIFIED`, транзакция abort, export блокируется без записи и удаления источников.
- Добавлен `tests/archive-video-snapshot-integrity.test.mjs`: штатное пустое Array принимается; шесть некорректных значений (`undefined/null/{}/string/0/false`) отвергаются; экспорт при `null` не выдаёт неполный архив. Фикстуры синтетические, настоящий Blob/медиа пользователя не открываются.
- **Exact code/test SHA `eb11b71dc632b191bd6f557e42d57ba2d0f9db1c`**: [общий Android CI #45063432833](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45063432833) **completed/success**, job #137334217283 **776/776 тестов PASS, 0 fail**, Android Debug APK build/upload completed. Artifact #14770447374, ZIP digest `89d50d732734843be71fd96b81dcb82ae704877307e03213e3c489c52e9d7a06`, expires 2026-12-06. APK binary SHA в этом workflow не подтверждён: не выдумывать хэш APK. Изолированный archive workflow #45063432834 **SKIPPED** по workflow branch condition; не считать его PASS.
- Защитное изменение покрывает только нарушение контракта перечисления медиа; реальный IndexedDB штатно возвращает Array. Не доказывает полную атомарность экспорта, перенос видео-леджера в v2, безопасность production backup/restore или разрешение удалить источники. Все реальные медиа и cleanup остаются NOT_TESTED/NOT_AUTHORIZED.
- Дальше: аудит проверки восстановленных архивов, редких race/rollback, корректной схемы и интеграции стека из Draft PR в главную ветку — **только после отдельного разрешения merge**. Никакой физической ноябрьской съёмки не требуется.

---

## Дополнение к PR #212 — аудит осиротевших видеокопий (2026-11-20)

- Исправлен `inspectStagingRecognitionCopies(db)` в `js/paseka-archive-restore.js`: прежде он рассматривал только видеокопии staging, для которых сохранился `kind=session` header. Теперь только по индексным **ключам**, без загрузки Blob в память, проверяются и видеокопии с потерянным заголовком. Такие копии получают `status='orphaned_header'`, `missingSessionHeader=true` и `action='manual_review_required'`.
- В отчёт добавлены `orphanedMatchedCopies`, `unclassifiedVideoKeyCount`, `requiresManualReview` и явное `identityVerifiedByBytes=false`. Один `videoId` без доказательства идентичности SHA-256 **не даёт права удаления**. Ссылки из `archive_history` остаются помеченными как защищённые. Дубли идентичностей ledger и неподдерживаемые cleanup-состояния приводят к fail-closed ошибке.
- В `tests/archive-staging.test.mjs` добавлены регрессии на удалённый header с сохранённым staged Blob, orphan с архивной историей, duplicate ledger identity и неподдающиеся классификации ключи. Проверяется, что отчёт не меняет временные записи и ledger.
- Кодовый SHA `cf4d71aa254e9dc49656e41f681f98aca962c35c`: [полный регрессионный job #44672535903](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672535903) **completed/success**. Android CI на кодовом и итоговом документационном SHA проверять отдельно.
- Автоматическая очистка, привязка результата к хэшу исходного видео и транспорт `ledger/tombstone` в переносимом архиве остаются блокерами. PR #212 Draft, main/production/физические архивы/данные не менялись и не удалялись.

---

## Дополнение к PR #212 — повторная очистка без записей (2026-11-20)

- `discardArchiveRestoreSession` после чтения индексных ключей возвращает `false`, если staging-сессия уже пуста; операция **ничего не удаляет** и не ошибается лишь из-за сохранившейся в `archive_history` ссылки. Если хоть одна запись есть, полные проверки ownership/kind/history продолжают действовать в единой readwrite-транзакции.
- Добавлен регрессионный тест `tests/archive-staging-cleanup-status.test.mjs` на двукратный повтор пустой очистки при наличии старой ссылки из истории.
- Кодовый SHA `6a699d3c10ca43658a5554a52f0b8017837ce4b6`: [complete regression #44672319861](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672319861) **completed/success**; Android CI и проверка итогового документационного SHA требуют отдельного подтверждения.
- Автоудаление после распознавания не подключено. Основной оставшийся блокер: `video_recognition_ledger_v1` не содержит подтверждённой привязки к хэшу байтов, а `.paseka` v1 не сохраняет ledger/tombstone; поэтому автоматическая очистка остаточных staged-копий не разрешена.

---

## Контрольная точка — защита истории при очистке archive_staging (2026-11-20)

- Создан зависимый Draft PR #212 поверх #211: ветка `fix/archive-staging-history-protection-2026-11-20`. `main`, production, реальные пользовательские записи и архивы не изменялись.
- Исправлен `discardArchiveRestoreSession` в `js/paseka-archive-restore.js`: прежняя реализация проверяла `archive_history` только для staging без заголовка; теперь ссылка на импорт или rollback проверяется **для каждого случая** в одной IndexedDB readwrite-транзакции с возможной очисткой. Статусы `failed`/`ready`/`staging` не обходят защиту истории. Завершённый `reverted` импорт допускает прежнюю явную очистку лишь при `status=reverted` в истории, `rollbackAvailable=false`, отсутствии ссылки на rollback session и точном `backupId`.
- Добавлена fail-closed проверка `sessionId`, заголовка `session.sessionId/backupId`, всех primary keys и соответствующего `kind` по вторичным индексам **без чтения видео Blob**. Неизвестные/перепутанные записи, включая `rollback_video` в чужой сессии, не удаляются; отсутствие индекса `kind` приводит к безопасному отказу.
- Новые регрессии в `tests/archive-staging-cleanup-status.test.mjs`: защита ссылки history даже при повреждённом статусе, корректный полностью завершённый rollback, конфликт `backupId`, cross-session key, подмена `kind`, старый IndexedDB без обязательного индекса и неправильный sessionId. `tests/archive-restore-atomicity.test.mjs`: синтетический header приведён к действительной форме с `backupId` (защитный код не ослаблен).
- Кодовый SHA `dfa7957cf111a0b055f2122e0cb5b5de81a5d50f`: [complete regression #44672101794](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672101794) **completed/success**. Android CI на этом SHA проверять отдельно; документационный HEAD потребует собственного CI.
- **Что не сделано:** автоматическое удаление видео после распознавания, проверка идентичности байтов для staging-копий, транспорт ledger/tombstone в `.paseka` и физическая Android-проверка. Новый код усиливает существующую ручную очистку; без полноценного протокола он не является разрешением удалить оригинал или резервную копию. `main` не менялась, PR Draft, merge/deployment отсутствуют.
- Следующий этап: безопасный недеструктивный план идентификации staged-копий по подтверждённому результату и хэшу содержимого; только после согласования архивного формата и восстановления — проверенная селективная очистка с retry и регрессионными сценариями после обрыва.

---

## Контрольная точка — предотвращение повторной готовности staging и аудит остаточных видео (2026-11-20)

- Создан зависимый Draft PR #211 поверх #210, отдельная ветка `fix/archive-staging-finalize-ledger-2026-11-20`. Основная ветка `main` не менялась.
- `js/paseka-archive-restore.js`: `updateSession` проверяет `main/video_recognition_ledger_v1` в общей readwrite-транзакции, прежде чем присвоить `ready` (также при идемпотентном повторе). `finalizeStagedArchive` проверяет тот же ledger непосредственно в своей readwrite-транзакции после полной проверки снимка, в том числе когда сессия уже была `ready`. Если распознавание завершилось в промежутке — `VIDEO_LEDGER_NOT_PRESERVED`, без новой записи/смены состояния.
- Добавлен `inspectStagingRecognitionCopies(db)`: **только чтение** ключей staging и метаданных ledger; возвращает число копий с подтверждённым распознаванием и tombstone, наличие ссылок архивной истории и `manual_review_required`. Не удаляет Blob, журнал, историю, rollback snapshot или исходный архив и не выдаёт `archiveSafe`.
- `tests/archive-staging.test.mjs`: новые реальные fake-indexeddb тесты перезапуска/явной финализации с новым ledger, повторной проверки уже готовой сессии, гонки после последнего video, обнаружения stale staged copies и полной неизменности Blob/ledger, испорченного ledger и старой базы.
- **Ограничения:** audit не является механизмом автоматического удаления. Ранее созданные копии в `archive_staging` сохраняются; пользовательские архивы и old backup не переписываются. Формат `.paseka` v1 не переносит ledger/tombstone. Полная пофайловая интеграция с видеоцепочкой #205–#209, архив v2 и физические Android проверки остаются отдельными задачами.
- CI оценивать только на точном HEAD #211. Не объединять PR и не развёртывать production без отдельного разрешения.

---

## Архивный PR #210 — атомарный барьер записи staging после распознавания (2026-11-20)

- В `js/paseka-archive-restore.js` функция `putStagingEntryAndUpdateSession` читает `main/video_recognition_ledger_v1` **в той же IndexedDB readwrite-транзакции**, в которой создаёт каждый staged-оригинал и увеличивает `stagedCount`. При подтверждённом результате распознавания или повреждённом журнале операция abort; новая видеокопия не записывается.
- Новый тест `tests/archive-restore-atomicity.test.mjs` моделирует запись результата распознавания после первой видеокопии при многофайловом импорте и подтверждает, что следующая копия не записана, сессия помечена failed и ранее сохранённый ledger остаётся.
- Это расширение preflight из предыдущего этапа. **Открытый риск:** оригиналы, скопированные в `archive_staging` *до* завершения распознавания, сохраняются до безопасной очистки staging. Не удалять/не считать удалёнными source, архив, медиа и recovery snapshot без полного транзакционного протокола. Также требуется запрет подтверждения статуса ready при обнаруженном ledger и сценарии restart/retry.
- Исходный archive v1 всё ещё не переносит `video_recognition_ledger_v1` и tombstone; при непустом ledger импорт/откат/экспорт блокируются. Архивную ветку #168 и видеоцепочку #205–#209 нельзя сливать автоматически: требуется аккуратное согласование и сквозное тестирование.
- PR #210 остаётся Draft. Кодовый SHA этой доработки `7ab2d4382d0abf46f39536130bafc6c3da6581bc`; точные результаты CI указывать по GitHub после завершения. Ни production, ни пользовательская пасека не изменены, данные не удалялись.

---

## Архив PR #210 — запрет подготовки несовместимого импорта (2026-11-20)

- Функция `stageArchiveForRestore` теперь проверяет `main/video_recognition_ledger_v1` до разбора архива и повторно после асинхронной проверки, перед записью в `archive_staging`. При наличии результатов распознавания или повреждённом ledger подготовка v1 не начинается, чтобы не создавать управляемые дубли старых видео.
- Добавлены регрессионные тесты: старый архив с непустым ledger не создаёт staged entry; повреждённый ledger не переписывается.
- **Остаточный риск:** распознавание может завершиться уже во время многотранзакционной подготовки. Поштучная атомарная сверка ledger и очистка временных записей при сбое пока не реализованы; нельзя считать защиту всех staged-копий завершённой. Финальный импорт и откат дополнительно защищены проверкой в readwrite-транзакциях.
- Порядок приоритета: добавить transaction-level ledger guard для `putStagingEntryAndUpdateSession`, проверить resume/recovery и безопасную очистку временных копий без удаления источников и резервных копий; затем вводить перенос истории/tombstone в новую версию архива.
- Все изменения находятся в зависимом Draft PR #210 поверх #168. CI нового HEAD требует повторной проверки, main/deploy не затрагиваются.

---

## Контрольная точка — fail-closed полная архивация и восстановление видео (2026-11-20, Draft PR #210)

- Отдельная зависимая ветка от архивного Draft PR #168: `fix/full-archive-video-ledger-interlock-2026-11-20`. Видеостек #205→#209 **не объединён** с архивной веткой; изменение минимально и не переносит неподтверждённую модель удаления.
- `js/paseka-archive.js`: `readConsistentDatabaseSnapshot` читает `main/video_recognition_ledger_v1` в одной readonly-транзакции с `state` и `entrance_media`. Архив v1 не создаётся, если журнал распознавания не пуст или повреждён, потому что формат не переносит его.
- `js/paseka-archive-restore.js`: в финальных readwrite-транзакциях `commitStagedArchive` и `rollbackCommittedArchive` читается тот же ключ; в случае результатов распознавания или повреждённого журнала импорт/откат отклоняются без изменения `state`, `entrance_media`, `full_backup`, `archive_history` и staging. Проверка именно внутри write lock предотвращает потерю результатов при гонке с распознаванием.
- `tests/archive-export.test.mjs` и `tests/archive-restore-atomicity.test.mjs`: новые тесты проверяют распознанные/повреждённые результаты, сохранение прежнего поведения при пустом ledger, необратимость импортного overwrite и rollback при изменении ledger после подготовки, неизменность данных при отказе.
- **Это защитное ограничение, а не финальный формат архива.** Экспорт результатов и tombstone в `.paseka` отсутствует. Существующие архивы и оригиналы не стираются. Полное восстановление не может безопасно заменить данные при непустом ledger до проектирования следующей версии совместимого архива. Удаление видео по распознаванию не включено.
- CI на точном итоговом SHA должен быть отдельно проверен. `main`, production, физическая пасека и пользовательские данные не затронуты; PR #210 Draft, merge/deployment не выполнялись.
- Следующее: согласовать полноценный перенос `ledger/tombstone` через новую версию `.paseka` и все стадии (export, validation, stage, commit, rollback), затем сквозные тесты восстановления, отдельных backup-файлов, Android и внешних копий камеры.

---

## Контрольная точка — CI исправления истории rollback (2026-11-19)

- Актуальный GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`, не изменён.
- Основной Draft PR #168: HEAD `13137de26c6e756c144c84adde2851712c661775`, base main, `mergeable=true`.
- Исправление renderer истории в `index.html` использует `backupId || sourceBackupId`; регрессионный тест `tests/archive-restore-history-ui.test.mjs` входит в PR #168.
- Android workflow #44467107603 на точном HEAD #168 завершился `success`: **731/731 tests passed, 0 failures**, Capacitor sync, Gradle Debug APK build и artifact upload — success. Job ID `135369261478`.
- Artifact `paseka-debug-apk`, ID `14502782884`, size 3,451,620 bytes, ZIP SHA-256 `37e5378b362e4850685c727a69baaa7ea9d66458d7276ee6b0c1f74cbc32e139`, expires 2026-12-03. Это обычная Debug APK; не использовать для установки на телефон вместо изолированной test4.
- Физический commit/rollback ранее подтверждён на изолированной test3. Проверка исправленного отображения после rollback на test4 ещё не завершена.
- PR #174: HEAD `82afa8e4feaa9ebdabd4bf99ca7671a0b91fc842`, Draft, `mergeable=false`, base PR #168 на старом SHA `c7199c61f7161fc4b542e35d77f9318310939c37`. Ветку не сливать; она используется только для изолированной сборки. Триггер CI после обновления test4-теста ожидается.
- Lovable project `8193a703-9f20-4dc8-9460-8d93225ea25f`: `needs_attention / out_of_credits`, latest commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef`; этот SHA не найден в GitHub Pasekaapp, синхронизация с репозиторием не подтверждена.
- Следующий шаг: подтвердить изолированный workflow и артефакт с package ID `ru.paseka.journal.archive.test4`; затем физически проверить отображение исходного backup ID после rollback. Test2/test3 и их данные не удалять. Не выполнять merge, публикацию или production deployment.

---

## Контрольная точка — исправление истории отменённого импорта архива (2026-11-19)

- После физического испытания commit/rollback на OnePlus 10 Pro 5G обнаружено, что отменённая staging-сессия хранит исходный идентификатор архива в `sourceBackupId`, тогда как renderer читал только `backupId` и показывал `Архив undefined`.
- Исправлено в `index.html`: отображение истории использует `backupId`, затем `sourceBackupId`, и только при отсутствии обоих — явный текст «идентификатор не сохранён».
- Добавлен `tests/archive-restore-history-ui.test.mjs`, проверяющий отображение исходного ID после rollback.
- Перенос исправления выполнен непосредственно в основной feature PR #168, а не оставлен только в test-only PR #174. Коммиты исправления: `a84b6afbe32cd28b77e0ed437079317944fca600` и `d4cc8a9b26344cc0cb11bd5a190f1cc11a28b0d0`.
- CI после последнего изменения ожидается; до его завершения не считать исправление проверенным. PR #168 остаётся Draft, main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменялась.
- Физически подтверждены экспорт, preflight/staging, commit и rollback на изолированной test3; новые данные тестового приложения восстановлены. Test2/test3 сохраняются. Test4 предназначен для повторной проверки исправленной истории; не использовать рабочее приложение и не удалять тестовые установки.

---

## Контрольная точка — защита новых записей от потери при откате архива (2026-11-19)

- Read-only аудит выявил опасный пробел: прежний rollback проверял соответствие переданной вызывающим кодом revision текущей базе, но не сравнивал текущую revision с revision, созданной самим commit импорта. Поэтому после импорта новые записи журнала могли быть затёрты при откате.
- Исправление в `js/paseka-archive-restore.js`: Phase A проверяет, что текущая revision совпадает с `importedRevisionId` сохранённой committed import session; Phase B повторяет эту проверку внутри финальной readwrite-транзакции. Проверка в Phase B закрывает гонку, когда журнал изменяется во время асинхронной проверки rollback snapshot.
- При несовпадении возврат блокируется с кодом `ROLLBACK_STATE_CHANGED`; журнал, видео, история импорта и rollback snapshot остаются без изменений. UI сообщает, что новые записи сохранены и отмена заблокирована.
- Добавлены два регрессионных сценария: журнал изменён после импорта до вызова rollback; журнал изменён во время асинхронной проверки перед финальной транзакцией. Фикстура atomicity-тестов теперь содержит committed `importedRevisionId`.
- Дополнительно исправлен запуск isolated APK workflow: он выполняется только для pull request из ветки `test/full-archive-android-isolated-2026-11-18`; в PR #168 этот test-only workflow пропускается. Предыдущий запуск #44398348034 ошибочно упал на отсутствующем в PR #168 test-only script, хотя regression tests прошли 730/730; после gate новый запуск #44398558803 корректно skipped.
- На code/test commit PR #168 `e323ee7136e2d5377696c10eb10587aa5b29fa9b`: **730/730 tests passed, 0 failures**, Android Debug build/upload workflow #44398347933 — success. На синхронизированной тестовой ветке PR #174 commit `b116b93792289ed5bb69f408d98741b151a8cc3f`: **733/733 tests passed, 0 failures**, обычная Android Debug build/upload #44398375948 — success.
- После настройки workflow gate: PR #168 isolated workflow #44398558803 — skipped (ожидаемо); PR #168 standard Android build #44398558415 — success, 730/730 tests; PR #174 standard Android build #44398564428 — success, 733/733 tests; PR #174 isolated APK workflow #44398564375 — success, 733/733 tests, Gradle build, package ID assertion и upload. Artifact `paseka-archive-isolated-test-apk`, ID `14472093088`, размер 3,451,679 bytes, ZIP SHA-256 `35b11cd016a4bd0226c4d967ba2fba7b1ed783b341f5b6b398aeee82b537b352`, expires 2026-12-02 21:11:52 UTC; package ID `ru.paseka.journal.archive.test2`.
- Физическая проверка preflight на OnePlus 10 Pro 5G ранее завершена успешно; пользовательские рабочие данные не менялись. Commit/rollback на телефоне ещё не выполнялись.
- PR #168 и #174 остаются Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась. Merge, публикация и production deployment не выполнялись.

---

## Контрольная точка — изолированная APK с исправленным Android-сохранением готова (2026-11-18)

- Изолированный test-only PR #174 пересобран поверх PR #168, package ID: `ru.paseka.journal.archive.test2`, имя: «Пасека — архив тест 2». Предыдущее тестовое приложение остаётся отдельным и не затрагивается.
- Workflow #44389963111 на SHA `fd370ff3c89a34b4d218cfc3c6cfb06001cb7677`: **731/731 tests**, Android Gradle build, проверка package ID через `aapt` и upload — success.
- Artifact `paseka-archive-isolated-test-apk`, ID `14469105084`, SHA-256 ZIP `16008c7168df0b4e28364b3e0a61012f45c7c147fe3991d334a7636a0c7c7a48`, expires 2026-12-02 20:21:56 UTC. В APK непосредственно подтверждён package ID `ru.paseka.journal.archive.test2`; production ID отсутствует.
- В APK включён native MediaStore Downloads bridge; путь сохранения: `Downloads/Пасека`. CI подтверждает компиляцию и изоляцию, но не физическую запись файла на OnePlus.
- Для повторного теста нужно установить новую APK как отдельное приложение, создать тестовый улей (его имя присваивается автоматически), записать видео летка (оно сохраняется автоматически) и проверить, что файл появляется в `Загрузки/Пасека`. Старое тестовое приложение не удалять.
- После физической проверки скачать архив, проверить открытие файла вне приложения. Не запускать восстановление/rollback до подтверждения экспорта и проверки файла.
- PR #168 и #174 остаются Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась.

## Контрольная точка — исправление сохранения полного архива на Android (2026-11-18)

- По физическому тесту пользователя на OnePlus выяснено: архив формировался (UI показывал 1 видео летка, 2.6 МБ), но файл не появлялся. Причина в прежнем UI-коде: он создавал `blob:` URL, нажимал скрытую HTML-ссылку и сразу сообщал об успехе, не подтверждая, что Android WebView сохранил файл.
- Добавлен Android native Downloads bridge: generated Capacitor `MainActivity` регистрирует ограниченный JS interface, который потоково пишет файл блоками по 256 KiB через MediaStore в публичную папку `Downloads/Пасека`. Используются `IS_PENDING` до успешного завершения и удаление незавершённого файла при ошибке. Временные и пользовательские записи IndexedDB не затрагиваются.
- Android UI теперь сообщает об успехе только после того, как native bridge закрыл поток и снял `IS_PENDING`. При ошибке показывает конкретное сообщение. В обычном браузере остаётся download-link fallback.
- Добавлены: `js/paseka-android-download.js`, `scripts/prepare-android-archive-download.mjs`, `tests/android-archive-download.test.mjs`; обновлены `index.html`, `sw.js`, Android CI workflows и UI tests.
- Первый Android build выявил ошибку экранирования регулярного выражения в Java; исправлена. Финальный code/test SHA: `661ea9ad602bacdee3ab096a668fcbc56b167ec2`.
- Fast Quality Checks #44388526905: **728/728 tests, 0 failures**.
- Android build #44388526739 на том же SHA: Gradle Debug APK build/upload — success. Артефакт `paseka-debug-apk` ID `14465919073`, SHA-256 ZIP `d29002a7435fd99ccce7c8fb8b23f1006a40ded3e7bbf1977e2b8938700f026d`. Это сборка с production package ID `ru.paseka.journal`; **не устанавливать её на устройство для тестирования**.
- Требуется новая изолированная APK с отдельным package ID для физической проверки сохранения в Downloads. После неё проверить фактическое появление файла и размер, затем открытие архива вне приложения. Восстановление и rollback пока не запускать.
- PR #168 остаётся Draft; main не менялась, merge/deployment не выполнялись.

## Контрольная точка — подготовлена изолированная APK для проверки полного архива на OnePlus (2026-11-18)

- Для физической проверки PR #168 создан отдельный test-only Draft PR #174, ветка `test/full-archive-android-isolated-2026-11-18`, stacked поверх PR #168. Его workflow не меняет production appId: создаёт пакет `ru.paseka.journal.archive.test` только в CI workspace и проверяет application ID в готовом APK через Android `aapt`.
- Isolated archive workflow #44384033966 на SHA `9a688ba9746f781921f605eb6ba34a05607ad0c4`: **726/726 tests, 0 failures**, Android Debug APK build и package ID assertion — success.
- Artifact `paseka-archive-isolated-test-apk`, ID `14466525052`, ZIP SHA-256 `fee50ea2c5be4c1b07d86d524282f55d26c06fbc4946d69d876e8aed23e2eed1`, expires 2026-12-02 19:49:34 UTC. Workflow: https://github.com/250oisr-eng/Pasekaapp/actions/runs/44384033966
- Package ID в APK подтверждён: `ru.paseka.journal.archive.test`; production package `ru.paseka.journal` не используется. Приложение устанавливается отдельно от рабочей и прежней тестовой версий.
- Основной PR #168: последний code/test SHA `b0be11442083c2a3cc639d22b6bfee1b6910282f`; Fast Quality #44383207248 и Android #44383207220 прошли **723/723 tests**, APK build/upload success. Последующие коммиты в PR #168 — документационные и workflow-only.
- Физический тест экспорта, открытия файла вне приложения, восстановления и rollback на тестовых данных ещё не выполнен. Не использовать рабочее приложение или пользовательскую базу. Не сливать PR #168/#174 и не публиковать приложение.

## Обновление — IndexedDB v5 и регрессионные тесты (2026-11-18)

- Исправлено расхождение: приложение открывает IndexedDB версии 5; переход v4→v5 не создаёт stores и не преобразует пользовательские записи, но инициирует `versionchange`, чтобы старые вкладки закрыли подключения перед восстановлением.
- Добавлен тест v4→v5 с проверкой `main/state`, `full_backup/previous`, Blob в `entrance_media`, archive staging/history stores и сохранения legacy-видео без скрытой перезаписи. Обновлены проверки версии UI/видеомодуля и Service Worker cache v315.
- Итоговый code/test SHA: `b0be11442083c2a3cc639d22b6bfee1b6910282f`.
- Fast Quality Checks #44383207248 на этом SHA: **723/723 tests, 0 failures**.
- Android workflow #44383207220 на том же SHA: regression tests и подготовка web/Capacitor/Android прошли; Gradle APK build/upload ещё выполнялись на момент записи.
- Предыдущий промежуточный SHA `be18ddb151ee0ff86cff28296512c899ad95a8a8` имел 4 ожидаемо устаревших тестовых assertions (DB v4 и cache v314); все четыре исправлены. Не считать этот промежуточный прогон итоговым.
- Документация архива обновлена: IndexedDB v4 — добавление staging/history; v5 — versionchange barrier без структурной миграции; app schemaVersion остаётся 15.
- PR #168 остаётся Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась. Физический Android экспорт/импорт ещё не проверен.

## Контрольная точка — защита от старых вкладок при восстановлении архива (2026-11-18)

- В аудите найдено несоответствие: комментарий в `commitStagedArchive` ссылался на закрытие старых вкладок повышением IndexedDB до v9, но приложение фактически открывало БД версии 4. Следовательно, вкладки старого кода могли остаться открытыми; защита от конкурентной legacy-записи видео не соответствовала комментарию.
- Исправление: IndexedDB object-store version повышена с 4 до 5. Новых object stores, индексов, преобразования записей или изменения app `schemaVersion=15` нет. Цель повышения — вызвать стандартное событие `versionchange`, чтобы старые подключения закрылись до восстановления; обработчик приложения дожидается очереди сохранения.
- Добавлен регрессионный тест upgrade v4→v5: проверяет сохранность `main/state`, `full_backup/previous`, оригинального Blob в `entrance_media`, всех staging/history stores и отсутствие принудительной перезаписи legacy-видео.
- Обновлён тест UI на IndexedDB v5 и Service Worker cache v315, чтобы офлайн-клиент получил обновлённый HTML.
- Изменены: `index.html`, `js/paseka-archive-restore.js`, `tests/indexeddb-startup-guard.test.mjs`, `tests/archive-ui-integration.test.mjs`, `sw.js`.
- Новый code/test SHA: `be18ddb151ee0ff86cff28296512c899ad95a8a8`. Fast Quality Checks #44382917507 и Android workflow #44382917325 выполняются; результаты ещё не подтверждены.
- PR #168 остаётся Draft. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменена. До CI и проверки конфликта PR не считать этап завершённым.

## Контрольная точка — PR #168: полный архив и проверка целостности (2026-11-18)

- Main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- PR #168 остаётся Draft на ветке `feat/full-media-backup-restore-main-2026-11-18`. Последний проверенный code/test SHA: `52e587aa1f3e24c3f0de7aa221a8323d4cc7af51`.
- Fast Quality Checks #44333118570 на точном SHA: **722/722 tests, 0 failures**.
- Android PR workflow #44333131328 на том же SHA: **722/722 tests**, Debug APK build/upload success. Artifact ID `14439657825`, размер 3,446,813 bytes; ZIP SHA-256 `31658a873bc27fa4fabf127ba843c0f393b5e208ad321f2bb0f7595bbc2ed55b`.
- Защита данных: новые видео сохраняются с SHA-256; rollback восстанавливает legacy-видео с заново проверенной суммой; импорт проверяет revision, staged content, видео и выполняет замену атомарно.
- Защита экспорта: предыдущий Blob архива сбрасывается при каждом новом экспорте; Blob удерживается только если браузер поддерживает отправку файла; сообщения о fallback выводятся в статус экспорта.
- PR #169 остаётся Draft и зависит от #168; его ветка основана на более старом HEAD #168 и требует синхронизации после завершения текущего этапа.
- Не выполнены физическое скачивание/открытие/восстановление .paseka на Android. CI APK не заменяет проверку Android WebView/SAF.
- Merge, publish, production deployment и операции с пользовательскими данными не выполнялись.

---

## Уточнение статуса проверок — code/test SHA и документационный HEAD (2026-11-18)

- Последний SHA, на котором изменялись код и тесты PR #168: `3436c621c5de175259a0cf112feeaba84984bd5d`. На нём Fast Quality Checks #44331728300 и Android PR workflow #44331737784 прошли: 721/721 tests; Debug APK build/upload success, artifact 14439701927.
- После этих проверок добавлен отдельный documentation-only checkpoint. Не смешивать code/test SHA с текущим PR HEAD; актуальный PR HEAD всегда сверять через GitHub перед продолжением.
- После code/test SHA `3436c621c5de175259a0cf112feeaba84984bd5d` добавлены только документационные коммиты. Android workflow #44332204313 запускался на промежуточном documentation-only HEAD; он не меняет результат code/test проверок на `3436c621c5de175259a0cf112feeaba84984bd5d`.
- PR #168 остаётся Draft. Merge, publish и production deployment не выполнялись.

---

## Контрольная точка — PR #168: контроль целостности видео и CI (2026-11-18)

- GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- PR #168 открыт, Draft, mergeable=true. Последний проверенный code/test SHA: `3436c621c5de175259a0cf112feeaba84984bd5d`; последующие изменения после него — только документация. Main не менялась.
- Fast Quality Checks #44331728300 на точном HEAD: **721/721 tests, 0 failures**.
- Android PR workflow #44331737784 на том же HEAD: **721/721 tests**, Debug APK build и upload успешны. Artifact `paseka-debug-apk`, ID `14439701927`, размер 3,446,730 bytes; SHA-256 ZIP-артефакта `d44c47515bc61599b5fdc3f93e6ac13287031a9da0e1a4acd4f662470d39b3fd`.
- Дополнительная защита: новые видео сохраняются с вычисленным SHA-256; при rollback для восстановленного legacy-видео записывается только что проверенная контрольная сумма. Добавлены тесты для same-size replacement и восстановления legacy media.
- PR #169 остаётся Draft и зависит от #168. Его HEAD `308b2f02ba218eef0f10197a7c5c97d2bd592c17` основан на прежнем #168 HEAD `cee7f51ce55490507ed6dea51939139b974d46c8`; сравнение с текущим #168 HEAD показывает diverged: 12 ahead / 6 behind. После завершения #168 требуется безопасно перенести навигационные изменения на актуальную базу, не теряя их.
- Не проверялись физическое скачивание/открытие .paseka и восстановление на реальном Android-устройстве. PR остаётся Draft; merge, publish и production deployment не выполнялись.
- Следующий этап: независимый code review PR #168; затем физический Android smoke test на тестовых данных; после этого синхронизировать зависимый PR #169.

---

## Контрольная точка — PR #168: полный архив медиа и атомарное восстановление (2026-11-18)

- Актуальный GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. PR #154 действительно merged; merge commit совпадает с этим SHA. PR #154 code/test HEAD `2b66cd59e4acf05adb44b40b0991ecff56154d56`: 611/611 tests, Android Debug APK success; это проверки PR HEAD, а не отдельные workflow на merge SHA.
- Новый Draft PR #168 основан непосредственно на main, без отставания на момент создания. Текущий branch: `feat/full-media-backup-restore-main-2026-11-18`. Старая цепочка PR #9–#40 целиком не сливалась.
- Перенесены отдельные архивные модули codec, SHA-256, staging и atomic restore/rollback из проверяемой старой ветки #40; код интегрирован поверх актуального main. Старый CI #40 на SHA `52f43ed29d7037401c04526938f5230b5f7f675c` не заменяет проверку новой базы.
- Добавлен переносимый `.paseka`: единый readonly snapshot `main` + `entrance_media`; state JSON и отдельные оригиналы видео; SHA-256 по блокам 1 MiB; ограничение путей/размеров/метаданных; импорт сначала в persistent staging; атомарная замена только после явного подтверждения; rollback прежнего state и видео с revision guard.
- IndexedDB object-store version 3→4: добавляются только `archive_staging` и `archive_history` с индексами. Существующие `main`, `full_backup`, `entrance_media` сохраняются; app schemaVersion не меняется; преобразования пользовательских записей при upgrade нет.
- JSON/automatic backup по-прежнему не содержат отдельные оригиналы видео. Подписи интерфейса уточнены, чтобы не называть JSON полной мультимедийной копией. Полный архив остаётся локальным: внешние сервисы, загрузка на сервер и платные зависимости не добавлены.
- Добавлены тесты формата, экспорта, SHA-256, staging, cleanup, atomicity, UI/offline и upgrade v3→v4 с сохранением существующих данных. Fast Quality Checks #44322389285 на SHA `6851bbc397674d2fdbe3a3819ab04cc0c7217a0b`: 715/715 tests, 0 failures. Android PR workflow #44325832906 на точном текущем HEAD `4386d3b38a1c31303e5f9b19ad3ce7cf51f1bb20`: 715/715 tests, 0 failures; Android Debug APK build/upload success; artifact `paseka-debug-apk`, ID `14436487643`, 3,446,523 bytes. Fast Quality Checks #44322389285 на code/test SHA `6851bbc397674d2fdbe3a3819ab04cc0c7217a0b`: 715/715, 0 failures. На промежуточном Android run #44322813466 также были успешны 715/715 и сборка APK. Старый CI PR #40 не использовался как доказательство совместимости с main.
- Lovable `Apiary Family Atlas`: опубликован, последний commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef`, агент `needs_attention / out_of_credits`; синхронизация с GitHub main не подтверждена.
- Не выполнялись merge, публикация, production deployment, изменение production DB или операции с пользовательскими данными. Физическое Android-тестирование сохранения/открытия .paseka вне приложения остаётся отдельным release gate.

### Следующий шаг
Следующий шаг: независимый code review всего PR #168 и подготовка физической проверки Android: скачать .paseka, сохранить вне приложения, выбрать этот файл и выполнить тестовое восстановление на отдельном/пустом тестовом профиле без пользовательских данных. Текущий HEAD a5dfbda620feed2b9188bf82ddc3a62cb8ab21d9, main 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7; PR #168 Draft, 12 commits ahead / 0 behind, mergeable=true. Android и quality workflows прошли на точном code/test HEAD. Lovable latest commit 2196e3fd478fbb58810d6a78317c0ddd056dfdef не совпадает с веткой PR; синхронизация не подтверждена. Не объединять без отдельного разрешения.
 
---

## Контрольная точка — OP-07 и резервная безопасность (2026-11-17)

- PR #154: code/test HEAD `2b66cd59e4acf05adb44b40b0991ecff56154d56`; Fast Quality Checks #44169456462 — **611/611 tests, 0 failures**; Android Debug APK PR run #44169468103 — success; push run #44169456444 — success.
- Добавлены два migration regression tests: schema 14→15 сохраняет существующий `sectionalTechProcesses`; неправильный тип блокирует миграцию без изменения исходного состояния. Сам migration guard уже присутствовал; его логика не менялась.
- Пользовательское правило OP-07: установка решёток/медовых корпусов либо одновременно со вторым рядом, либо через 12–15 дней после него. Код принимает 0/12/15 и отклоняет 11/16; `AFTER_OP06` остаётся отдельным source-backed сценарием.
- **Новый production blocker:** в текущем main ручной `downloadBackup()` экспортирует только `{app:'Paseka', state:S}`, а `writeAutoBackup()` сохраняет только `S`. Оригиналы видео находятся отдельно в IndexedDB store `entrance_media` и в эти копии не входят. В main нет интегрированного контейнера `.paseka` и staging-импорта; JSON-копия не является полным архивом мультимедиа.
- Полный архивный стек PR #9–#40 остаётся незлитым. PR #14 — корневой Draft, его ветка diverged: 96 commits ahead / 109 behind main; PR #40 содержит позднюю финализацию staging и проверку rollback ownership. Нужны отдельный аудит, перенос/rebase на актуальный main и повторный CI. Не сливать старую ветку как есть.
- В репозитории **93 открытых PR, все Draft**; 19 PR имеют base=main. Только #148 из корневых веток находится на актуальной базе (83 ahead / 0 behind); остальные 18 корневых веток diverged и отстают от main на 105–109 commits. Не закрывать и не объединять автоматически.
- Активная технологическая цепочка: #148 → #149 → #87 → #150 → #151 → #152 → #153 → #154; все остаются Draft, профиль секционного улья не активирован. Main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Следующий приоритет — восстановить полное резервное копирование и безопасное восстановление видео; журнал обработок Varroa отложен до закрытия этого пробела. Слияние PR, production и публикация требуют отдельного разрешения.

---

## Контрольная точка — OP-07: подтверждён срок 12–15 дней (2026-11-17)

- Пользователь подтвердил два допустимых варианта установки двух больших разделительных решёток и медовых корпусов: **сразу вместе со вторым рядом** (0 календарных дней) либо **через 12–15 календарных дней после второго ряда**. Диапазон — отдельное пользовательское уточнение; не приписывать его DOCX.
- `AFTER_OP06` сохраняется как отдельная последовательность по источнику P20–P23; она не подменяется двумя вариантами срока относительно второго ряда.
- В рабочей ветке `fix/op07-12-15-day-window-2026-11-17` обновлены OP-07 coordinator и регрессионный тест: completion guard и inspector сверяют фактическую разницу календарных дней с сохранённым evidence; разрешены только 0 дней для немедленного варианта и 12–15 дней включительно для отложенного. Интервалы 11 и 16 дней отклоняются с rollback.
- PR #154 открыт как Draft поверх PR #153: base SHA `ef8fe87fd3336cff82aa31b7c99064d930d016c8`, проверенный code/test HEAD `6dd961b2df6fd859da558806a4e1edcdbbd6587c`; после проверенного code/test HEAD добавлялись только документационные уточнения; код и тесты не менялись; mergeable=true. Workflow #44166954651 на точном HEAD `6dd961b2df6fd859da558806a4e1edcdbbd6587c` завершился success: regression tests, Android Debug APK build и upload успешны. Artifact #14365802511, SHA-256 `2649c600f9d1a4d2051c3a29364ce05879d3ff4d8f4eb5e3a13561e6310b9f60`.
- Основная цепочка #148 → #149 → #87 → #150 → #151 → #152 → #153 → #154 остаётся Draft/unmerged; профиль секционного улья не активирован. Main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- IndexedDB, миграции, backup, production и пользовательские данные не изменялись.

---

## Контрольная точка — интеграционный аудит PR #148–#153 (2026-11-17)

- Проверены актуальные refs GitHub: `main` = `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #152 HEAD = `a82d4137a6f1edab5066cc50f123642d6ea8ecfa`; PR #153 HEAD = `4beec099169eef39d4d36560905fca4ac0583c91`.
- PR #148, #149, #87, #150, #151, #152 и #153 открыты, Draft, не объединены; GitHub показывает mergeable=true для всех проверенных PR. Профиль секционного улья не активирован.
- Итоговый diff #152 относительно main содержит 28 файлов: 13 документационных/проектных и 15 файлов приложения/тестов. Цепочка зависимостей и merge-base подтверждены; PR #152 опережает main без отставания.
- PR #152 code/test SHA `94dd47ea6b904b9336f1adb4aa962233a163e4d6`: 609/609 tests, 0 failed (run #44160434256); Android Debug APK build/upload успешны (runs #44160451891 и #44160435353). После этого в #152 добавлены только 15 документационных коммитов до HEAD `a82d...`; сравнение подтверждает, что code/test SHA не изменился.
- PR #153 синхронизирован с текущим base #152. Сравнение refs `feat/full-installed-corpus-frame-capacity-2026-11-17` → `docs/varroa-treatment-sublimation-2026-11-17`: 0 commits behind, изменены ровно 9 документов, код и тесты отсутствуют. Текущий HEAD #153: `4beec099169eef39d4d36560905fca4ac0583c91`; GitHub mergeable=true.
- Открытый технологический вопрос: P41–P42 говорят «примерно около 12 дней» после установки второго ряда, но не задают допустимое отклонение. Текущая positive-only проверка не является строгой проверкой диапазона. Требуется пользовательское решение; до него не вводить числовой допуск.
- P42 отдельно разрешает выполнить установку решёток и медовых корпусов сразу вместе со вторыми корпусами. Это альтернативный вариант, не обязательная задержка.
- Остальные ограничения: позднее добавление второй пары медовых корпусов по P37 не реализовано; двухматочная ветвь OP-06 остаётся fail-closed; порамочная история осмотров/содержимого — отдельная задача.
- Varroa: пользователь подтвердил сублиматор щавелевой кислоты; параметры дозы, подготовки, интервалов, температуры и безопасности неизвестны. PR #153 документирует только подтверждённый метод и отделяет лечение от мониторинга.
- Lovable: агент `needs_attention / out_of_credits`; последний Lovable commit не найден в GitHub Pasekaapp, синхронизация не подтверждена.
- Изменения не затрагивают production, пользовательские данные и production deployment. Все PR остаются Draft.

---

## Подтверждённое уточнение пользователя — обработка Varroa (2026-11-17)

- Способ обработки от клеща: сублиматор щавелевой кислоты. Это прямое подтверждение пользователя, а не требование из DOCX.
- Текущий `js/varroa-monitor.js` фиксирует наблюдения (пробы взрослых пчёл и контрольный поддон), но не фактически выполненные обработки.
- Будущий журнал обработок должен быть отдельным от мониторинга и создавать запись только после явного подтверждения реально выполненной операции.
- Доза/масса кислоты, подготовка/концентрация, число и интервалы обработок, температура/погодные ограничения, ограничения по расплоду/маткам и меры безопасности не подтверждены. Не автозаполнять и не рекомендовать их по догадке.

---

# Актуальное состояние проекта — 2026-11-17

## Контрольная точка — 2026-11-17: аудит истории операций и времени завершения

- Актуальный GitHub main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0` (проверен через branch endpoint; не использовать устаревший документальный SHA PR #146).
- Основная цепочка #148 → #149 → #87 → #150 → #151 → #152 остаётся Draft и не объединена; PR #153 — отдельный docs-only Draft поверх #152. Профиль секционного улья не активирован.
- Актуальный code/test SHA PR #152: `94dd47ea6b904b9336f1adb4aa962233a163e4d6`. Fast quality checks #44160434256 — **609/609 tests passed, 0 failed**. Android Debug APK push run #44160451891 и PR run #44160435353 — **success**. Artifact #14362223647, 3 409 708 bytes, SHA-256 `3d4b5dcc88a01f2eac80d23a40aa5863f89158ee5f224419ed43dd0d57916965`, срок хранения до 2026-12-01.
- Интеграционный дефект OP-05 исправлен: все три app-level вызова `PasekaSectionalOperationCoordinator.inspect()` передают `PasekaFamilyLineage` и `PasekaSectionalPhysicalLayout`; добавлен тест на все call-sites.
- Исправлена проверка истории OP-05 после OP-06: инспектор теперь проверяет события установки по историческому списку всех восьми снятых/установленных заглушек, а не только по тем, которые остаются в раскладке. Добавлен тест, удаляющий исходное событие установки после OP-06 и проверяющий обнаружение повреждения.
- Все пять критических completion API OP-04, второго ряда OP-04, OP-05, OP-06 и OP-07 теперь отклоняют будущую дату завершения. Добавлен единый тест на все пять путей; тестовый clock внедрён через зависимость, production использует системное время.
- Открытый технологический вопрос: P41–P42 описывают «примерно 12 дней» для альтернативного срока OP-07, но не задают допустимый диапазон. Код пока принимает любой положительный интервал; это не строгая проверка соответствия источнику. Нужен ответ пользователя.
- Остальные границы: последующее добавление второй пары медовых корпусов по P37 не реализовано; двухматочная ветвь OP-06 остаётся fail-closed; порамочная история осмотров/содержимого — отдельная задача.
- Varroa: пользователь подтвердил сублиматор щавелевой кислоты; параметры дозы, числа/интервал обработок, температуры и безопасности не заданы. PR #153 документирует только подтверждённый метод и отделяет лечение от мониторинга.
- Lovable: агент `needs_attention / out_of_credits`; последний Lovable commit не найден в GitHub Pasekaapp, синхронизация не подтверждена.
- Эти изменения не затрагивают IndexedDB schema, миграции, backup format, пользовательские данные или production. Merge, production deployment и публикация не выполнялись.

## Следующий приоритет

Завершить независимую проверку diff всей цепочки и подтвердить, что PR #153 остаётся документационным: без изменений кода и тестов относительно актуального #152. До признания технологической цепочки готовой к интеграции запросить у пользователя допустимый диапазон дней для формулировки «примерно 12 дней» P41–P42.

# Предыдущая контрольная точка — до реализации PR #152 (2026-11-17)

- Подтверждённый SHA основной ветки `main`: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Main не изменялась.
- Основная открытая технологическая цепочка остаётся Draft и не объединена: PR #148 (`27cb4de3f8bf8848475aa9877bb84affb7a51a83`) → #149 (`f8053b9a91e873ecfd61c07f5f8657ca53b42a02`) → #87 (`92bcb926a6aff9ed2a05c555ab9841fe31adddc2`) → #150 (`70583dc435674de5984640b727cc3f6064c2ca17`) → #151.
- PR #151 Draft, head `31299ab5fe556d08c6604f27a70d666839dcc7c7`; последний code/test head до документационных уточнений — `481fdd956fa040e1f5038fe975fbf461a23eea89`. Workflow #44148886358: **599/599 regression tests passed**, Android Debug APK build и artifact upload — success. Проверка относится к указанному code/test head; после него в ветку добавлялись только документационные изменения, повторный CI на docs-only head не запускался.
- Предыдущий workflow #44147147221 на более раннем SHA был отменён во время Android build; успешный run #44148886358 является более поздней проверкой PR #151.
- Пользователь закрыл вопрос о «пустых корпусах»: P57 — временный корпус без рамок для стряхивания пчёл, который не учитывается приложением; P77 — незаселённый корпус с рамками, который учитывается как обычный установленный корпус. Каждый установленный и учитываемый корпус должен иметь ровно полную вместимость рамок.
- В PR #150 пока остаётся разрешение неполной медовой рамки/корпуса и тест, допускающий 9/10 рамок. Это теперь противоречит решению пользователя. PR #152 должен исправить OP-07 и общий валидатор комплектности до интеграции этой цепочки.
- Профиль секционного улья не активирован. Production, пользовательские данные, IndexedDB и production deployment не менялись.

## Следующий приоритет

Создать PR #152 поверх PR #151: единая проверка полного количества рамок для всех учитываемых установленных гнездовых и медовых корпусов; убрать разрешение 9/10 рамок из OP-07; сохранить вне учёта временный корпус P57; добавить регрессионные тесты и отдельную историю наблюдений содержимого каждой рамки (не смешивать с типом сота). До прохождения интеграционных проверок не объединять цепочку и не активировать профиль.

## Контрольная точка — 2026-11-17: исправление привязки гнездовых рамок секционного улья

- В ходе аудита PR #151 выявлено: реестр рамок распознавал установленные корпуса только через `honeyStack.bodyIds`, но не через `sections[].broodBodyIds`. Из-за этого рамки гнездовых корпусов секционного улья могли отображаться как складские.
- Исправлен поиск физического расположения: рамки из `sections[].broodBodyIds` теперь относятся к соответствующему улью и секции; добавлен регрессионный тест.
- Изменения кода: `fd14c306890bf6976eb849e3df9b668ad3994365`; тест: `62b8e6f7d3e07a0c96816bb23e2af4c8e6194c38`.
- Android workflow #44147147221 на тестовом HEAD `62b8e6f7d3e07a0c96816bb23e2af4c8e6194c38` выполняется. До завершения не считать новую правку проверенной. Ранее 598/598 и APK success относятся к предыдущему code/test SHA `9677657799af28f5caaa6ee242c3f7186e694003`.
- `main`, пользовательская база, production и активность профиля не изменялись.

---

## Контрольная точка — 2026-11-17: идентификация и история оборудования

- PR #151 Draft. Код/тесты SHA: `9677657799af28f5caaa6ee242c3f7186e694003`; полный регрессионный набор: **598/598 passed**, 0 failed (run #44144631787). Android Debug APK build/upload успешны (run #44144644403).
- Документационный HEAD PR #151: `aef79c41c87a14a0cbe8b51616bf9942398186fd`; Android build check #44145100531 и Cloudflare preview check завершились успешно. Preview не является production deployment.
- Реализованы постоянные коды и UID всех фактических рамок, миграция ID старых событий, проверка дубликатов, единый обработчик истории перемещений и append-only журналы рамок/корпусов без обрезания 300/1000 событий.
- Пользователь подтвердил: каждый корпус и каждая рамка имеют постоянную идентификацию; любое перемещение сохраняется в истории.
- Полная вместимость корпусов и порамочный учёт содержимого пока не реализованы; следующий этап остаётся заблокирован до уточнения технологического исключения ниже.
- В DOCX P57 и P77 описаны намеренно пустые корпуса в технологических операциях. Нужно подтвердить, распространяется ли правило полной вместимости на эти корпуса. Складские корпуса, не установленные в улей, не следует автоматически считать установленными.
- PR #148 → #149 → #87 → #150 → #151 остаются открытыми Draft и не объединены. Main не менялась; production не изменялся.

---

## Контрольная точка — 2026-11-17: постоянная идентификация рамок и корпусов

- Пользователь подтвердил: каждый физический корпус и каждая рамка должны иметь постоянную уникальную идентификацию; все перемещения фиксируются с исходным и конечным местом. ID не меняется при переносе.
- Ранее коды корпусов/рамок уже существовали, но UID назначался только маркированным рамкам, а журналы обрезались после 300 событий корпуса и 1000 общих событий.
- PR #151 (Draft, base PR #150) расширяет миграцию на все фактические рамки, назначает короткий код и UID, сохраняет прежние коды, добавляет ID старым событиям без выдумывания времени, проверяет дубликаты и повреждённые записи.
- Новые события рамок содержат ID и timestamp; все основные пути перемещения используют общий обработчик. Журналы рамок и корпусов больше не обрезаются. Проверка состояния/сохранения отклоняет отсутствие идентификации и повреждённые журналы.
- CI на актуальном HEAD PR #151 ещё не подтверждён; не заявлять успешную проверку до завершения.
- Полная вместимость каждого установленного корпуса пока не реализована в этой ветке. Следующий этап должен запретить установку неполного корпуса и заменить прежний тест OP-07, допускавший 9/10 рамок.
- Следующий этап модели: по каждой рамке отдельно хранить тип сота (сушь/вощина) и историю осмотров/содержимого (расплод, яйца/личинки, перга, нектар, мёд и т. п.). Содержимое не угадывать; неизвестное обозначать как не осмотренное.
- Требование идентификации/истории/полной вместимости — пользовательские решения, а не цитаты DOCX. PR #148 → #149 → #87 → #150 → #151 открыты, Draft PR #151; main не менялась. Профиль секционного улья не активировать.

---

## Контрольная точка — 2026-11-17: правило рамок раннего медосбора подтверждено

- PR #150 остаётся Draft, base PR #87; code/test SHA: `482e086f8b2ca81abc343e94989dcc2e0baba617`. Цепочка PR: #148 → #149 → #87 → #150. Main SHA: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Android workflow #44134181352 на точном docs HEAD `a314ba2da92274fe91310077980cde1552d31a8f` завершился успешно: **589/589 tests passed**, 0 failed; Android Debug APK build/upload успешны. Artifact #14351931133, 3,406,838 bytes, SHA-256 `fd5edbc7097a39f898d1d07485a11e5cc8c4340210937b5e2f58e07aca0c8b8f`.
- Пользовательское уточнение P80: в каждом медовом корпусе допускается не более двух рамок с вощиной; каждая такая рамка должна быть строго между рамками суши, соседние рамки с вощиной запрещены. Ограничение считается отдельно для каждого корпуса, не для пары.
- OP-07 валидирует упорядоченные `body.frames[]`: каждый установленный медовый корпус содержит ровно 10 рамок; в раннем медовом корпусе должна присутствовать сушь. `combType` обязателен (`drawn_comb` или `wax_foundation`); не более двух `wax_foundation` на корпус; у каждой такой рамки непосредственные соседи с обеих сторон должны быть `drawn_comb`. Неполный/переполненный корпус отклоняется до commit с полным rollback. История рамок сохраняется в записи корпуса и связывается с фактическим местом установки.
- Регрессионные тесты проверяют точную комплектность (в том числе отказ для 9/10), превышение лимита, соседние и крайние рамки вощины, неизвестный тип и разрешённые две рамки вощины на каждом корпусе.
- Остаются два неразрешённых вопроса OP-07: допустимый диапазон для «примерно 12 дней» P42 и отдельная операция поздней установки второй пары корпусов по P37. OP-06 остаётся fail-closed для двухматочного сценария.
- После документационных изменений требуется проверка CI на их новом HEAD SHA. UI, профиль активации, IndexedDB schema, Service Worker/cache, пользовательские и production-данные не изменялись. Слияний и публикаций не выполнялось.
- Merge PR, публикация PWA и production deployment требуют отдельного явного подтверждения пользователя.

---
---
---
---
---
---
## Контрольная точка — 2026-11-17: OP-06 проверен на полном CI

- Code/test SHA PR #87: ec3da5ee26d159bd2d7e71feac02c5a0b8f61d94.
- Android workflow run #44122663248 на точном SHA завершился success: 577/577 tests passed, Android Debug APK build и upload успешны. Artifact #14345074070, 3,402,199 bytes, SHA-256 a2b33cb34030537ba82b7229afaec0a918c80851effc4694ac03113e95c5caed, expires 2026-12-01.
- В процессе проверки исправлены ошибки TDZ в проверке исторической установки OP-05, тестового ID generator и несоответствие реального event type moved_to_storage при снятии заглушек. Финальный CI на SHA ec3da5e — зелёный.
- OP-06: append-only laying_observed для каждой матки; три идентифицированные действующие матки; 20–21 день от OP-04.startedAt; снятие всех 8 реальных заглушек либо явное подтверждение, что optional OP-05 не выполнялась; partial/reduced two-queen branch блокируются.
- PR #87 Draft, base PR #149 (base SHA f8053b9a91e873ecfd61c07f5f8657ca53b42a02); PR #149 Draft stacked на PR #148. Mergeable PR #87 = true. Main SHA d8fd021a3a6ab4ed9613dbd558205bdf24e96be0 не менялась.
- UI/профиль, IndexedDB/schemaVersion/backup, пользовательские данные и production не менялись.
- Следующий этап: отдельный аудит OP-07 и реальных предусловий установки двух больших разделительных решёток и медовых корпусов. Не объединять PR автоматически: сначала проверить всю цепочку #148→#149→#87 и открытые конкурирующие ветки.

---

## Контрольная точка — 2026-11-17: OP-06 реализован в отдельном stacked PR; CI ожидается

- Исходный DOCX повторно открыт: P20 описывает снятие временных сетчатых заглушек через 20–21 день от первоначального разделения, когда все матки вернулись с облёта и начали откладывать яйца. P21 допускает дополнительное открытие летков/вкладышей, но не делает его частью обязательного OP-06. P22–P23 относятся к следующему этапу.
- Прежняя ветка PR #87 была основана на устаревшей цепочке #84. Её рабочая ветка переведена на актуальную основу PR #149; PR #87 теперь stacked поверх #149 и остаётся Draft.
- В js/family-lineage.js добавлено append-only queenEvents.laying_observed для текущей идентифицированной матки, семьи, split event OP-04, techProcessId и времени наблюдения; требуется явное подтверждение пчеловода.
- В js/sectional-operation-coordinator.js добавлен completeOP06(): 20–21 календарный день от OP-04.startedAt; обязательны три текущие идентифицированные матки и наблюдение яйцекладки каждой. При наличии OP-05 снимаются все 8 реальных заглушек через equipment registry. Если OP-05 пропущена, требуется явное подтверждение отсутствия заглушек. Частичное покрытие и двухматочная ветвь блокируются.
- OP-05 остаётся в истории после снятия: валидатор проверяет историческое покрытие и события установки/снятия. Остальные элементы раскладки не меняются; перемещения, физическое состояние, технологическая запись и auditLog коммитятся атомарно.
- Добавлены тесты append-only наблюдений, снятия 8 заглушек, пропуска OP-05, отсутствующего наблюдения, неправильного срока и rollback. Первый CI run #44121261362 на промежуточном SHA d80a0b1 завершился 568/577 passed, 9 failed; ошибки TDZ и тестового ID-generator исправлены. Повторный CI на актуальном HEAD пока не подтверждён; Android build в первом run не запускался из-за провала тестового шага.
- Main SHA d8fd021a3a6ab4ed9613dbd558205bdf24e96be0 не менялась; PR #148/#149/#87 остаются Draft. UI/профиль, IndexedDB/schemaVersion/backup, пользовательские данные и production не менялись.
- Следующий шаг: получить полный Android workflow на актуальном HEAD PR #87, исправить оставшиеся ошибки, затем проверить stacked PR diff/base/head SHA. Не объединять до проверки всей цепочки.

---

## Контрольная точка — 2026-11-17: OP-05 и двухрядная геометрия реализованы; CI проверен

- По DOCX P17–P18 металлические сетчатые заглушки рекомендуется установить на 8–11-й день после разделения; P18 прямо допускает не выполнять эту операцию. Поэтому OP-05 — необязательная рекомендуемая операция: её отсутствие не блокирует состояние после OP-04. Число заглушек определяется фактическими отверстиями. OP-06 остаётся отдельной операцией.
- В Draft PR [#149](https://github.com/250oisr-eng/Pasekaapp/pull/149) добавлен `completeOP05()`: требует завершённого OP-04, неизменной физической раскладки, явного подтверждения, пригодных реальных заглушек на складе и полного покрытия всех фактических `openingId`. Отдельно требуется явное подтверждение ровной подставки (DOCX P17); подтверждение сохраняется в evidence и auditLog. Проверяются окно 8–11 календарных дней от начала разделения и порядок относительно завершения OP-04.
- Планировщик перемещений учитывает `temporaryQueenIsolation`. В одной транзакции фиксируются раскладка, перемещения предметов и их события, запись OP-05 и auditLog. Ошибка на любом шаге оставляет исходное состояние неизменным.
- `inspect()` проверяет статус OP-05, соответствие доказательств реальным заглушкам/отверстиям, полноту покрытия, подтверждение ровной подставки, ID событий перемещения в индивидуальном и общем журналах и временную последовательность. Добавлено 14 регрессионных тестов: 12 для coordinator OP-05 и 2 для полноты двухрядной физической раскладки.
- После детальной сверки P10–P11 физическая модель исправлена: каждый ряд имеет схему 1+2+1; первый ряд — 4 отверстия, двухрядная конфигурация — 8. Валидатор требует по одному отверстию на корпус крайних секций и по два на корпус средней секции, все отверстия связаны с реальными техническими решётками; при установке второго ряда первые 4 решётки остаются на месте, ещё 4 ставятся из склада.
- Code/test SHA PR #149: `e5f4c78ecedd3da50be70a7e66962bc54c6dbb28`; последний проверенный docs HEAD: `1a2b796a692a0880b1d3547d65d19928238bf643`. Android workflow run [#44107389196](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44107389196) на точном HEAD завершился **success**: 572/572 tests, Android Debug APK build и upload — success. Artifact #14338499255, 3,399,950 bytes, SHA-256 `29efb2909cf3d1d13a36c4da3c54ff025ca455c035ab3928881cf5f7754fcb3f`, expires 2026-12-01. Combined status не вернул отдельных status contexts; подтверждён именно workflow run. Этот status-коммит сдвинет branch HEAD; при следующем сеансе получать актуальный SHA из GitHub branch ref.
- PR #149 остаётся Draft и основан на PR #148 (base SHA `27cb4de3f8bf8848475aa9877bb84affb7a51a83`). PR #148 остаётся Draft. Main SHA `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0` не менялась.
- IndexedDB, schemaVersion, backup format, пользовательские данные, production и UI не менялись; профиль не активирован.

### Проверка отдельного проекта Lovable — read-only, 2026-11-17

- В workspace Lovable обнаружен отдельный проект **Apiary Family Atlas**. Он связан с репозиторием `250oisr-eng/apiary-family-atlas`, а не с текущим `250oisr-eng/Pasekaapp`; его latest commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef` существует в первом репозитории и отсутствует во втором.
- Lovable сообщает: workspace Free, проект `needs_attention / out_of_credits`, агент завершил работу; `is_published=true`, audience `public`, последняя правка 2026-11-17 08:52 UTC. Project knowledge пустой.
- Это отдельная кодовая база с другим стеком и собственной историей PR. Не синхронизировать её с `Pasekaapp` и не изменять без отдельного решения о выборе единственного источника истины.
- Никакие изменения, публикация, деплой или расходование кредитов Lovable в ходе этой проверки не выполнялись. Текущая разработка продолжается в `Pasekaapp` согласно паспорту проекта.
- PR #149 остаётся Draft, основан на PR #148; mergeable=true, behind_by=0. PR #148 Android workflow run #44097595158 завершился success. Main `d8fd021a...` не менялась. Следующий этап — отдельная реализация OP-06: append-only подтверждение яйцекладки каждой из трёх маток, проверка 20–21 дня от `OP-04.startedAt`, атомарное снятие 8 заглушек или подтверждение их отсутствия при пропуске OP-05. Двухматочная ветвь остаётся fail-closed; P20 и действия P21 не смешивать с OP-06.
---

## Контрольная точка — 2026-11-17: атомарный OP-04 теперь поддерживает оба ряда

- Подтверждённая геометрия первого ряда: три корпуса в один ряд, каждый на отдельном днище; в каждом из трёх стеков по одному днищу, подкрышнику и крыше. DOCX P10 упоминает два днища; прямое уточнение пользователя о трёх имеет приоритет и отдельно отражено как расхождение.
- `completeOP04()` поддерживает начало разделения с `broodRows: 1`: запись OP-04 остаётся `IN_PROGRESS`, событие аудита фиксирует начало.
- Добавлен `completeOP04SecondRow()`: явное подтверждение, три новых корпуса со склада, согласованные технические отверстия/принадлежности, временная последовательность, журнал перемещений и один атомарный commit. После проверки OP-04 становится `DONE`; при ошибке исходное состояние не меняется.
- `inspect()` проверяет согласованность `broodRows`, `rowStage` и статуса операции; старые записи без новых полей сохраняют двухрядную трактовку.
- Code/test SHA `0d81b2f6f9452932f67b99bda98bca02f7d4f602`: Fast quality checks run [#44097238313](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44097238313) — **558/558 tests passed**; Android Debug APK run [#44097235721](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44097235721) — **success**, regression tests, APK build и upload завершены.
- Документация модели, ТЗ, сверки источника, плана, состояния, журнала, передачи и карты PR обновлена. Перед статусным коммитом branch HEAD был `614b29f1dc5082abd866aea10b441840c9df08d7`; после записи получать актуальный SHA из GitHub branch ref.
- `main` остаётся `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #148 остаётся Draft и не объединён. UI и профиль не активированы.
- Следующий этап: аудит и атомарная реализация OP-05; не переходить к OP-06/UI до подтверждения предусловий и тестов rollback.

---

## Контрольная точка — 2026-11-17: пользователь подтвердил первоначальную раскладку OP-04; валидатор поддерживает один ряд

- Подтверждено пользователем: три гнездовых корпуса стоят в один ряд, каждый на отдельном днище; уже на этой стадии используются три подкрышника и три крыши. Во всех рабочих состояниях остаётся комплект 3+3 для подкрышников/крыш.
- DOCX P10 говорит о двух днищах. Это расхождение с прямым подтверждением пользователя сохранено в `docs/СВЕРКА-ТЕХПРОЦЕССА-С-ИСТОЧНИКОМ.md`; модель использует три днища. DOCX P11 разрешает установить второй ряд сразу или через несколько дней.
- Изменён `js/sectional-physical-layout.js`: `broodRows: 1|2` для SIDE_BY_SIDE; старые записи без поля остаются двухрядными. Изменены `tests/sectional-physical-layout.test.mjs` и `tests/sectional-operation-coordinator.test.mjs`: тест первого ряда и запрет считать его завершённым OP-04.
- Code/test SHA `2a70452abf256f0571206894c19e13e04553ffba`: Fast quality checks run [#44096138371](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44096138371) — **556/556 tests passed**; Android Debug APK PR run [#44096148887](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44096148887) — **success**, включая regression tests и сборку APK. Отдельный Android push run #44096138401 на момент проверки ещё выполнялся.
- Документы модели, ТЗ, сверки источника, плана, состояния, журнала, передачи и карты PR обновлены. Рабочая ветка PR #148; до статусного обновления её последний известный HEAD `788fe306ac3fe05a2333e6d08c0bdd4b234785a0`. После обновления получать HEAD непосредственно из GitHub branch ref. `main` остаётся `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Открыто: атомарный переход `broodRows: 1` → `broodRows: 2`; профиль/UI не активировать до его реализации и проверки. PR #148 остаётся Draft, не объединён.

---

## Восстановление после обрыва — 2026-11-17: проверен PR #148 и исходный DOCX

- Последняя операция до восстановления: документационный коммит `3507e1738c33dfdc4789827c8d9c62f0450d6fe3`. Журнал восстановлен коммитом `afc5cec22fc608c83e94e3aa0f6cb4f61832a6e9`, затем уточнён коммитом `550cda98e7e74bfe37150f011e9929b0a934bc35`. Текущий HEAD всегда получать из GitHub branch ref при начале сеанса: сам этот файл фиксируется отдельным коммитом и поэтому не должен быть источником собственного SHA.
- Репозиторий `250oisr-eng/Pasekaapp`; default branch `main`. Фактический main HEAD: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Он совпадает с base PR #148. Main после этой контрольной точки не менялся.
- PR [#148](https://github.com/250oisr-eng/Pasekaapp/pull/148) открыт, Draft, не объединён; base `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Текущий head брать из branch ref `feat/sectional-op04-atomic-coordinator-2026-11-17`, не из сохранённого здесь SHA. Последняя проверка PR: mergeable=true.
- Сравнение `27537227774ac8b6a6f0ad6236559b2ce0da0202...3507e1738c33dfdc4789827c8d9c62f0450d6fe3` подтверждает: после code/test SHA изменялись только 8 документационных файлов; код и тесты не изменялись. Изменения PR относительно main: 15 файлов (код coordinator, runtime, SW, тесты и документы).
- Проверки: code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202` — Fast quality checks run #44089591987: 553/553 tests passed; Android Debug APK runs #44089591824 и #44089600740 успешны. Для предыдущего HEAD `3507e173...` Android Debug APK pull_request run [#44092265152](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44092265152) завершился success; все шаги, включая regression tests и APK build/upload, успешны. Cloudflare Workers preview check для него также success. Это preview build, не подтверждение production deployment. Для status-only HEAD `afc5cec...` run #44094653314 завершился success. Следующий status-only HEAD `550cda9...`: run #44094791631 был запущен; при последней проверке workflow выполнялся. Текущий коммит этой записи также запускает CI; перед следующими кодовыми изменениями обязательно получить актуальный branch SHA и дождаться его проверок. Отдельный Fast quality checks run для HEAD `3507e17...` не найден; тестовый результат относится к неизменённому code/test SHA `275372...`.
- Проверен текущий PR diff и рабочая ветка: удалённых/неучтённых незавершённых удалённых изменений не обнаружено. GitHub отражает коммиты ветки; локальное рабочее дерево через GitHub API недоступно и не утверждается как проверенное.
- Исходный пользовательский DOCX повторно прочитан непосредственно из загруженного файла. P10 (абзац 11) буквально говорит об установке двух днищ; пользователь отдельно подтвердил три отдельных днища под тремя корпусами первоначального ряда. Это расхождение явно зафиксировано; для модели OP-04 действует прямое подтверждение пользователя. P11 допускает установку второго ряда сразу или через несколько дней; P12 описывает установку трёх подкрышников и крышек после второго ряда.
- Подтверждено пользователем 2026-11-17: во всех рабочих состояниях используются ровно три подкрышника и три крыши; временные элементы не применяются. Для первоначального ряда дополнительно подтверждены три корпуса в линию на трёх отдельных днищах. Это пользовательские уточнения, а не вывод из DOCX.
- В `js/sectional-physical-layout.js` добавлено поле `broodRows`: `1` валидирует промежуточный один ряд (по одному корпусу на секцию), `2` — итоговые два ряда; для старых записей без поля сохраняется прежняя трактовка двух корпусов на секцию. В каждом из трёх стеков обязательны собственные bottom, topRiser и cover. Coordinator `completeOP04()` по-прежнему принимает только два корпуса на секцию и не позволяет отметить первый ряд как завершённый OP-04.
- Добавлены тесты промежуточной раскладки и блокировки завершения OP-04 на одном ряду. Fast quality checks на code/test SHA `2a70452abf256f0571206894c19e13e04553ffba` — 556/556 tests passed (run #44096138371); Android Debug APK PR run #44096148887 — success, включая regression tests, сборку и загрузку APK. На последнем code/test SHA профиль и UI не активируются; OP-05/OP-06 не реализованы, reduced two-queen ветвь OP-06 остаётся fail-closed.
- Main не изменялся. Production database, production deployment, пользовательские данные и локальные записи пасеки не затрагивались.
- Следующий конкретный шаг: реализовать атомарный переход `broodRows: 1` → `broodRows: 2` с перемещением трёх дополнительных корпусов, обновлением журналов оборудования и полным rollback; затем покрыть немедленный и отложенный сценарии тестами. PR #148 остаётся Draft; `main` не изменялась.

---

# Контрольная точка — 2026-11-17: подтверждён постоянный комплект из трёх подкрышников и трёх крышек

- Пользователь подтвердил количество для всех рабочих состояний: один ряд, два ряда, два ряда с медовыми корпусами — всегда 3 подкрышника + 3 крышки; временные элементы не используются.
- Это отдельное подтверждение пользователя, не утверждение DOCX. В DOCX перечислены 3+3 в комплекте (стр. 1), но P10–P12 не полностью описывают промежуточную конфигурацию одного ряда.
- В текущей модели SIDE_BY_SIDE валидатор уже требует topRiserItemId и coverItemId для каждого из трёх стеков; coordinator PR #148 работает с тремя стеками. Проверка, что те же 3+3 сохраняются в будущих staged transitions и в медовой конфигурации, ещё требуется.
- Блокер временных подкрышников/крышек закрыт. Следующий шаг — спроектировать промежуточную физическую раскладку одного ряда и безопасный переход к двум рядам, не меняя количество 3+3.
- PR #148 остаётся Draft. Code/test SHA 27537227774ac8b6a6f0ad6236559b2ce0da0202; документационные изменения после него не меняют код. Текущий HEAD до этого документального обновления: bea4c8e74fc337f07a27641d035ec5c4c6c7405a. CI для нового HEAD после обновления ещё не проверен.

---

## Контрольная точка — 2026-11-17: Draft PR #148, атомарное завершение OP-04

- Актуальный `main`: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #145 и #146 уже объединены.
- Рабочий PR [#148](https://github.com/250oisr-eng/Pasekaapp/pull/148), base `main`, branch `feat/sectional-op04-atomic-coordinator-2026-11-17`; code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202`, последующие коммиты ветки после code/test SHA содержат только документацию; это подтверждено сравнением GitHub. Актуальный PR HEAD сверяется напрямую перед любым следующим действием.. Сравнение подтверждает, что после code/test SHA менялись только документы. PR остаётся Draft, не объединён.
- Fast quality checks на code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202`: run #44089591987 — **553/553 tests passed**. Android Debug APK: push run #44089591824 и pull_request run #44089600740 — **success**. Artifact #14330024531, 3,394,753 bytes, SHA-256 `c8bffeabc272de8b189d44abd14552401367e782c57e4bdd31e7835f914e67e6`, expires 2026-12-01.
- PR добавляет `PasekaSectionalOperationCoordinator.completeOP04()`: clone → split lineage → physical layout → explicit accessory/body movement → full validation → one commit. При любой ошибке исходное состояние остаётся неизменным.
- Все четыре исходные пластиковые заглушки учитываются при тестировании по DOCX P10. Перемещения шести гнездовых корпусов записываются в историю корпуса и общий журнал оборудования; OP-04 получает отдельную запись в `auditLog`.
- App schemaVersion повышается 14→15; IndexedDB object-store version остаётся 3. Добавлена `sectionalTechProcesses`, её проверка в startup/save/backup/snapshot; Service Worker v313. Старые schema14 backups остаются совместимыми.
- **Открытый источник-зависимый вопрос:** DOCX P11 допускает установить второй ряд из трёх корпусов не сразу, а через несколько дней; P12 описывает установку подкрышников и крышек после этого. Текущий coordinator завершает только итоговую раскладку из шести корпусов и не моделирует промежуточное физическое состояние после первого ряда. Источник не уточняет все детали временного укрытия/фиксации этой промежуточной конфигурации. До отдельной модели этого состояния нельзя активировать профиль или UI технологического процесса и нельзя считать промежуточный этап завершённым.
- OP-05/OP-06, UI, активация профиля и реальные операции не входят в PR #148. OP-06 reduced two-queen branch остаётся fail-closed: правило снятия сетчатых заглушек источником не задано.
- Следующий шаг: отдельно спроектировать промежуточное физическое состояние OP-04 после первого ряда из трёх корпусов и до установки второго ряда. До подтверждения/реализации этого состояния не переводить PR из Draft, не объединять его и не активировать профиль.

---

## Контрольная точка — 2026-11-17: PR #146 merged; core family lineage runtime integrated

- Актуальный main SHA: `a1798b0bc47f8f4642c42ac4ab363a98cc1c3e59` — merge commit PR #146. PR #145 и PR #146 объединены.
- PR #146 интегрировал `js/family-lineage.js` в runtime, root `familyEvents`, migration app schema 12→14, lineage validation в startup/save/raw backup, snapshot history, backup compatibility и Service Worker v312.
- На точном code/test SHA `ffbf931453868208460e59d274e09d6c557b8297` GitHub Actions run #44084558765: **545/545 tests passed**, 0 failed; Android Debug APK build/upload — **success**. Artifact #14329575117, 3,387,913 bytes, SHA-256 `c71c7bbd74e26b0c750d33776fd401bf3afde22811fe7da258cc49916446a4cb`, expiry 2026-12-01.
- Для merge commit `a1798b0bc47f8f4642c42ac4ab363a98cc1c3e59` отдельные workflow runs/combined status не представлены. Успешные проверки относятся к точному code/test SHA `ffbf931453868208460e59d274e09d6c557b8297`, не к merge commit.
- IndexedDB object-store version остаётся 3. Прикладная схема 14: legacy schema 1–12 мигрирует добавлением пустого журнала; schema13 поддерживается как переходная; schema14 требует корректный `familyEvents`. Повреждённый существующий журнал или отсутствующий журнал schema14 блокирует миграцию до изменения состояния. Save gate также не восстанавливает отсутствующий журнал schema14 автоматически.
- Исторические семьи/матки и неизвестные разделения не реконструируются. Новая модель lineage проверяется, но UI и OP coordinator пока не подключены.
- Следующий приоритет: спроектировать и реализовать отдельный атомарный coordinator OP-04/05/06 (clone-and-commit/rollback) поверх lineage + sectional layout + inventory + audit. Сначала OP-04, затем OP-05, затем OP-06. До этого не активировать профиль секционного улья и не добавлять UI.
- Открытые старые PR #101/#104 (lineage), #87 (queen laying / OP-06), #105/#106 (sectional layout) и PR #54–58 не объединять напрямую: провести selective diff audit относительно main. PR #145/#146 merged; PR #143/#144 superseded.
- Уточнение по DOCX: описан продуктивный сценарий с двумя матками, если одна из трёх не вернулась, и необязательный перенос двух рамок с яйцами из семьи с исходной маткой в два других отсека (P28–P33). Однако точное правило снятия сетчатых заглушек для reduced two-queen branch в источнике не определено; этот переход должен оставаться fail-closed до отдельного решения.

---

## Контрольная точка — 2026-11-17: PR #145 интегрирован; lineage runtime в PR #146

- Актуальный GitHub main: `d73d9523c1c566624ac372ef768f0253aa8faee6` — merge commit PR #145. PR #145 закрыт слиянием; физический ownership bridge, sectional inventory invariants и подтверждение двух больших решёток теперь входят в main.
- Проверенный кодовый SHA PR #145: `7975abb6cd2084d8eee003e325b3e05cbebaf0f7`; Fast quality checks **536/536 tests passed** (run #44081137150), Android Debug APK build/upload **success** (run #44081137033). После code SHA были только документационные коммиты. Для merge commit `d73d9523c1c566624ac372ef768f0253aa8faee6` GitHub Actions workflow runs и combined status не представлены; это не записывается как успешный CI на merge SHA.
- Следующий технический блок выполняется в Draft PR [#146](https://github.com/250oisr-eng/Pasekaapp/pull/146), ветка `feat/family-events-runtime-integration-2026-11-17`, base `d73d9523c1c566624ac372ef768f0253aa8faee6`, текущий HEAD `19bc270b4f726201e1c18432190092ee552fe235`.
- PR #146 подключает `js/family-lineage.js` к runtime, добавляет `familyEvents`, additive migration прикладной схемы 12→14, lineage integrity в startup/save/raw-backup validation, сохранение событий в snapshot history, совместимость старых backup и Service Worker cache v312.
- IndexedDB object-store version остаётся 3. Схема 13 принимается как переходная: если массив событий уже присутствует, он сохраняется; если отсутствует, создаётся пустой массив. Для схемы 14 массив обязателен. Некорректный существующий массив не заменяется и должен блокировать миграцию до изменения других данных.
- PR #146 проверяется. Android workflow run #44083460821 на HEAD `19bc270b4f726201e1c18432190092ee552fe235` был запущен; на момент записи выполнялся. Результат тестов/сборки пока не подтверждён. Не считать отсутствие отдельного combined status прохождением проверок.
- UI, coordinator OP-04/05/06, активация профиля секционного улья, реальные операции, production и публикация не выполняются этим PR.
- Следующий шаг: дождаться и разобрать CI PR #146 на актуальном HEAD; исправить выявленные ошибки, затем проверить документацию и полную обратную совместимость backup/snapshot.

---

# PROJECT_STATUS — Пасека 2.0

> Главный оперативный журнал состояния разработки и точка восстановления после обрыва связи.
> Последняя сверка: **2026-11-17, после merge PR #146; lineage runtime подключён, OP coordinator следующий**.
> Источник фактического состояния: GitHub main, PR и Actions. Переписка ChatGPT не заменяет этот файл.


## Новая контрольная точка — 2026-11-17: физические инварианты инвентаря секционного улья

- PR #142 уже объединён в main: `02d91ef1cc57c61cbc7789b1b61eda03c8923122`. Событие `queen_absence_confirmed` доступно в изолированном `js/family-lineage.js`; runtime/save/backup/SW интеграция lineage ещё не выполнена.
- Из PR #144 перенесены изменения физического инвентаря в новую независимую ветку `fix/sectional-inventory-location-main-2026-11-17`, основанную непосредственно на актуальном main. Это устраняет stacked-зависимость от PR #143 и исключает потерю изменений PR #142.
- Перенесены `index.html`, `js/equipment-inventory.js`, `js/sectional-physical-layout.js`, `sw.js` и три регрессионных файла. Добавлены derived location для `sectionalLayouts`, проверка инвентаря в save gate, обязательные ссылки на три днища/крышки/подкрышника, максимум одна фактическая feeder location, запрет пластиковых заглушек в SIDE_BY_SIDE и helper полного покрытия OP-05.
- Из PR #143 перенесено подтверждение пользователя: две большие разделительные решётки на весь улей. Оно отделено от двух технических решёток на соединение и временных сетчатых заглушек.
- P10 описывает 4 отверстия первого ряда (1+2+1), P11 повторяет схему во втором ряду; двухрядная раскладка требует 8 отверстий и 8 технических решёток. Валидатор теперь проверяет каждое тело и все связи; OP-05 покрывает все 8 фактических openingId. Диаметр 50 мм подтверждён пользователем.
- На точном PR #145 HEAD `7975abb6cd2084d8eee003e325b3e05cbebaf0f7` Fast quality checks прошли **536/536 tests** (run #44081137150); Android Debug APK build и upload — **success** (run #44081137033). Artifact #14326877819, 3,387,491 bytes, SHA-256 `7c61565660ff61d6d0f79b451300006fe3c92cf5810e808b2c5e85e4239fa69b`, expiry 2026-12-01.
- PR [#145](https://github.com/250oisr-eng/Pasekaapp/pull/145) открыт для review от main, mergeable=true. PR #143 и #144 закрыты как superseded; их изменения перенесены в #145. Merge PR #145 требует отдельного подтверждения пользователя.
- Следующий шаг: выполнить CI на новой ветке, проверить diff относительно main и завершить независимый PR. Затем отдельным этапом интегрировать `familyEvents` в runtime, миграцию, save/snapshot, backup/restore и Service Worker. UI и активацию профиля не начинать.

## Новая контрольная точка — 2026-11-17: две большие разделительные решётки

- Пользователь подтвердил: для трёхсекционного улья используются **две большие разделительные решётки на весь улей**, а не три. Это пользовательское уточнение; DOCX на стр. 3 описывает установку первой и второй решёток, но не задаёт полную геометрию.
- Технические решётки в боковых отверстиях и временные сетчатые заглушки — другие предметы; их число не определяется этим подтверждением.
- Актуальный `main` после merge PR #142: `02d91ef1cc57c61cbc7789b1b61eda03c8923122`.
- PR #142 объединён в main squash-коммитом `02d91ef1cc57c61cbc7789b1b61eda03c8923122`. Code SHA `aa6677d5657a06bdd0a4cf86fd487f0513090223`: 519/519 tests passed; Android Debug APK build/upload success. Добавлен `queen_absence_confirmed`, явное время наблюдения, запрет будущей даты и split OP-04 без поиска исходной матки.
- Следующий главный блок: атомарная доменная интеграция OP-04/05/06 поверх согласованной модели queen absence; синхронизация family lineage, sectionalLayouts, physical equipment, audit и techprocess с полным rollback. UI и активацию профиля не начинать.
- Важный блокер перед реализацией: старые PR #54–58 образуют устаревшую stacked-цепочку. `docs/АУДИТ-PR-54-58-2026-11-16.md` фиксирует критические обходы DONE для OP-04/05 и неверную последовательность OP-14. Не объединять и не переносить их целиком; использовать только после выборочного аудита. В текущем main techprocess registry отсутствует, `index.html` не содержит `S.sectionalTechProcesses`/`techProcesses`; сохранение работает через текущие `records`.

## 1. Проект и текущее состояние

- **Проект:** «Пасека» / Pasekaapp.
- **Репозиторий:** https://github.com/250oisr-eng/Pasekaapp
- **Основная ветка:** main.
- **Последний подтверждённый main SHA:** `02d91ef1cc57c61cbc7789b1b61eda03c8923122`.
- **Состояние:** активная разработка; физическая модель секционного улья и реестр оборудования интегрированы как проверяемые доменные компоненты. Новый профиль ещё не активирован; пользовательские технологические операции OP-04/05/06 не интегрированы с физической раскладкой и lineage.
- **Главный источник технологии:** пользовательский DOCX «улей для каждого техпроцесс.docx» (9 страниц) и последующие явно подтверждённые пользователем уточнения. Неизвестные параметры не додумывать.
- **Бесплатность:** обязательное ограничение проекта; платные API, тарифы, модели, хостинги и опции запрещены.

## 2. Последний завершённый этап

**Этап непрерывности разработки:** корневой PROJECT_STATUS.md создан и обязательность его чтения/обновления закреплена PR [#139](https://github.com/250oisr-eng/Pasekaapp/pull/139), merge commit 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec.

**Этап:** отдельная физическая модель sectionalLayouts и фиксация её интеграции.

- PR [#134](https://github.com/250oisr-eng/Pasekaapp/pull/134) — добавлен доменный реестр физических принадлежностей js/equipment-items.js; merge commit 16b906b97f8dcdfbffe629a5ad6330884768a92d.
- PR [#136](https://github.com/250oisr-eng/Pasekaapp/pull/136) — реестр подключён к runtime-приложению, backup validation и Service Worker; merge commit febff4547e996fbec00f7d56b61fb5b20d6d9b4b.
- PR [#137](https://github.com/250oisr-eng/Pasekaapp/pull/137) — добавлен отдельный валидатор js/sectional-physical-layout.js и root-коллекция sectionalLayouts; merge commit f3de349a5018c557bfdb580071cf235018dd2dfd.
- PR [#138](https://github.com/250oisr-eng/Pasekaapp/pull/138) — обновлены документы состояния и передачи; merge commit 6e31d5b3f1183275037f7f357f52e791e64d1f34.

### Что реализовано

- equipmentInventory.items — отдельный реестр физических принадлежностей с доменной проверкой.
- sectionalLayouts — отдельное текущее физическое состояние секционного улья; не дублируется внутри techprocess record.
- Проверки физической раскладки включены в save(), диагностику пасеки, проверку backup/raw-backup и snapshot history.
- Поддерживаются режимы SIDE_BY_SIDE, ALTERNATIVE_WINTERING_COLUMN, SINGLE_FAMILY.
- Для SIDE_BY_SIDE проверяются три секции по два гнездовых корпуса и две технические связи; каждая связь требует две технические решётки и буферный коридор.
- Для R4 проверяются ровно две большие решётки FULL/HALF по явным верхним корпусам.
- Альтернативная зимовка проверяет распределение [2,1,1] без фиксации сильной семьи в нижней позиции и требует две сетчатые диафрагмы.
- SINGLE_FAMILY поддерживает три или четыре гнездовых корпуса.
- Старые записи без sectionalLayouts остаются допустимыми.

## 3. Изменённые файлы последнего этапа

### PR #134
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- js/equipment-items.js
- tests/equipment-items.test.mjs

### PR #136
- index.html
- sw.js
- tests/regression.test.mjs

### PR #137
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- index.html
- js/sectional-physical-layout.js
- sw.js
- tests/plant-module.test.mjs
- tests/regression.test.mjs
- tests/sectional-physical-layout.test.mjs

### PR #138
- docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md
- docs/КАРТА-ОТКРЫТЫХ-PR-2026-11-17.md
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md
- docs/ПЛАН-РАЗРАБОТКИ.md
- docs/СОСТОЯНИЕ-ПРОЕКТА.md

### PR #139 — постоянный журнал состояния
- AGENTS.md
- PROJECT_STATUS.md
- docs/PROJECT-CONTROL.md
- docs/ПРАВИЛА-РАЗРАБОТКИ.md

### PR #140 — фиксация интеграции журнала
- PROJECT_STATUS.md
- docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md
- docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md
- docs/СОСТОЯНИЕ-ПРОЕКТА.md

## 4. Проверки и подтверждённые результаты

Проверки выполнены на точном PR HEAD aa18cc00c1aa5a6e98c31486df104b54b8e49046 для PR #137:

- Fast quality checks, run [#44040678772](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040678772): **510/510 тестов пройдены**.
- Android Debug APK, push run [#44040678865](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040678865): сборка и загрузка артефакта успешны.
- Android Debug APK, pull_request run [#44040686014](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040686014): сборка и загрузка артефакта успешны.
- Артефакт #14309540416, 3 384 494 bytes, SHA-256 c0fe22078d00f4607f1ffbb8610b63b7179884737bd9c1d82b8cac64eccf940f; срок хранения, зафиксированный при создании: 2026-12-01 07:42:45 UTC.
- Физическое тестирование на Android-устройстве **не проводилось**.
- Для документационного merge PR #138 (SHA 6e31d5b3f1183275037f7f357f52e791e64d1f34) GitHub workflow runs и combined status не вернули записей.
- PR #139 — документационный; для его merge SHA 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec workflow runs и combined status не вернули записей.
- PR #140 — документационный; для его merge SHA 562c3a7794e0b0c1dc5fda46bb89169274fc5446 workflow runs и combined status также не вернули записей. Это означает «CI для этих документационных commits не представлен», а не «CI прошёл».

## 5. Совместимость, данные и границы

- IndexedDB version остаётся **3**; прикладная schemaVersion остаётся **12**.
- Миграции не добавлялись.
- Формат backup не менялся.
- Старые записи без sectionalLayouts допустимы.
- Пользовательские данные не изменялись.
- Production database и production deployment в рамках PR #134/#136/#137/#138/#139 не изменялись.
- Новый профиль секционного улья **не активирован**.
- UI создания/редактирования физической раскладки и реальные физические перемещения не добавлены.
- Технологические переходы OP-04/05/06 не синхронизированы атомарно с lineage, layout, inventory, audit и techprocess.

## 6. Известные проблемы и открытые ограничения

1. **Подтверждение отсутствия матки реализовано только в открытом PR #142.** В main событие пока отсутствует. DOCX P29 допускает продуктивную двухматочную ветвь, если одна матка не вернулась с облёта. Отсутствие currentQueenId само по себе не является подтверждением потери матки.
2. **OP-06 для двухматочной ветви не определён источником.** DOCX допускает работу двух маток, если одна не вернулась, но не объясняет, когда снимать сетчатые заглушки в этом случае. Событие queen_absence_confirmed не должно автоматически разрешать OP-06; до решения пользователя ветвь должна блокироваться.
2. **Нет атомарного перехода OP-04/05/06 и принятой runtime-модели техпроцесса.** Изменения семей/маток, физической раскладки, принадлежностей, аудита и записи техпроцесса пока не выполняются одной согласованной транзакцией/операцией с rollback. Старые PR #54–58 имеют критические дефекты по аудиту и не могут быть объединены как есть.
3. **Family lineage остаётся изолированным доменным модулем.** Не подключать его к реальным операциям/UI до синхронизации с sectionalLayouts, equipmentInventory.items, audit и techprocess.
4. **Профиль секционного улья не активировать** до полной поддержки всех затрагиваемых модулей и локальных проверок.
5. PR #101/#104/#105/#106 остаются открытыми Draft-кандидатами на старых stacked base/head. Они не являются готовыми к прямому merge; требуется selective port после проверки diff и зависимостей.
6. PR #89/#95 также остаются открытыми Draft на старых базовых ветках. Их нельзя считать актуальным источником реестра оборудования или R4 без сравнения с уже интегрированными #134/#136/#137.
7. Физическое Android-устройство не тестировалось.
8. **Lovable:** проект Apiary Family Atlas найден в workspace. Последнее изменение — 2026-11-16 21:36:50 UTC; опубликован. Текущий статус агента — needs_attention, причина out_of_credits; последний Lovable commit f9fb8025a286949e5858ffe32dea91bc7c80ecdb. Этот SHA не найден как commit репозитория Pasekaapp; синхронизация Lovable с GitHub main не подтверждена. GitHub main остаётся источником истины для кода.

## 7. Текущая незавершённая задача

**Подготовить атомарный доменный переход OP-04/05/06, использующий отдельное событие queen absence из PR #142 после его интеграции.**

Событие queen absence реализовано в PR #142 и прошло CI на его HEAD, но PR остаётся Draft и не входит в main. Атомарный переход OP-04/05/06 ещё не реализован. UI не начинать до определения транзакционной границы и rollback.

## 8. Следующий конкретный шаг

1. Повторно сверить старую технологическую цепочку PR #54–58 с текущим main и аудитом `docs/АУДИТ-PR-54-58-2026-11-16.md`; не объединять её напрямую.
2. Определить безопасную модель хранения техпроцесса и совместимость с текущими `records`, IndexedDB schemaVersion 12, backup/restore и offline.
3. Проверить PR #142 и его зависимость для queen absence; не считать событие интегрированным в main.
4. Спроектировать атомарную границу OP-04/05/06: lineage + sectionalLayouts + equipment inventory + audit + techprocess, включая rollback.
5. Реализовать доменный переход и тесты отказов/повторов; UI и активацию профиля отложить до приёмки модели.

## 9. История важных контрольных точек

| Дата | Этап | Подтверждённый результат |
|---|---|---|
| 2026-11-17 | PR #134 | Реестр физических принадлежностей добавлен; merge 16b906b9… |
| 2026-11-17 | PR #136 | Runtime/backup/SW integration; merge febff454… |
| 2026-11-17 | PR #137 | Валидируемая sectionalLayouts; 510/510 tests и Android Debug APK; merge f3de349a… |
| 2026-11-17 | PR #138 | Документы и план обновлены; merge 6e31d5b3… |
| 2026-11-17 | PR #139 | Создан корневой PROJECT_STATUS.md; правила чтения и обновления закреплены в AGENTS.md, PROJECT-CONTROL.md и ПРАВИЛА-РАЗРАБОТКИ.md; merge 0cfb2632… |
| 2026-11-17 | PR #140 | Факт интеграции журнала внесён в состояние, журнал и передачу между чатами; merge 562c3a77… |
| 2026-11-17 | Текущая сверка | Lovable найден, но статус out_of_credits; SHA не совпадает с подтверждённым GitHub main |

## 10. Правила обновления этого файла

- Читать этот файл первым при каждом возобновлении работы, затем проверять фактический GitHub main/PR/CI и Lovable.
- После каждого логически завершённого этапа обновлять этот файл **в том же PR/изменении**, что и соответствующий этап.
- Не записывать предположения как факты. Для каждого CI-результата указывать точный SHA и ссылку на run.
- Не указывать merge/сохранение/публикацию как завершённые без подтверждения соответствующего сервиса.
- Не удалять старые записи из раздела истории; новые контрольные точки добавлять сверху или в конец, сохраняя хронологию.
- При расхождении этого файла с GitHub сначала проверить фактическое состояние и исправить журнал отдельной записью; файл не является основанием игнорировать реальный GitHub.
- В конце каждого этапа указывать один следующий шаг и конкретные незавершённые блокеры.


## 11. Подтверждение внедрения постоянного журнала

- PR #139 merged в GitHub main: 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec.
- После merge повторно проверены наличие PROJECT_STATUS.md в main и статус PR #139.
- PR #139 изменил только документацию и правила управления; код, IndexedDB, backup, пользовательские данные, Lovable и production не менялись.
- CI для документационного merge SHA не представлен; это не трактуется как успешная проверка приложения.


## 12. Контрольная точка PR #140

- PR #140 merged в main: 562c3a7794e0b0c1dc5fda46bb89169274fc5446.
- PROJECT_STATUS.md и документы состояния/журнала/передачи содержат запись об интеграции PR #139.
- PR #140 был документационным; workflow runs и combined status для merge SHA отсутствуют. Кодовые проверки не заявляются.


## Решение пользователя — учёт пустых корпусов и комплектности рамок (2026-11-17)

Пользователь уточнил два состояния из DOCX:
- P57: временный корпус без рамок используется только для стряхивания пчёл с рамок в общую семью, после чего корпус убирается. Эта вспомогательная операция и временное использование корпуса **не учитываются в приложении**: не создают установленный корпус, запись инвентарного перемещения или технологическое событие.
- P77: «пустой корпус» означает **незаселённый корпус с рамками**. Это реальный установленный корпус, он учитывается в физической раскладке, инвентаре и истории оборудования.

Следствие: правило полной комплектности не имеет исключения для установленных корпусов. Каждый учитываемый установленный корпус должен содержать ровно число рамок, соответствующее его вместимости. «Пустой» по заселённости корпус не означает отсутствие рамок. Временный корпус P57 находится вне модели учёта приложения.
