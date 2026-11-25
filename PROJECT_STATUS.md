# PROJECT_STATUS — Пасека 2.0

## B01 P0 — 25.11.2026: физический V9.1 `PUBLIC_TAR` FAIL

- OnePlus NE2213: ADB 1.0.41, shell_v2, run-as, process gate PASS; `PUBLIC_TAR_INVALID_TAR_BLOCK_ALIGNMENT_OR_LENGTH_INVALID`. **Приватные данные не читались, restore NOT_TESTED**.
- Draft #522: PC-only V10 проверяет уже сохранённый публичный `public-only-v9.tar` без ADB, извлечения и передачи файлов. Windows CI: пять synthetic TAR PASS. Следующий шаг — только обезличенный JSON локальной форензики. B01 BLOCKED; APK/удаление видео запрещены.

## 25.11.2026 — B01: Windows TAR capture V9, Draft #522

- Live main до PR: `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`. [Draft #522](https://github.com/250oisr-eng/Pasekaapp/pull/522): отдельный Windows PowerShell 5.1 read-only `tools/b01-oneplus-safe-v9/` с ADB >=1.0.41 + `shell_v2`, публичным TAR preflight, explicit CAPTURE, запретом перезаписи, process guard, header/payload/EOF проверки и SHA-256.
- Exact code SHA `c4eeb62c1a6d2a5566646a16fee4752b67c99195`: [Windows synthetic run #45575886776](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45575886776) **SUCCESS**, 8/8 synthetic modes (1 PASS+7 negative). Fast [#45575877666](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45575877666) **SUCCESS**; Android [#45575886737](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45575886737) **CANCELLED**, не объявлять PASS. Real OnePlus V9 `NOT_TESTED`.
- Сбой пользовательского V8: `BLOCKED/LOCAL_TAR_VERIFY/INVALID_TAR_HEADER_CHECKSUM`; старый raw ADB мог смешивать stderr и TAR, но V8 root `UNKNOWN`. Физический private backup, Gallery/MediaStore и independent restore всё ещё `BLOCKED/NOT_VERIFIED`. **NO_PHONE_WRITE / NO_RESTORE / NO_VIDEO_DELETE / NO_RELEASE / NO_MERGE**.
- Следующий единственный физический шаг после готовности ПК: одно локальное V9 публичное испытание, приватный кандидат только при его PASS. В чат только JSON, TAR никогда. Далее независимое восстановление на пустой цели; без него B01 не снят.

**25.11.2026 — сверенный main `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`**. Live GitHub имеет приоритет над датированными отчётами. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и старые сбои — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

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

- **B01 P0 — BLOCKED:** нет проверенной внешней копии всех оригинальных источников OnePlus (в том числе Gallery/MediaStore/отдельные видео), нет независимого restore на пустой цели. Старый TAR некорректен. Новый локальный checker не заменяет backup/restore.
- **B04/B05 P0 — BLOCKED:** реальный signing fingerprint установленного `ru.paseka.journal` и постоянный приватный ключ не подтверждены; **Draft #469** остаётся частично неперенесённым. Прямой APK upgrade запрещён до B01 backup, восстановления и rollback.
- **B06/B10 — FROZEN #442:** лицензированные веса, реальный детектор пчёл/видеоконвейер и доказательное удаление оригиналов не подтверждены. Оригиналы **не удалять**.
- **P1 OP01–14/B11 — NOT_VERIFIED:** новый многосекционный профиль и физический OP13/CAS не активировать; холодный offline и обновление на реальном OnePlus не проверены. Не смешивать новую технологию с Farrar.

## Следующий безопасный этап

1. Только при доступности реального внешнего файла и ПК: локально проверить полный экспорт отдельно от обычного JSON, затем независимый restore на пустой среде; **архив с личными данными в чат/CI не загружать**.
2. Только при авторизованном подключении OnePlus: read-only проверить сертификат установленного APK; без доказательства B01/B04/B05 не устанавливать новую сборку.
3. Независимо продолжить source-bound review оставшихся P1 Draft PR; не подключать OP11–14 к live UI до полной физической модели и user-confirmed CAS.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.** Успешный CI не равен физическому испытанию.
