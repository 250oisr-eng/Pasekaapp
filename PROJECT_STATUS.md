# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · last verified integration main `7d8af290cb9621ea7e83610a939dbceb19027b20`; verify live SHA before further work.** Фактический GitHub имеет приоритет; нормативные правила — [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## Текущий макроцикл PR — селективные исправления

- **#557, #558, #559, #560 MERGED:** B09 заблокированная IndexedDB миграция (test-only), Farrar 180/195 (test-only), read-only JSON family/hive coherence, GPS pesticide provenance. Exact PR-head Android CI SUCCESS #45877095034, #45877248236, #45877525614, #45877662641 соответственно. Последний main `7d8af290cb9621ea7e83610a939dbceb19027b20`.
- **Исторические #536, #42, #516, #44, #69 CLOSED/SUPERSEDED** с доказательствами в описаниях; ветки сохранены. #69 уже имеет закрытого потомка #70. [Полный отчёт этого цикла](docs/PR-AUDIT-CHECKPOINT-2026-11-26-C.md).
- Exact post-merge push CI на main **NOT_VERIFIED**; PR-triggered CI не заменяет проверку SHA слияния. 411-строчная инвентаризация — **исторический** снимок, не новый live count. Никаких production/OnePlus/video операций.

## Последний PR-макроцикл (verified actions)

- **#555 MERGED** squash `a92abaa5b35c1f1be2c87ee74335ea04a32439b8` (docs-only; exact PR HEAD Governance SUCCESS).
- **#535 MERGED** squash `71c658e64ed9a4e1442b15019b57b7c854752543` (debug APK CI provenance and NOT_FOR_ONEPLUS; source PR exact-head Fast, Android, Governance SUCCESS). Post-merge exact-main CI **NOT VERIFIED**; physical OnePlus signing/restore/upgrade remains BLOCKED.
- Full metadata inventory is a historical snapshot; **not** per-patch review or live PR census. [Detailed checkpoint](docs/PR-AUDIT-CHECKPOINT-2026-11-26-B.md). No mass merge, APK install, production release or video deletion.

## Текущая очередь после полного структурного аудита PR

- В исходном инвентаре было **417 открытых Draft PR**. Четыре подтверждённо замещённых — #425, #445, #446, #450 — CLOSED без слияния и без удаления веток. После последовательных проверенных слияний [#541](https://github.com/250oisr-eng/Pasekaapp/pull/541) и [#542](https://github.com/250oisr-eng/Pasekaapp/pull/542) осталось **411 OPEN: 53 непосредственно main, 358 зависимых; 69 с родителем вне открытого графа**. Все 411 имеют точные `changedPaths`, 1 069 уникальных путей. Полная [карта аудита](docs/PR-AUDIT-2026-11-26.md), [машинный реестр](docs/PR-AUDIT-INVENTORY-2026-11-26.json). Это не 411 полных semantic/code reviews.
- [#551](https://github.com/250oisr-eng/Pasekaapp/pull/551) и [#552](https://github.com/250oisr-eng/Pasekaapp/pull/552) MERGED: восстановлена поимённая опись и все пути файлов, без массовых merge. Главный риск — 192 PR старой архивной цепочки #168; не переписывать main историческим stacked diff.
- **#541 MERGED** `2330bf4243ea9ec8765dc110645dadfc02c283b3`: автономная SHA-256 сверка двух уже существующих локальных копий медиа, read-only. Exact-head Fast #45873304752, Governance #45873311752, Android #45873304778/#45873311714 SUCCESS.
- **#542 MERGED** `ca2c01edbd08ec6272a7adbe3949cbfd7d446d4f`: локальный ограниченный архивный аудит, replay только в новой `fake-indexeddb`, сравнение копий #541 и Windows offline-kit. Exact-head Fast #45873811121, Governance #45873819959, Windows #45873819943, Android #45873811098/#45873819940 SUCCESS. НИ ОДИН тест не доказывает независимый restore реальных данных OnePlus.
- **#553 MERGED** `a5fcde50472a4ef6f4f304949865d62cce883eb7`: изолированный Chromium E2E (мобильный и настольный сценарии: улей → семья → журнал → reload); Fast CI #45874950849 и Android #45874950845/#45874958477 прошли на PR SHA, E2E #45873925029 прошёл на исходном кодовом SHA. На merge SHA Fast #45875375812 SUCCESS; Chromium #45875375765 и Android #45875375725 требуют отдельного итогового подтверждения. Без реального OnePlus/production.
- **[#543](https://github.com/250oisr-eng/Pasekaapp/pull/543) DRAFT/FROZEN:** доступ к app-private через ADB, опциональный force-stop; прекратить повторные ADB/USB эксперименты по ранее принятому пользовательскому решению. Нельзя запускать на OnePlus, сливать в main либо выдавать TAR как доказательство recovery. Следующая независимая область — B04/B05 #535/#520/#519 или B09 #536, отдельно по F0–F7; B06 #539/#540 только проверка лицензий.

## Не снятые ворота

- **B01 P0 FROZEN:** нет независимого проверенного полного архива OnePlus / физического restore; новые #541/#542 — только локальные проверки уже существующих внешних файлов. Удаление, обновление APK и восстановление live данных запрещены.
- **B04/B05 P0 BLOCKED:** сертификат установленного приложения, владельческий signing key и безопасный rollback не доказаны. **Draft #469** не разрешает upgrade.
- **B06/B10 #442 FROZEN:** реальная лицензированная модель и PASEKA02 V0–V6 не доказаны; оригиналы видео не удалять. Защита #512 в main, не подтверждена на установленном APK.
- **B07 P1:** OP11–14 и sectional профиль не активировать без всех модулей/локальных валидаторов; **Draft #452** не является физически проверенным восстановлением.
- **B09/B11/P2:** CI и синтетические fake-indexeddb тесты не доказывают real OnePlus, cold offline, power loss, quota и память.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
