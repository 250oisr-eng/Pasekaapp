# PROJECT_STATUS — Пасека 2.0

**25.11.2026 — после разрешённого merge #485:** main `023ad0dd09435ba9c26042b86f26b960f19dfe9a`. Fast Quality #45502702439, Governance #45502702437, Android #45502702424 — завершены SUCCESS. Pages source проверен read-only, публикации не было.

## Текущий цикл интеграции
- [#485](https://github.com/250oisr-eng/Pasekaapp/pull/485) **MERGED**: 5 тестов завершения readonly-транзакции полного архива; B01 реальный backup/restore остаётся BLOCKED.
- Ветка `port/p1-b09-idb-read-gates-after485-2026-11-25`: точечный перенос тестов B09 из прежнего [Draft #483](https://github.com/250oisr-eng/Pasekaapp/pull/483) на новый main после пересечения PROJECT_STATUS/журнала. Перенесены `tests/idb-read-abort-and-malformed-v3.test.mjs` и тематический source-bound контракт; старый PR заменить после доказанного CI и отдельного merge.
- [Draft #482](https://github.com/250oisr-eng/Pasekaapp/pull/482) Cloudflare bounded body, [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) SW v318, [Draft #484](https://github.com/250oisr-eng/Pasekaapp/pull/484) diagnostic и [Draft #481](https://github.com/250oisr-eng/Pasekaapp/pull/481) интеграционный аудит остаются вне main.
- **Draft #469** signing/startup и **Draft #452** recovery — по-прежнему не объединены, не выдавать за проверенное обновление телефона.

## Блокеры и безопасность
B01 полный внешний архив и независимый restore НЕ ДОКАЗАНЫ. B04/B05 установленный signer/ключ НЕ ПОДТВЕРЖДЕНЫ. B06/B10 лицензированное распознавание и auto-cleanup **FROZEN #442**. Device offline upgrade и физический rollback не выполнялись. Нельзя публиковать Pages/Worker, удалять оригиналы или запускать восстановление рабочей базы до необходимого доказательства и отдельных физически безопасных ворот.

