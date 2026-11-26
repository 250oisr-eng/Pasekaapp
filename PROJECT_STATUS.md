# PROJECT_STATUS — Пасека 2.0

## PR-аудит I · 26.11.2026 (после merge #573)

- **Live main** перед рабочим циклом: `c2d6d805a2b08c46560d99e7e2e6cd39cb7bde92` (audit #573 IN_MAIN, Governance exact-head SUCCESS). Ранее записанные ниже SHA и статусы PR — исторические, не брать за live.
- **#60 CLOSED/SUPERSEDED без merge:** обнаруженная старая проблема `layout.corpusIds` решена независимым read-only `auditLegacyLayoutBodyReferences` + проверками недостающих, пустых и неописанных корпусов. Старая замена `inspect()` могла нарушить legacy-совместимость.
- **#534 OPEN / REVIEW_REQUIRED:** на `a8ab152c44e64617f0b7714c06f47bd51e6d5e9c` три CI SUCCESS (Governance #45690879408, Android #45690879512, isolated synthetic Android restore #45690879551), но physical полный backup/restore реальной пасеки **NOT_VERIFIED**, нет основания повторять synthetic test cycle или объявлять B01 снятым.
- **#7 OPEN / PRESERVE_SOURCE:** уникальный исторический аудит резервного копирования отсутствует по старому пути в main; перенос устаревших фактов напрямую запрещён, требуется отдельная выверка.
- **#533 OPEN / DOCS_RECONCILE:** исторический snapshot 25.11 и WIP/STOP-критерии; не вносить старый PROJECT_STATUS/блокеры поверх main. Следующий безопасный цикл — выборочный перенос действительно недостающих правил или другой независимой функции после проверки исходного кода/CI.
- PR-счётчики из GitHub Search не считаются исчерпывающими (прямой #516 отсутствовал в поисковом snapshot). Не утверждать полный аудит всех патчей или полное закрытие портфеля; ветки сохранять, mass merge запрещён. **NO_RELEASE / NO_PRODUCTION / NO_MEDIA_DELETE / NO_ONEPLUS_INSTALL.**

## PR-аудит H · 26.11.2026 (рабочий Draft, не интегрирован)

- Проверенный live `main=d812bfa46e28ec418a1f6ca1a958ecccd445160d` после разрешённого merge #572. Индексированный GitHub-поиск: 397 уникальных OPEN до очистки; 396 после #8/#516 CLOSED. **Поиск не абсолютный полный реестр:** #516 был OPEN при прямой проверке, но отсутствовал в обеих поисковых описях. Текущие числа требуют сверки с независимой пагинацией перед статистическими решениями.
- #8 CLOSED/SUPERSEDED_UNSAFE: старый код разрешал разрушительный IndexedDB reset; безопасный маркер первого запуска уже #572 IN_MAIN. #516 CLOSED/SUPERSEDED: live script/tests уже содержат весь уникальный read-only cross-hive preflight; устаревшие ветки не merge, не удалены.
- Точечные предупреждения размещены в #60 (physical inventory), #533 (governance), #516. 38 historically main-based и 358 stacked в поисковом snapshot без #8. Это **не** 396 semantic reviews; детали: [checkpoint H](docs/PR-AUDIT-CHECKPOINT-2026-11-26-H.md).
- Следующее: независимо перепроверить полный PR membership; затем поштучно root diff → источник, актуальный main, точный CI, безопасность; stacked — только после родительских цепочек. B01/B04/B05/#442/B07 остаются без новых разрешений на physical/user-data/release.

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

## Аудит G — подтверждённая история

- Журнал #570 интегрирован, первоначальный P0-разбор #8 сохранён в [audit G](docs/PR-AUDIT-CHECKPOINT-2026-11-26-G.md). Последующая реализация P0 приведена ниже; исторический #8 не сливали.

## P0 первый запуск — текущая реализация в Draft

- [#570](https://github.com/250oisr-eng/Pasekaapp/pull/570) **MERGED** `5abcf8e78e22cfeb3550cb2540955412740a64be`; [#571](https://github.com/250oisr-eng/Pasekaapp/pull/571) **MERGED** `e57279b6ca98df0cb99444618268efa5d3fe6eaa` после разрешения пользователя.
- [#572](https://github.com/250oisr-eng/Pasekaapp/pull/572) **IMPLEMENTED_DRAFT / NOT_MERGED**: `localStorage`-маркер прежнего использования, обязательное подтверждение действительно первой пустой пасеки, жёсткий запрет reinit после пропажи IndexedDB, проверка durable primary до отметки; fail-closed для порчи/ошибок. Negative/fake-IDB, SW v323; [контракт](docs/КАРТОЧКА-P0-МАРКЕР-ПЕРВОГО-ЗАПУСКА-2026-11-26.md). **CI exact HEAD проверить в #572**, установленный OnePlus NOT_TESTED.
- Исторический #8 остаётся REVIEW_REQUIRED. Патч не даёт восстановления Blob/видео: B01, B06, B04/B05 остаются FROZEN/BLOCKED. Разрешение слияния #570/#571 **не** означает разрешение merge #572.

## Следующая работа

Разбирать оставшиеся независимые main-root PR по реальному SHA, уникальному diff и связанным регрессиям; затем постепенно распутывать stacked цепочки, сохраняя исходные ветки. Исправления — отдельные Draft PR с exact-head CI. Нельзя переписывать пользовательские данные или запускать production ради уменьшения счётчика PR.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
