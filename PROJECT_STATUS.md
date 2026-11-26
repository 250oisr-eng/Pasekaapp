# PROJECT_STATUS — Пасека 2.0

**26.11.2026 · последний проверенный main `e57279b6ca98df0cb99444618268efa5d3fe6eaa`.** Перед следующим действием проверить live GitHub. Нормативные правила — [AGENTS.md](AGENTS.md), [PROJECT-CONTROL.md](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md).

## Актуальный PR-портфель

- **397 OPEN на момент поимённого GitHub-снимка**: 39 исторически main-root, 358 stacked. Это не 397 полных code reviews и не перепроверка всех head SHA/CI. [Реестр](docs/PR-AUDIT-LIVE-CENSUS-2026-11-26-F.json), [последний audit checkpoint](docs/PR-AUDIT-CHECKPOINT-2026-11-26-F.md), [предыдущие этапы](docs/PR-AUDIT-CHECKPOINT-2026-11-26-D.md).
- **Последний завершённый кодовый этап:** #563 MERGED `5bbf634eeef5960e4a7e56c68d7598445ec616f0` (геометрия обмена корпусов, SW v321, Android CI #45878907609 SUCCESS после исправления трёх ошибок); #566 MERGED `3b42923c70ac808d41090f167a4747d865cf77b8` (регрессии истории рамок, Android #45879582136 SUCCESS); #567 MERGED `af22d2ba5d54ab07b89ab9276388406e4eda9cd3` (read-only legacy inventory, Android #45879689725 SUCCESS).
- **#568 MERGED** `4c0d9b9093ee613d2befcf05e7c5e4b6efb5c8c5` (Cloudflare Worker CI-триггеры и негативные тесты, Android #45880155202 SUCCESS; без Cloudflare deployment). Исторические #41/#52/#170/#175 CLOSED/SUPERSEDED без удаления веток. Ранее безопасно интегрированы #557–#562, #564; хронология и SHA — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md).
- **Не решено:** #60 legacy inspector REVIEW_REQUIRED, не заменять новый sectional inventory; остальные ~397 PR нельзя массово сливать или закрывать по именам/старому CI. Post-merge push CI на exact main SHA **NOT_VERIFIED**, реальные OnePlus тесты **NOT_TESTED**.

## Безопасность и активные ворота

- **B01 P0 FROZEN:** независимый полный архив и physical OnePlus restore не доказаны. **Draft #452** full IDB/restore не разрешает восстановление реальных данных, обновление APK или очистку.
- **B04/B05 P0 BLOCKED:** подпись установленной версии, долговременный ключ и безопасный rollback не доказаны. **Draft #469** не подтверждает безопасное обновление OnePlus.
- **B06/B10 #442 FROZEN:** лицензированный конкретный checkpoint, реальное обнаружение пчёл и IN/OUT, V0–V6 не доказаны. Исследования #539/#540 перенесены как альтернативы без готовой модели. Оригиналы видео не удалять.
- **B07 P1:** OP11–14 и sectional профиль не активировать без всех модулей, валидаторов, миграций, технологических источников и подтверждения пользователя.
- **B09/B11/P2:** тесты CI и эмулятора не доказывают реальный OnePlus, cold offline, power-loss, quota, recovery.

## Аудит G — работа после #569

- **P1 журнал:** [#570](https://github.com/250oisr-eng/Pasekaapp/pull/570) **MERGED** в `5abcf8e78e22cfeb3550cb2540955412740a64be`, code SHA `267253f55d166d34783cdfd4188f6933e9398e1f`, Android #45882313294 **SUCCESS 941/941**, Gradle APK SUCCESS. Подтверждена динамическая вместимость гнезда, зимовка, сохранение истории, текст/голос, SW v322; **IN_MAIN**, физические тесты устройства NOT_TESTED.
- **P0 первый запуск:** старый [#8](https://github.com/250oisr-eng/Pasekaapp/pull/8) выявил недостающий отдельный маркер предыдущего использования. При полном исчезновении IndexedDB `oldVersion=0` может выглядеть как безопасный первый запуск. Механизм B09 текущей базы не равен обнаружению **полной потери** базы; `deleteAllData` по-прежнему жёстко запрещён. Точный анализ и тестовый контракт: [checkpoint G](docs/PR-AUDIT-CHECKPOINT-2026-11-26-G.md). P0 **REVIEW_REQUIRED**, не копировать #8 целиком.
- Сначала завершить review #570, затем отдельный минимальный fail-closed first-launch guard. Не создавать параллельные патчи одного `index.html`.

## P0 первый запуск — текущая реализация в Draft

- [#570](https://github.com/250oisr-eng/Pasekaapp/pull/570) **MERGED** `5abcf8e78e22cfeb3550cb2540955412740a64be`; [#571](https://github.com/250oisr-eng/Pasekaapp/pull/571) **MERGED** `e57279b6ca98df0cb99444618268efa5d3fe6eaa` после разрешения пользователя.
- [#572](https://github.com/250oisr-eng/Pasekaapp/pull/572) **IMPLEMENTED_DRAFT / NOT_MERGED**: `localStorage`-маркер прежнего использования, обязательное подтверждение действительно первой пустой пасеки, жёсткий запрет reinit после пропажи IndexedDB, проверка durable primary до отметки; fail-closed для порчи/ошибок. Negative/fake-IDB, SW v323; [контракт](docs/КАРТОЧКА-P0-МАРКЕР-ПЕРВОГО-ЗАПУСКА-2026-11-26.md). **CI exact HEAD проверить в #572**, установленный OnePlus NOT_TESTED.
- Исторический #8 остаётся REVIEW_REQUIRED. Патч не даёт восстановления Blob/видео: B01, B06, B04/B05 остаются FROZEN/BLOCKED. Разрешение слияния #570/#571 **не** означает разрешение merge #572.

## Следующая работа

Разбирать оставшиеся независимые main-root PR по реальному SHA, уникальному diff и связанным регрессиям; затем постепенно распутывать stacked цепочки, сохраняя исходные ветки. Исправления — отдельные Draft PR с exact-head CI. Нельзя переписывать пользовательские данные или запускать production ради уменьшения счётчика PR.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
