# PROJECT_STATUS — Пасека 2.0

**26.11.2026 — live main `346b35035861257be45dae93ee0573cbd4de9082`**. Live GitHub имеет приоритет над датированными отчётами. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и старые сбои — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Увеличенный макроцикл — 8 независимых потоков, 25.11.2026

- **26.11 B11 #515→#530**: #515 конфликт с main устранён отдельным защищённым двухродительским коммитом `6b8dc21e`; #530 выровнен на родителя, `29912189`, с обходом Authorization/Range/no-store. Итоговый CI этих SHA проверять отдельно; OnePlus offline NOT_TESTED.
- **26.11 B09 #536/#537/#538**: #536 и #538 synthetic IndexedDB CI PASS; #537 isolated emulator+Windows ZIP PASS на итоговом SHA; реальный OnePlus NOT_TESTED. Ни один Draft не в main.

- **P0 #512 MERGED**: protected main `346b3503`, video insert-only `add`, старые destructive действия FROZEN; видео #442 FROZEN.
- **P1 #530**: query/redirect/204/206 cache gates, новый cache **v320**, прежний v319 не трогать при неудачной установке. HEAD `ab2e64ab`, Fast/Android/Governance SUCCESS; cold offline NOT_TESTED.
- **P1 #514**: JS-опасные ID видео заменены на безопасный `data-video-id`; HEAD `3e239ab1`, Android/Governance SUCCESS. Родительский delete UI всё ещё требует P0 #512 перед интеграцией.
- **P0/P1/P2 #518**: test-only композиция защиты Blob, `add`, metadata cursor и ID/race guard; HEAD `53b46fa6`, Android/Governance SUCCESS, не release.
- **P1 #516**: JSON исторических связей семьи/улья без автоматического исправления; docs HEAD `b9753069`, Android #45667463840 / Governance #45667463839 SUCCESS. Не full backup.
- **B01 #524**: тесты изменения legacy store и дублей манифеста, docs HEAD `673ffbf2`, Android #45667486417 / Governance #45667486311 / Windows #45667486432 SUCCESS. Не OnePlus recovery.
- **P2 #531**: журнал с индексами family/first record и сохранением legacy имён; HEAD `38b51b9e`, Android/Governance SUCCESS, физическая скорость NOT_MEASURED.
- **Контроль #529**: матрица зависимостей, статусы CI и журнал; код других веток не переносить автоматически. NO_MERGE / NO_RELEASE.

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
