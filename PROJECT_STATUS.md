# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — live main `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`**. Live GitHub имеет приоритет над датированными отчётами. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и старые сбои — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Масштабированный цикл — два независимых кодовых Draft (25.11.2026)

- [#530](https://github.com/250oisr-eng/Pasekaapp/pull/530) поверх #515: SW запрещает сохранять `Response.redirected=true` даже при HTTP 200, отрицательные install/fetch тесты. [#531](https://github.com/250oisr-eng/Pasekaapp/pull/531) поверх #510: однократный Map семей при отображении журнала, сохранены поисковые исторические имена, два теста. Изменённые файлы не пересекаются. **На точных конечных HEAD #530 и #531 Android + Governance SUCCESS**: #530 Android #45658901083, Governance #45658901124; #531 Android #45659290364, Governance #45659290425. Это синтетические тесты, не физическое испытание OnePlus.
- Без merge и release. #529 review matrix Governance SUCCESS на `9bc99efba2b10aca5d4ac834a9c01218fbd57390`. Физический OnePlus/производительность не проверялись.

## Параллельный P0/P1/P2 review — 25.11.2026

- Проверен live main `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`. Без merge: #512 P0 запрет удаления оригиналов, #511 metadata cursor, #514 race guard, их синтетическая композиция #518, независимые #510 журнал, #515 SW и #516 JSON. На точных HEAD #510/#512/#518 Android и Governance SUCCESS; физические доказательства не получены.
- Порядок и риски в [матрице](docs/P0-P1-P2-INDEPENDENT-PR-REVIEW-2026-11-25.md): защита #512 обязательна до включения связанных P2/P1 видео-оптимизаций; #518 — не разрешение на merge. #510/#515/#516 независимы. B01/B04/B05 BLOCKED, видео #442 FROZEN.

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
- **B04/B05 P0 — UPGRADE BLOCKED:** [Draft #517](https://github.com/250oisr-eng/Pasekaapp/pull/517) фиксирует пользовательский V5 read-only PASS установленного signer, но не проверку Node-кода на телефоне; [Draft #520](https://github.com/250oisr-eng/Pasekaapp/pull/520) доказал несовпадение текущей CI debug-подписи. Долгоживущий соответствующий private key и backup не подтверждены; **Draft #469** частично неперенесён. APK upgrade запрещён до B01 recovery и rollback.
- **B06/B10 — FROZEN #442:** лицензированные веса, реальный детектор пчёл/видеоконвейер и доказательное удаление оригиналов не подтверждены. Оригиналы **не удалять**.
- **P1 OP01–14/B11 — NOT_VERIFIED:** новый многосекционный профиль и физический OP13/CAS не активировать; холодный offline и обновление на реальном OnePlus не проверены. Не смешивать новую технологию с Farrar.

## Следующий безопасный этап

1. Только при доступности реального внешнего файла и ПК: локально проверить полный экспорт отдельно от обычного JSON, затем независимый restore на пустой среде; **архив с личными данными в чат/CI не загружать**.
2. Уже полученный V5 signer-пруф не повторять. Независимо проверять B05 custody существующего ключа (не передавать секреты) и совместимость будущего кандидата; без B01/B04/B05 не устанавливать сборку.
3. Независимо продолжить source-bound review оставшихся P1 Draft PR; не подключать OP11–14 к live UI до полной физической модели и user-confirmed CAS.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.** Успешный CI не равен физическому испытанию.
