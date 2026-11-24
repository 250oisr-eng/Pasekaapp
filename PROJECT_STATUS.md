# PROJECT_STATUS — Пасека 2.0

**25.11.2026, интеграция по отдельному разрешению пользователя.** Текущий подтверждённый main: `cb32d0ca8d72f9c4e8d57bb2d06d86a7b5cef237`. Источники и процесс: [AGENTS.md](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Это состояние исходного main при создании **docs-only** ветки; SHA и CI пересверять перед каждым merge.

## Реально объединено, а не только протестировано

- **#485 MERGED** → `023ad0dd09435ba9c26042b86f26b960f19dfe9a`: B01 пять тестов полной readonly-транзакции архива. Fast #45502702439, Governance #45502702437, Android #45502702424 — **SUCCESS** на точном main, без публикации.
- **#486 MERGED** → `731a0c80b758e574084d1af836f4c31df483ffe8`: B09 14 тестов existing malformed v3, transaction abort, openDB late events; первоначальный #483 CLOSED/SUPERSEDED. Fast #45503391689, Governance #45503391788, Android #45503391704 — **SUCCESS** на точном main.
- **#487 MERGED** → `4ae6b335582dff1d8957f594911cb03685034b81`: ограничение Cloudflare request body до JSON parse, 270000 UTF-8 bytes, тесты. Исходный #482 CLOSED/SUPERSEDED. Fast #45503589145, Governance #45503589120, Android #45503589237 — **SUCCESS**, Worker production NOT_DEPLOYED.
- **#488 MERGED** → `cb32d0ca8d72f9c4e8d57bb2d06d86a7b5cef237`: opt-in read-only legacy layout-body audit + 8 тестов; нет startup/save hooks. Исходный #484 CLOSED/SUPERSEDED. Fast #45503772232 SUCCESS, Governance #45503772297 SUCCESS; Android #45503772276 **PENDING, финальный результат проверить**.
- **#489 DRAFT / NOT_IN_MAIN**: безопасные версии Service Worker v318 и VM lifecycle tests. Старый #478 пока Draft; нельзя ставить/обновлять APK на OnePlus без backup+signer. 
- [#481](https://github.com/250oisr-eng/Pasekaapp/pull/481) read-only PR inventory и queue — ещё Draft. Shared docs не сливать поверх этого живого статуса без сверки.
- **Draft #469** B04 startup/signing и **Draft #452** full restore — НЕ ОБЪЕДИНЕНЫ. Пользовательское разрешение на интеграцию не является доказательством физического восстановления.

## Блокеры, которые кодовый CI не снял

**B01:** на OnePlus нет независимо подтверждённого полного внешнего архива/restore; старые приватные TAR некорректны. **B04/B05:** текущий установленный signer и долговременный signing key неизвестны. **B06/B10:** лицензированные веса, настоящий video pipeline и физическая media cleanup не доказаны; issue #442 **FROZEN**. B11 реальное холодное офлайн-открытие/апгрейд с сохранностью данных и P2 эксплуатационные метрики NOT_VERIFIED. Пользовательские архивы, IndexedDB, оригиналы видео и установленный APK не трогали.

## Следующая очередь

1. Проверить точный Android CI #488; затем #489 отдельный merge после exact-head CI и предыдущего main CI, без публикации.
2. Актуализировать этот docs-only статус после всех подтверждённых merge, проверить exact CI/Pages source на конечном main.
3. Продолжить B01 только безопасной read-only диагностикой до доказанного внешнего архива; запретить реальный restore/cleanup.
4. Опубликовать Pages/Cloudflare или менять production-данные **только отдельным безопасным release-процессом с проверенным SHA и необходимым backup/rollback**. Сам факт общей авторизации не превращает рискованную операцию в безопасную.
