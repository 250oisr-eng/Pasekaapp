# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — base main `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`**. Live GitHub имеет приоритет над датированными отчётами. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и старые сбои — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Последний законченный макроцикл — безопасные локальные проверки B01

- **[#506](https://github.com/250oisr-eng/Pasekaapp/pull/506) MERGED**, `main=635e4e3dded87a595645bb479e2c74040577ea5d`: `scripts/verify-exported-archive.mjs` теперь контролирует **фактический** объём чтения полного экспортированного `paseka-idb-full-v1` JSON до 512 MiB, запрещает symlink, проверяет identity/изменение файла/UTF-8. **Fast #45556213707, Governance #45556213617, Android #45556213559 SUCCESS** на точном main. Это проверка файла, не восстановление.
- **[#507](https://github.com/250oisr-eng/Pasekaapp/pull/507) MERGED**, `main=01a3449ee232299a37655d0194f39b23161048e7`: отдельный `scripts/audit-oneplus-json-transfer.mjs` — локальная, ограниченная 512 MiB проверка **обычного JSON состояния** старой версии OnePlus. Сверяет структуру ульев/семей/записей, ожидаемые counts, сообщает об исключении отдельного `entrance_media`. **Fast #45556536401, Governance #45556536383, Android #45556536188 SUCCESS** на точном main. `JSON_STATE_PREFLIGHT_ONLY` не равно `fullBackupVerified`.
- **Draft #452 / Draft #479:** источник резервных копий и исторический 1 090-byte TAR остаются без физического доказательства, большой stacked diff не интегрировать целиком. PR отмечены как требующие изолированного review.

## Предыдущие подтверждённые интеграции

- **#504 MERGED**, `8b4eabf04220a96e45127568816758360da834c5`: fail-closed первые операции при ошибке IndexedDB/`versionchange`; не разрешены state/media writes, restore, delete или ложный полный G0. Fast #45549767248, Governance #45549767244, Android #45549767279 SUCCESS на main.
- **#501 MERGED:** локальный `verify-exported-archive` использует исходный `inspectArchive`, отдельную in-memory fake-indexeddb, SHA/stores/counts/Blob. Проверенный **файл** не равен независимому restore.
- **#500 MERGED:** `check-oneplus-upgrade.mjs --installed-only` умеет read-only получать package/versionCode/SHA-256 сертификата установленного APK с ADB и SDK. Реальный телефон не проверялся.
- **#502 MERGED:** по исходному DOCX OP13 обычное весеннее развитие и ранний мёд — разные сценарии. В v2 stacked Draft #461–#466 они ещё не активированы в main.
- Исторический #70 CLOSED/SUPERSEDED: `startupRecoveryPending`/commit-after-save и негативные тесты уже в main.

## B01 V20 — VERIFIED SYNTHETIC ANDROID EMULATOR TRANSFER (25.11.2026)

- **SUCCESS [CI #45619544834](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45619544834)** на **точном кодовом SHA `f82184b99bad1d1c3cf4b23a2a38416c4f045200`**: diagnostic APK build PASS, Windows portable kit PASS и **реальный аппаратно ускоренный Android 15 API 35 эмулятор** PASS для потока синтетических LevelDB-заглушек через ADB `exec-in/run-as/tar` и полного SHA-256 readback. Предыдущие failures: CI KVM, потеря переменных при `/usr/bin/sh -c` и смешанный код ошибки SHA; всё исправлено, не маскировалось.
- Доступен Windows zip-артефакт **`PASEKA-B01-ISOLATED-EMULATOR-TRANSFER-V20`**, ID `15023179533`, ~37.4 MB, из того же успешного run. Пользователь подтвердил, что на Windows 11 установлен Android Studio Rabbit 2 и **свежий виртуальный телефон успешно запустился**; его автоматизированный перенос **реальной** V16 копии ещё не выполнялся.
- **Следующий единственный real-data gate:** пользователь скачивает **только новый CI-пакет** с run #45619544834, распаковывает в новую папку и запускает `START-EMULATOR-V20.cmd` на единственном новом AVD с именем `PASEKA_B01_ISOLATED_*`; затем передаёт только обезличенный `B01-RESULT.json`. При SHA PASS — вручную внутри отдельного APK выполнить WebView read-only `paseka-v1` reopen/count и передать обезличенный экран/JSON. Указанные действия не эквивалентны полному restore: значения/Blob, Gallery/MediaStore и полнота видео не проверены.
- До physical evidence **B01 FULL_RESTORE_BLOCKED**, видео #442 **FROZEN**; никакого APK upgrade, OnePlus install/write, удаления исходников, merge или deploy.

## Нерешённые блокеры

- **B01 P0 — PARTIAL PHYSICAL PC PROOF / FULL RESTORE BLOCKED:** в Draft #522 реальные отчёты V16→V18 от пользователя подтверждают кандидат TAR 5 113 856 B, 96/96 побайтовых PC файлов, один набор IndexedDB LevelDB и CRC32C журнала 578 035 B / 63 физические / 46 логических / 0 ошибок. **Это не работающий Android restore.** Полнота Gallery/MediaStore/видео и проверка ключей/Blob НЕ доказаны. Ни APK upgrade, ни удаление оригиналов не разрешены.
- **B04/B05 P0 — BLOCKED:** реальный signing fingerprint установленного `ru.paseka.journal` и постоянный приватный ключ не подтверждены; **Draft #469** остаётся частично неперенесённым. Прямой APK upgrade запрещён до B01 backup, восстановления и rollback.
- **B06/B10 — FROZEN #442:** лицензированные веса, реальный детектор пчёл/видеоконвейер и доказательное удаление оригиналов не подтверждены. Оригиналы **не удалять**.
- **P1 OP01–14/B11 — NOT_VERIFIED:** новый многосекционный профиль и физический OP13/CAS не активировать; холодный offline и обновление на реальном OnePlus не проверены. Не смешивать новую технологию с Farrar.

## Следующий безопасный этап

1. Пользователь (Windows 11 + уже работающий отдельный AVD) загружает **новый** Windows V20 ZIP из [успешного run #45619544834](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45619544834), запускает `START-EMULATOR-V20.cmd` только на `PASEKA_B01_ISOLATED_*`. Передаёт **только** обезличенный `B01-RESULT.json`; устаревшие ZIP не смешивать.
2. Если SHA-256 файла-копии PASS, запустить диагностический APK **в эмуляторе** и собрать read-only WebView `paseka-v1` open/count. Blob и Gallery/MediaStore требуют дополнительного независимого доказательства.
3. Не устанавливать APK на OnePlus и не удалять оригиналы; параллельно продолжать source-bound review P1 Draft PR, без активации OP11–14 в live UI.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.** Успешный синтетический CI ≠ пользовательский restore.
