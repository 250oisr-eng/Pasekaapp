# PROJECT_STATUS — Пасека 2.0

**2026-11-24.** Live `main=6b865fe0b338f360d763ce3d0599829b7c34dedc` после отдельно разрешённых слияний #472/#473/#471. История — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md), оперативные B01–B15 — [реестр](docs/РЕЕСТР-БЛОКЕРОВ.md).

## Подтверждённое

- **#472 MERGED:** read-only полный архив `paseka-v1`, SHA проверки, B02 fail-closed и SW v316. CI merge `9e3c76b...`: Fast #3995 и Android #7009 SUCCESS. In-place live restore UI **отсутствует**.
- **#473 MERGED:** fail-closed проверка обязательных IDB stores, без миграции или очистки. CI merge `c20d0fc...`: Fast #3998, Android #7013 SUCCESS. Старые миграции и реальный backup/recovery NOT_VERIFIED.
- **#471 MERGED:** правила F0–F7, реестр блокеров, план внешних действий. Итоговый `main=6b865fe...` не получил CI run, поскольку docs-only main push не покрыт workflow; считать `NOT_VERIFIED`, не `FAIL`.
- **Draft #474:** безопасный Governance Docs workflow на docs-only main push и тест запрета публикации, CI SUCCESS на кодовом SHA `e17f2c15...`; новый docs-only HEAD проверить. Не merged.
- **Draft #475:** основной B13 journal/Varroa rollback и фильтр измерений выбранного улья. На SHA `a8e2afbaf10e070a198b60fbc01fb3289e7bd816` [Android #45469116241](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45469116241) **709/709 PASS, BUILD SUCCESSFUL**, [Governance #45469116177](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45469116177) SUCCESS. Последующие изменения только docs. `READY_FOR_MERGE_REVIEW / NOT_IN_MAIN`, физическая проверка NOT_VERIFIED.
- **Draft #469:** реальный signer установленного OnePlus UNKNOWN и защищённый постоянный key отсутствует. **Draft #452:** старый restore не merged. Video/auto delete **FROZEN #442**.

## Следующее

- Проверить exact-head CI #474 и #475, отдельное разрешение пользователя на возможное merge. Они оба обновляют статус, перед слиянием нужно согласовать docs и повторно проверить main/CI.
- B01/B04/B05/B06/B10/B11 — внешние независимые архив/устройство/веса/подпись; B07/B08 технологические PR и B13 journal требуют адресной интеграции, B14 — измерений, B15 — проверки release/Pages. Подробности — [план действий](docs/P0-P2-ПЛАН-ЗАКРЫТИЯ-БЛОКЕРОВ-И-ДЕЙСТВИЯ-ПОЛЬЗОВАТЕЛЯ-2026-11-24.md).

**Запреты:** без нового разрешения нельзя merge PR, публиковать, устанавливать APK, изменять production DB, восстанавливать или удалять оригиналы. Рабочий OnePlus не затронут.
