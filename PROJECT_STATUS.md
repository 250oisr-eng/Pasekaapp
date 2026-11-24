# PROJECT_STATUS — Пасека 2.0

**2026-11-24.** Live `main=6b865fe0b338f360d763ce3d0599829b7c34dedc` после отдельно разрешённых merges #472, #473, #471. Точные исторические доказательства — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md), условия — [реестр](docs/РЕЕСТР-БЛОКЕРОВ.md).

## Подтверждено

- **PR #472 MERGED:** read-only полный архив IndexedDB, SHA-проверка файла, fail-closed защита существующих Blob и SW v316. Fast #3995/Android #7009 PASS на main SHA `9e3c76b...`. **Нет live restore UI.**
- **PR #473 MERGED:** отказ при неполной IDB v3 без изменения данных. Fast #3998/Android #7013 PASS на main SHA `c20d0fc...`. B09 физическое восстановление не подтверждено.
- **PR #471 MERGED:** регламент и B01–B15; окончательный docs-only main SHA `6b865fe...` **не имел собственного CI run**, потому что workflow filter не включал docs-only push.
- **Draft #474:** read-only Governance Docs push-main gate, CI SUCCESS на SHA `9cd45a3...`; ещё не в main.
- **Draft #475:** B13 Varroa journal rollback/selected-hive UI; Android **709/709 PASS** и Governance SUCCESS на HEAD `ace5993909879615db7b16083775c3f17089c78e`; ещё не merged.
- **Draft #476:** тесты B09 реальных синтетических IndexedDB v1/v2→v3, неизменности Blob/ArrayBuffer/истории и отказа v4. Кодовый SHA `a06de48dd117973d0ba66b7dc4573d15e2979080`: [Android #45470298315](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45470298315) **698/698 PASS, BUILD SUCCESSFUL**, [Governance #45470298335](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45470298335) SUCCESS. Только тесты и документы; не merged.

## Внешние ограничения

- **B01:** внешний архив/независимый restore NOT_VERIFIED. **Draft #452** старый live restore не merged.
- **B04/B05:** реальный installed OnePlus signer/долгоживущий защищённый key неизвестны; **Draft #469** лишь mock-ADB.
- **B06:** real bee recognition и auto-delete **FROZEN #442**, лицензии/оригиналы/V0–V6 недоказаны.
- **B07/B08/B13:** не объединять старые stacked PR без source-bound проверки; **B10/B11** физические Android/offline тесты, **B14** эксплуатационные измерения, **B15** полный Pages audit не закрыты.

**Следующее:** проверить CI на final docs HEAD #476, затем только при отдельном разрешении последовательно согласовать и объединить конкретные PR #474/#475/#476, проверяя новый main и CI после каждого. Не использовать старые разрешения #472/#473/#471 повторно.

**Запреты:** без отдельного разрешения запрещены merge, publish/release, APK install, изменение production-базы, реальное restore и удаление оригиналов. Текущий OnePlus не тронут.
