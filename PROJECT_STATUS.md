# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — последний live main `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2`**. Live GitHub имеет приоритет над датированными отчётами. Правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/CI и старые сбои — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## 26.11.2026 — новая реальная операция резервирования OnePlus, Draft #543

- Физический OnePlus public probe: `NON_BASE64_OUTPUT`, exit=0, 270 байт (260 без CR/LF); приватные данные НЕ прочитаны. #543 добавил безопасную матрицу 5 публичных проб `outer/app × printf/base64/pipefail` для локализации shell-ошибки; TAR пока **НЕ** запускать. Архив/восстановление NOT_VERIFIED.
- Пользователь подтвердил, что **на установленном OnePlus нет UI полного архива**. Функция в GitHub source не означает наличия её на установленном APK.
- [Draft #543](https://github.com/250oisr-eng/Pasekaapp/pull/543), ветка `feat/p0-b01-oneplus-run-as-cold-sandbox-backup-20261126` от main: **новый** однокнопочный Windows exporter `RUN-ONEPLUS-BACKUP.cmd` для приложения `ru.paseka.journal` с `adb exec-out run-as`, запрещающий работающий процесс, замену исходников и перезапись внешнего файла; TAR + SHA, disk SHA readback и `tar -tf`. [Инструкция](docs/B01-ONEPLUS-COLD-APP-PRIVATE-BACKUP-2026-11-26.md). Физическая попытка `BLOCKED`; Gallery/MediaStore/restore `NOT_VERIFIED`; удаление запрещено.
- #512 MERGED, но не опубликован на телефон; #541/#542 Draft проверяют готовые файлы.

## Текущий параллельный цикл — безопасность оригиналов и P2

- Draft #511: курсор метаданных видео CI PASS, real RAM NOT_MEASURED.
- [Draft #512](https://github.com/250oisr-eng/Pasekaapp/pull/512): P0 обход #442 — `deleteEntranceVideoBlob`, `deleteAllData` и **экспортируемый `canDeleteVideoOriginal`**, который разрешал удаление по трём флагам очереди/сервера. Все три пути теперь **FROZEN/fail-closed**: прямой UI и функция сброса блокированы до записи, кнопка полного удаления **disabled без onclick**, legacy helper всегда `false`, даже при поддельных флагах восстановления. Тесты и проверка точного SHA обязательны; без merge/release.
- [Draft #509/#510](https://github.com/250oisr-eng/Pasekaapp/pull/510): CI проверенные селективные, пока НЕ merged. P2 asset-selection #426 не переносить: в main все 19 JS используются, ожидаемая экономия 0.
- B01 recovery и B04/B05 signing по-прежнему BLOCKED; #442 detector/auto-cleanup FROZEN. Ни одного реального удаления, установки Android или публикации.

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
