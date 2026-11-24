# PROJECT_STATUS — Пасека 2.0

**2026-11-24.** Актуальный проверенный через GitHub `main=6b865fe0b338f360d763ce3d0599829b7c34dedc`. История — [журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md), безопасность — [AGENTS.md](AGENTS.md), действующие блокеры — [реестр](docs/РЕЕСТР-БЛОКЕРОВ.md).

## Главные факты

- **PR #472 MERGED:** read-only полный экспорт `paseka-v1`, SHA-проверка файла, B02 Blob guard и SW v316. Main merge SHA `9e3c76b...`: Fast #3995 и Android #7009 **SUCCESS**. Full live restore UI отсутствует.
- **PR #473 MERGED:** fail-closed отказ при отсутствующем `main/full_backup/entrance_media` без записи в пользовательскую базу. Main merge SHA `c20d0fc...`: Fast #3998 и Android #7013 **SUCCESS**. Полное legacy migration/rollback и физический restore B09 **NOT_VERIFIED**.
- **PR #471 MERGED:** оперативные правила, реестр B01–B15 и план физических испытаний. Code-free финальный main SHA `6b865fe0b338f360d763ce3d0599829b7c34dedc` **без отдельного CI run**: fast/Android workflows не слушают docs-only push, Governance Docs Checks на PR HEAD `a36eb74...` SUCCESS. Отсутствие run ≠ успешная проверка финального SHA.
- **Текущий Draft:** безопасный документационный CI на push `main`, без Pages/deploy и без прав записи, со статическим негативным тестом. До отдельного разрешения на merge этот механизм не работает в main.
- **Draft #469:** read-only audit signer OnePlus тестировался лишь с подменённым ADB; фактический signer UNKNOWN, долговременный защищённый ключ отсутствует. **Draft #452:** старый live restore не объединён. PASEKA02 **FROZEN #442**, лицензионные веса/реальный video/auto delete не подтверждены.

## Незавершённое

- B01 — нет внешнего полного файла, byte-proof и независимого restore; B04/B05 — нет реального signer/secure key; B06 — FROZEN; B07/B08/B13 — source-bound выборочная интеграция; B10/B11 — физические Android/offline испытания; B14 — реальные измерения; B15 — точная история release/Pages и docs-only main CI.
- [План снятия B01–B15](docs/P0-P2-ПЛАН-ЗАКРЫТИЯ-БЛОКЕРОВ-И-ДЕЙСТВИЯ-ПОЛЬЗОВАТЕЛЯ-2026-11-24.md) определяет минимум участия пользователя. При доступе к ПК — только read-only ADB, затем внешний архив и отдельный пустой target.

**Права:** новые PR разрабатываются автономно, но **слияние, публикация, APK install, production DB, восстановление/удаление оригиналов запрещены без отдельного разрешения**. Предыдущие разрешения #472/#473/#471 исполнены и не распространяются на новые PR.
