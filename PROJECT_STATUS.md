# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — контроль F7 после параллельного цикла.** Текущий подтверждённый `main=8b4eabf04220a96e45127568816758360da834c5`. Факты проверены через live GitHub. Нормативные ограничения: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## Реальные изменения и проверки

- **[#504](https://github.com/250oisr-eng/Pasekaapp/pull/504) MERGED** → `8b4eabf04220a96e45127568816758360da834c5`: B01 fail-closed startup после ошибок IndexedDB и `versionchange`; блокируются state/media write, JSON restore, delete, ложный G0/full archive. Дополнительные честные предупреждения о том, что отдельные видео летков отсутствуют в обычном JSON. Два новых тестовых файла и B09/source regression обновлены. PR exact-head `1a5a18ed7f3717d173d285110ebca037a0ce17da`: Android #45549600435 и Governance #45549600400 SUCCESS. Предыдущие тестовые SHA давали FAILURE, фикстуры исправлены. Exact-main Fast #45549767248 / Android #45549767279 / Governance #45549767244 запущены, итог проверить. Реальный OnePlus не обновлялся.

- **[#501](https://github.com/250oisr-eng/Pasekaapp/pull/501) MERGED** → `2cf40d8bd272a43775705985939a8fa775182ab9`: отдельная **локальная проверка сохранённого полного P0 JSON-файла**, `scripts/verify-exported-archive.mjs`, чтение файла, реальный `PasekaDisasterArchive.inspectArchive` и временная fake-indexeddb **только в памяти**, контроль SHA/stores/counts/binary. Возвращает `EXPORTED_FILE_STRUCTURALLY_VERIFIED_RESTORE_NOT_TESTED`. Прогон на актуальном main: Fast #45548279930, Governance #45548279902, Android #45548279894 — **SUCCESS**. **Ни реальный OnePlus, ни независимый restore не проверены**. Лимит памяти CLI 512 MiB, более крупные архивы не объявляются повреждёнными.
- **[#500](https://github.com/250oisr-eng/Pasekaapp/pull/500) MERGED** → `554e21a2e04bbb8c4baa4ae3ed3bdba2b1ed103a`: независимый перенос из большого Draft #469 инструмента **только чтения** `scripts/check-oneplus-upgrade.mjs`, с отказом на неполном SHA-256 и неоднозначных `base.apk`. Первоначальный CI #45548102535 **FAILURE** из-за двойного экранирования перенесённой тестовой фикстуры ADB; исправлено **только в тесте**, повторный кодовый SHA `6da2de1b95e47137167161d9fa0ed574ff136add` Android #45548217911, Governance #45548217837 SUCCESS. После merge: Fast #45548435371, Governance #45548435436, Android #45548435450 — **SUCCESS** на точном main. Установленный сертификат и ключ **неизвестны**: CLI на телефоне/ПК не запускался.
- **[#502](https://github.com/250oisr-eng/Pasekaapp/pull/502) MERGED** → `f60479263064f59a227a4f26d8d7e7186123181f`: только [сверка OP-13 с пользовательским исходным DOCX P72–P79](docs/P1-OP13-SPRING-VARIANT-LIVE-MAIN-GATE-2026-11-25.md). Обычное развитие после зимовки `REGULAR_DEVELOPMENT` и подготовка к раннему мёду `EARLY_HONEY_PREPARATION` — разные технологические ветви; календарный ориентир не подтверждает операцию. Governance оригинального PR #45548333418 **SUCCESS**, exact-main docs Governance проверить.
- **[Исторический #70](https://github.com/250oisr-eng/Pasekaapp/pull/70) CLOSED/SUPERSEDED** (не merge): `index.html` main уже отмечает восстановление автокопии только после успешного `writeMainIfUnchanged`; тесты ожидания, abort, commit, CAS уже есть. Никаких дублирующих исправлений.
- **Draft #469** остаётся открытым ради других, не перенесённых first-launch/QA возможностей. **Draft #452/#479** тоже остаются открытыми, требуют собственной проверки и физического recovery.

## Не снятые внешние ограничения

- **B01 P0 BLOCKED:** нет полной оригинальной внешней копии всех реальных данных OnePlus и доказанного независимого восстановления на пустой цели. Новый verifier подтверждает **только целостность отдельного файла**, который ещё нужно реально создать.
- **B04/B05 P0 BLOCKED:** нет фактического fingerprint установленного `ru.paseka.journal`, подконтрольного владельцу долговременного signing key, проверенного backup/rollback. `--installed-only` разработан, но физически не запускался. Прямое обновление рабочего APK запрещено до ворот.
- **B06/B10 / #442 FROZEN:** лицензированные веса, реальное распознавание пчёл, видеоконвейер, полный исходный файл и доказательное удаление отсутствуют; синтетические ONNX и JSON проверки этого не заменяют.
- **OP13 live execution BLOCKED:** v2 физический план/коммит находится в прежнем stacked Draft #461–#466, отсутствует в current main и не должен включаться без совместимости, профилей, local CAS и физического evidence. **B11** реальные офлайн-сценарии OnePlus NOT_VERIFIED.

## Следующее действие

1. Сверить Fast/Android/Governance нового main #504 и docs-only HEAD после merge; не выдавать отсутствующие Fast/Android запуски за PASS.
2. Для B01 при реальном доступе к внешнему экспортированному файлу выполнить **локальную** структурную проверку, затем независимо доказать восстановление; отдельно инвентаризировать Gallery/MediaStore и иные источники. Не загружать личный архив в чат/CI.
3. Для B04/B05 проверить installed APK signer только read-only при авторизованном устройстве; без доступа зафиксировать блокер, не повторять synthetic циклы.
4. Для OP13 рассмотреть новую main-based read-only модель двух веток, без прямого переноса старого `sw.js` v338, без активации в production и без физического подтверждения ИИ.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL.** Отдельное разрешение пользователя на безопасное слияние использовано; оно не доказывает выполнимость необратимой операции.
