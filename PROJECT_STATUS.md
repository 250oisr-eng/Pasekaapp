# PROJECT_STATUS — Пасека 2.0

**2026-11-25 — новая рабочая ветка B08.** Проверенный `main=0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`, текущая ветка `fix/p1-b08-legacy-body-ref-audit-2026-11-25`. Основные правила: [AGENTS](AGENTS.md), [PROJECT-CONTROL](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## Завершённая работа и очередной этап
- #471–#477 **MERGED**, включая read-only backup, IndexedDB safety, journal/Varroa rollback, SW v317; в main не публиковали.
- [Draft #483](https://github.com/250oisr-eng/Pasekaapp/pull/483) B09: расширен до 14 source-backed тестов read/abort/versionchange; Android и Governance на финальном docs SHA `70ffada33a826b3d98a234083e866f633a96e296` **SUCCESS**. **NOT_IN_MAIN, NO_REAL_RESTORE**.
- [Draft #481](https://github.com/250oisr-eng/Pasekaapp/pull/481) B08: полный read-only PR inventory, аудирован старый #60; code не включён в main.
- [Draft #478](https://github.com/250oisr-eng/Pasekaapp/pull/478) SW v318; [#480](https://github.com/250oisr-eng/Pasekaapp/pull/480) Cloudflare release gate; [#482](https://github.com/250oisr-eng/Pasekaapp/pull/482) ограничение размера AI request — подготовлены, NOT_IN_MAIN.
- **Текущий B08:** `PasekaInventory.auditLegacyLayoutBodyReferences` — чистая read-only диагностика `layout → bodies` с отличием legacy unregistered warning от повреждённой identity/ID; 8 synthetic tests, [контракт](docs/P1-B08-LEGACY-BODY-REFERENCE-READONLY-2026-11-25.md). Code/test `cf279f3895faed8a255c8577d9e7c30aa84abd9d` (runtime+tests), docs HEAD `8b89df2887a03ce97285a24fe6c73642a202e7eb`. **CI_VERIFIED_EXACT_SHA** на docs HEAD `6bd477bce1d3605f0c9e4c545499d90a53227cbe`: Governance #45500304207 и Android #45500304280 SUCCESS. Нет запуска в обязательном startup/save gate и нет изменения данных.

## Неразрешённые зависимости
- **B01:** OnePlus v315, app history survived offline/reboot; 4 известные synthetic ADB zero streams PASS, public TAR 1090 B INVALID; полный внешний backup/restore НЕ доказан, новые приватные capture запрещены до доказанного transport. 
- **Draft #469** startup/signing пока НЕ объединён; **Draft #452** full restore пока НЕ объединён. Не считать их безопасными для прямого merge.
- **B04/B05:** signer и долговременный ключ не подтверждены. **B06/B10:** реальная модель пчёл, видео и auto-cleanup **FROZEN #442**. Android cold offline/upgrade и performance физически NOT_VERIFIED.
- Следующее: провести exact-SHA CI текущего B08, исправить реальные ошибки, оставить Draft для ревью; затем продолжать P1 выборочно. **Запрещены** merge без отдельного разрешения, deployment/release, изменение production DB, запуск live restore, удаление оригиналов видео, установка APK на рабочий телефон.
