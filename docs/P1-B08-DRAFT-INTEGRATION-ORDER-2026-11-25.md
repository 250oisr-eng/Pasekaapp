# P1 B08 — очередь независимых Draft PR и конфликты общих документов

**Дата:** 2026-11-25. **Live main:** `0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Сверено GitHub `compare_commits(main, draftBranch)` для #478, #482, #483, #484, #485. Это карта **выбора и рецензирования**, не разрешение merge/deploy и не доказательство работы на OnePlus.

## F0–F2: почему недопустим пакетный merge
Все пять независимых веток основаны на одном и том же main (GitHub compare: `behind_by=0`), но **каждая** редактирует `PROJECT_STATUS.md` и `docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md`. #478/#482/#483 дополнительно одновременно редактируют `docs/WORK-CYCLE-METRICS.json` и `docs/РЕЕСТР-БЛОКЕРОВ.md`. Это подтверждённое пересечение файлов, **не доказательство наличия git merge conflict** до попытки merge. Параллельное массовое объединение может затереть контрольные факты, поэтому выполнять лишь по одному после отдельного разрешения и проверки точного нового main SHA.

## Независимые функциональные изменения

| PR | Технический diff против main | Доступные доказательства | Рекомендуемая проверка |
|---|---|---|---|
| [#485](https://github.com/250oisr-eng/Pasekaapp/pull/485) P0 B01 | Только `tests/disaster-archive-read-abort.test.mjs` + docs | Тестовый SHA `7138509314067c6099230000665a31be1e7378fc`: Android #45501280912 и Governance #45501280889 **SUCCESS**, финальные docs CI уточнять | Изолированный non-runtime тест, не вводит live restore, наиболее безопасный кандидат для отдельного review |
| [#483](https://github.com/250oisr-eng/Pasekaapp/pull/483) P1 B09 | Только `tests/idb-read-abort-and-malformed-v3.test.mjs` + docs | HEAD `70ffada33a826b3d98a234083e866f633a96e296`: Android/Governance SUCCESS | Отдельный read-only regression, никакой IndexedDB schema change |
| [#482](https://github.com/250oisr-eng/Pasekaapp/pull/482) P1 B08 | `cloudflare/worker.js` + `tests/cloudflare-bounded-body.test.mjs` + docs | New tests at `59f423c96c4f63aa95bbdd3955e68cafc389c344`, Android #45501084489 + Governance #45501084529 SUCCESS on documented SHA `936ec4312e21011caa691550c2aca7f7dd46bee2` | Security change; проверить JWT/CORS/rate preservation; merge и **Cloudflare deploy** — разные разрешения |
| [#484](https://github.com/250oisr-eng/Pasekaapp/pull/484) P1 B08 | `js/equipment-inventory.js` + `tests/legacy-layout-body-reference-audit.test.mjs` + docs | Ранее финальный docs CI на `12b7de3d9f0bc6da88c502a46e089270dc75958c` SUCCESS | Новая read-only функция **не включена** в startup/save; не ужесточать legacy без миграционных доказательств |
| [#478](https://github.com/250oisr-eng/Pasekaapp/pull/478) P1 B11 | `sw.js` + `tests/regression.test.mjs` + `tests/service-worker-offline-lifecycle.test.mjs` + docs | New tests `7faf378cc09a3b6fd0c9bc73d7b57ebfd1c118bc`; Android #45501080070 и Governance #45501080586 SUCCESS on documented SHA `e3883bdffef8528184c5e8363d24f04c3117225a` | Нельзя обновлять установленный OnePlus/SW до проверенного B01 backup/restore+signer; нет разрешения release |

Число коммитов впереди main: #478 **42**, #482 **12**, #483 **14**, #484 **7**, #485 **7** на момент проверки. Это не число независимых изменений и не уровень риска.

## F3–F7: последовательность без технического долга

1. До начала интеграции подтвердить текущее состояние main, основание и **точный финальный SHA+CI** каждого кандидата; проверить полный semantic diff, не только зелёный CI.
2. Выделить **один** отдельный PR. Если после независимого разрешённого merge возникли конфликты статуса/журнала, свести их явно, не заменяя историю и контрольные блокеры. Повторить Node/Android/Governance CI на новом HEAD/main.
3. Разделить `CI_VERIFIED_EXACT_SHA`, `IN_MAIN`, `DEVICE_VERIFIED`, `RELEASED` и `RESTORE_VERIFIED`. Ни одно не следует автоматически из другого.
4. Приоритеты для **review**, не для самовольного merge: сначала тесты без runtime (#485/#483), затем Cloudflare security (#482), затем диагностическая функция (#484), затем lifecycle SW (#478) после обсуждения риска обновления. При внешних зависимостях не блокировать остальные независимые проверки.
5. Никогда не считать PR #485 заменой физической полной копии: B01/B04/B05 блокируют реальное обновление OnePlus, B06/B10 и auto-video cleanup FROZEN #442. Cloudflare Worker и GitHub Pages не публиковать без отдельного согласия.

**Статус:** DOCUMENTED / READ_ONLY_REVIEW / NO_MERGE / NO_DEPLOY / NO_DATA_MUTATION.
