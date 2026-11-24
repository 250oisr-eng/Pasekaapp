# PROJECT_STATUS — Пасека 2.0

**2026-11-25.** Live `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Основные правила: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [стратегия F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). История — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).

## Фактическое состояние

- #471–#477 **MERGED**, включая read-only архив, защиты IndexedDB, Varroa/journal, SW `paseka-shell-v317`. На exact-main: Fast #45476750153, Android #45476750242, Governance #45476750196 — **SUCCESS**. **Без публикации**.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) — активная безопасная P1-задача B11: в `sw.js` v318 удаление **только старых численно версионных shell-кешей**, защита одноимённых пользовательских/будущих кешей; актуализированы VM lifecycle, regression checks и [контракт](docs/P1-B11-SW-CACHE-OWNERSHIP-2026-11-25.md). Код и тесты **не в main**. Предыдущий точный code+test SHA `8784b15ae89b8449370681020a92eed43308db41`: Fast #45493963043 SUCCESS, Android и новый docs HEAD проверить на точном SHA. Не объединять без отдельного согласия.
- [Draft #479](https://github.com/250oisr-eng/Pasekaapp/pull/479) — отдельная цепочка P0 B01, **никаких новых испытаний с ПК сейчас** (пользователь временно без ПК); не смешивать изменения веток. Установленный OnePlus NE2213 Android 16: `ru.paseka.journal` v1.0, APK SHA-256 `a6e14157fcdce06885cb8c6a5ad55c8a76170c3fa4cefa234b1715d80865aec6`, встроенный SW v315; улей, семья и две заметки сохранились при двух офлайн-открытиях и нескольких перезагрузках. Активный SW, signer и upgrade НЕ ПРОВЕРЕНЫ.
- B01: две приватные попытки TAR на Windows **НЕВАЛИДНЫ**, не восстанавливать, не удалять. Физический синтетический ADB V6: четыре точных передачи нулей plain/run-as PASS, но публичный TAR 1090 байт не кратен 512, `BLOCKED`; старый host ADB `1.0.32`. Пакет V7 для отдельной проверки современной версии **NOT_TESTED** и отложен до доступа к ПК. Полный backup/restore не доказан.

## Следующие условия и безопасность

- **B11 v315→v318 upgrade BLOCKED:** независимо проверенный полный backup+restore и signer/rollback, пользовательское отдельное разрешение на merge и отдельно на install/release. Баг удаления чужих кешей предотвращается **только в Draft #478**, не на установленном телефоне.
- **Draft #469** startup/signing gate и **Draft #452** полный restore остаются NOT_IN_MAIN; B04/B05 signer/долгоживущий ключ **NOT_VERIFIED**; B06/B10 real bee model/video cleanup [#442](https://github.com/250oisr-eng/Pasekaapp/issues/442) **FROZEN**; прочие B-ID — [реестр](docs/РЕЕСТР-БЛОКЕРОВ.md).
- Следующий безопасный шаг без ПК: закончить code/negative/Android CI именно для B11 Draft #478, обновить PR evidence. **Запрещены без отдельного разрешения:** merge, production deployment, APK update/install, restore, clear/uninstall, удаление видео и пользовательских данных. Ни green CI, ни синтетика не доказывают физическую миграцию.

- **Параллельный цикл 25.11 / B11:** к `tests/service-worker-offline-lifecycle.test.mjs` добавлено 2 негативных теста deletion rejection и cache-name lookalikes на code SHA `7faf378cc09a3b6fd0c9bc73d7b57ebfd1c118bc`. Governance на этом SHA SUCCESS, Android exact final SHA требует отдельной сверки. `sw.js` не менялся; OnePlus v315→v318 upgrade по-прежнему BLOCKED.

- **Финальная сверка параллельного B11:** HEAD `e3883bdffef8528184c5e8363d24f04c3117225a`, Android #45501080070 completed/SUCCESS, Governance #45501080586 completed/SUCCESS. Вся новая проверка синтетическая; установочный SW/телефон не обновлялись; PR #478 остаётся Draft, NOT_IN_MAIN. Следующий docs-only SHA также требует собственной сверки CI.
