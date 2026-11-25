# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — main `346b35035861257be45dae93ee0573cbd4de9082`**. Live GitHub имеет приоритет над датированными отчётами. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и старые сбои — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Текущее (25.11.2026) — B01 реальный архив восстановлен изолированно
- [#512](https://github.com/250oisr-eng/Pasekaapp/pull/512) **MERGED**, main `346b35035861257be45dae93ee0573cbd4de9082`: оригиналы видео не удалять/не перезаписывать; удаление IndexedDB заблокировано. На OnePlus APK не менялся.
- **B01 (частично подтверждено на пользовательском OnePlus):** установленное WebView через Chrome DevTools показало `paseka-v1`; локальный readonly-экспорт на ПК **299687 байт**, `dbVersion=3`, `main=1`, `full_backup=1`, `entrance_media=0`. Отдельный локальный проверяющий подтвердил файловый и payload SHA256 MATCH; **независимое восстановление в пустую in-memory IndexedDB, закрытие, повторное открытие, сверка байтов всех трёх stores: PASS**, пользовательский обезличенный `PASEKA_B01_REPORT` `EXACT_ARCHIVE_REOPEN_BYTES_VERIFIED`. Файл исходного экспорта и данные OnePlus неизменны. Этот PASS **не означает** реальное Android-восстановление, долговечное независимое хранение или полноту внешних видео.
- **Маршрут видео по исходному коду:** `index.html` принимает `<input type=file accept=video/* capture=environment>`, сохраняет полученный File в `entrance_media` через `add`. Ноль записей означает только пустую очередь **в момент снимка**. Системная камера/галерея может содержать отдельные оригиналы, их происхождение и местоположение по коду не установлены. Не сканировать без нужды всю личную медиатеку и не приписывать чужие видео Пасеке. B01 внешние MediaStore/Gallery и долговременный Android restore остаются **BLOCKED/NOT_TESTED**.
- **B05:** сертификат установленной версии подтверждён ранее V5; CI debug signer другой, приватный ключ/rollback неизвестны. Установка APK, live restore, очистка оригиналов, релиз запрещены. B06/#442 FROZEN.
- [Draft #524](https://github.com/250oisr-eng/Pasekaapp/pull/524): инструмент независимого ephemeral restore прошёл GitHub CI на прежнем SHA, но PR не объединён. [Draft #528](https://github.com/250oisr-eng/Pasekaapp/pull/528): физические обезличенные B01-отчёты зафиксированы в комментариях. [Draft #533](https://github.com/250oisr-eng/Pasekaapp/pull/533): этот отчёт — документация, только Draft; разрешения на merge нет.
- **Следующее действие без повторных синтетических циклов:** определить, создаёт ли используемый реальный маршрут съёмки отдельный файл в системной галерее; если да — независимо и без изменения оригиналов сохранить нужные реальные файлы и проверить их контрольные суммы на ПК, затем отдельно рассмотреть Android restore/rollback. Если видео отсутствуют, зафиксировать подтверждение источника, а не выдавать глобальный нулевой счётчик всех видео.

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

## Нерешённые блокеры

- **B01 P0 — PARTIAL/EXTERNAL_MEDIA_BLOCKED:** реальный полный IndexedDB v3 экспорт и независимый пустой in-memory restore/reopen/byte proof PASS по отчёту владельца 25.11.2026; системные Gallery/MediaStore оригиналы и реальное Android восстановление NOT_TESTED. Не объявлять fullBackupVerified.
- **B04/B05 P0 — BLOCKED:** реальный signing fingerprint установленного `ru.paseka.journal` и постоянный приватный ключ не подтверждены; **Draft #469** остаётся частично неперенесённым. Прямой APK upgrade запрещён до B01 backup, восстановления и rollback.
- **B06/B10 — FROZEN #442:** лицензированные веса, реальный детектор пчёл/видеоконвейер и доказательное удаление оригиналов не подтверждены. Оригиналы **не удалять**.
- **P1 OP01–14/B11 — NOT_VERIFIED:** новый многосекционный профиль и физический OP13/CAS не активировать; холодный offline и обновление на реальном OnePlus не проверены. Не смешивать новую технологию с Farrar.

## Следующий безопасный этап

1. Только при доступности реального внешнего файла и ПК: локально проверить полный экспорт отдельно от обычного JSON, затем независимый restore на пустой среде; **архив с личными данными в чат/CI не загружать**.
2. Только при авторизованном подключении OnePlus: read-only проверить сертификат установленного APK; без доказательства B01/B04/B05 не устанавливать новую сборку.
3. Независимо продолжить source-bound review оставшихся P1 Draft PR; не подключать OP11–14 к live UI до полной физической модели и user-confirmed CAS.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.** Успешный CI не равен физическому испытанию.
