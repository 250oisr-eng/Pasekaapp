# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — текущий main `01a3449ee232299a37655d0194f39b23161048e7`**. Live GitHub имеет приоритет над датированными отчётами. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и старые сбои — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

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

## B01 — независимый app-level архив, отдельный Draft #524

- После V20 6/6 SHA сырого LevelDB в Android-эмуляторе V19 показал `EXPECTED_DB_NOT_DISCOVERED`; V22 выявил 1 SHA-match, 1 difference, 4 ошибки `stat`, **0 подтверждённо отсутствующих**. Сырой повторный импорт прекращён; исходный архив и OnePlus не затронуты. История/точные отчёты в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [Draft #523](https://github.com/250oisr-eng/Pasekaapp/pull/523).
- **[Draft #524](https://github.com/250oisr-eng/Pasekaapp/pull/524) IMPLEMENTED_DRAFT:** отдельный локальный `scripts/prove-exported-archive-recovery.mjs` (без доступа к телефону) проверяет существующий файл `paseka-idb-full-v1`: ограниченное неизменяемое чтение, временная fake IndexedDB, `inspectArchive` → `atomicRestore` в пустую DB → точное сравнение всех Store/Blob → закрытие/повторное открытие и проверка SHA. Тесты включают binary same-size corruption, старые дополнительные stores и невалидный архив. **Точный код+docs SHA `14aa7e844edc346b5452cf9f37840ba8e8f11abc`: [Android #45625611272](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45625611272) SUCCESS — 817/817 тестов, debug APK PASS; [Governance #45625611266](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45625611266) SUCCESS.**
- **[Draft #525](https://github.com/250oisr-eng/Pasekaapp/pull/525) IMPLEMENTED_DRAFT, stacked on #524:** единый offline Windows `ПРОВЕРИТЬ-ПАСЕКУ.cmd` для B01 и следующих локальных проверок. Проверяет доступный полный экспорт через одноразовую IndexedDB, пишет **новые** обезличенные отчёты в `PASEKA-CHECK-REPORTS`, не повторяет сырую пересадку LevelDB. При отсутствии JSON отмечает `NEEDS_INPUT`; MediaStore — `NEEDS_DEVICE_EVIDENCE`. Устройство, сеть, исходные файлы и видео не затрагивает. **Windows CI #45630998698 PASS на SHA `56fea1f` — 22/22 и два запуска реального ZIP; Governance #45630998840 PASS.**
- **Не доказаны** существование полного реального экспортированного JSON с OnePlus, Gallery/MediaStore и независимый Android restore. B01 и видео #442 остаются BLOCKED/FROZEN; никаких production-операций.

## Нерешённые блокеры

- **B01 P0 — BLOCKED:** нет проверенной внешней копии всех оригинальных источников OnePlus (в том числе Gallery/MediaStore/отдельные видео), нет независимого restore на пустой цели. Старый TAR некорректен. Новый локальный checker не заменяет backup/restore.
- **B04/B05 P0 — BLOCKED:** реальный signing fingerprint установленного `ru.paseka.journal` и постоянный приватный ключ не подтверждены; **Draft #469** остаётся частично неперенесённым. Прямой APK upgrade запрещён до B01 backup, восстановления и rollback.
- **B06/B10 — FROZEN #442:** лицензированные веса, реальный детектор пчёл/видеоконвейер и доказательное удаление оригиналов не подтверждены. Оригиналы **не удалять**.
- **P1 OP01–14/B11 — NOT_VERIFIED:** новый многосекционный профиль и физический OP13/CAS не активировать; холодный offline и обновление на реальном OnePlus не проверены. Не смешивать новую технологию с Farrar.

## Следующий безопасный этап

1. После CI #525 скачать **единый** Windows комплект, распаковать и запускать всегда `ПРОВЕРИТЬ-ПАСЕКУ.cmd`; отдавать только последний `PASEKA-CHECK-*.json`. Если полного JSON нет — отметить NEEDS_INPUT, не устанавливать APK ради экспорта и не смешивать обычный JSON с полным.
2. Только при авторизованном подключении OnePlus: read-only проверить сертификат установленного APK; без доказательства B01/B04/B05 не устанавливать новую сборку.
3. Независимо продолжить source-bound review оставшихся P1 Draft PR; не подключать OP11–14 к live UI до полной физической модели и user-confirmed CAS.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.** Успешный CI не равен физическому испытанию.
