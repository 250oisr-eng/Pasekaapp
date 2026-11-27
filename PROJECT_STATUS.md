# PROJECT_STATUS — Пасека 2.0

**B08 / 28.11.2026 — structural evidence COMPLETE:** [176 merged-only](docs/PR-BRANCH-MERGEDONLY-REVIEW-2026-11-28.md) проверены относительно `main dcf8a7c...`: 39 ahead=0, 137 ahead>0 (54 docs / 12 tests / 41 runtime / 30 scripts+CI). 170 ранее оставшихся покрыты повторным аудитом всех 176; **semantic review 137 НЕ завершён**, удалений нет. Draft #653, новая проверка снимка и тест — CI для финального SHA проверять отдельно. Следующая очередь — #647 (включает CSV #633); #648/#651 только после анализа пересечений. No merge/release/production.

**27.11.2026 · UX merge `de04d1725e175adf00fcfda69e9b3c8aebb00b6b` (#643).** Перед merge всегда сверять актуальный SHA и CI. Правила: [AGENTS.md](AGENTS.md), [индекс](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/PR — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [метриках](docs/WORK-CYCLE-METRICS.json).

**UX:** #643 IN_MAIN; #646 DEVICE_USER_REPORTED_PASS 9/11, TalkBack NOT_TESTED. #648 исправления UI в Draft, не интегрированы. **#649 MERGED 27.11.2026**, доменная часть второго медового комплекта проверена в main по Git blob, но B07 sectional profile BLOCKED и устройство не проверено. #650 isolated QA built; никаких claims production.

**B03 · RESOLVED_INTEGRATION_SCOPE / IN_MAIN (#626 MERGED):** #472/#623 already merged; Fast/Android/Chromium/Governance PASS on `94f883be`; current main differs by docs-only commit, exact-main Governance PASS. Release history not independently verified; B01/B02/B04/B05/B11/B15 remain open. No production release or restore authorized.

**Учёт без видео [#627 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/627):** семейные ID, дата матки, откаты физических операций и защита от двойной записи медовой пары. Main `3f7ad4d7`: 1068/1068 Node и CI PASS. OnePlus/B07 отдельно.

**B08 #653:** 407 PR/674 ветки, 260 без open refs (176/61/23); 90 compare: 7 ahead=0/83 unique. 8 orphan bases, depth 143, dup #13/#14; 15 root PR→25 пересечений. #639→main. 1114/1114 Node на предыдущем SHA; новый CI pending. No delete/merge.

## План работ и журнал

[#621 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/621): фильтр по улью, выполненные работы и переход в журнал по взаимной связи taskId/completedRecordId. На `1a609a9e` 1072/1072 Node и CI PASS.

**[#625 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/625)** — техническая диагностика в разделе «Ещё»; exact main checks PASS, физический OnePlus отдельно.

## Основные интегрированные функции

- **#597–#599 MERGED:** первый внешний архив с read-only проверкой, история семьи и безопасные ссылки из поиска на записи/инвентарь. Полное независимое восстановление реальных данных ещё не доказано.
- **#603–#604 MERGED:** устранён overlap навигации, один AI-вход в навигации, три превью ульев и однокасательная новая запись из последних событий.
- **#609–#610 MERGED:** одно касание «Очистить» в глобальном поиске, Escape/фокус, aria-live статус числа результатов; 12 результатов и прежние ссылки не изменены. PR `b243e510`: Node **1021/1021**, Android/Chromium 11 viewport и search 320/390/768/Governance PASS.
- **#608/#611 MERGED:** постинтеграционный статус, история и метрики. Физические OnePlus/TalkBack не проверялись. Публикация не запускалась.

## Последняя интеграция и QA

- **#612 MERGED:** история выбранной семьи из поиска; runtime и Node/Android/Chromium/Governance были проверены на SHA PR, без физического OnePlus.
- **#613 MERGED:** изолированный `ru.paseka.journal.qa` APK; CI + бинарная идентичность проверены. От пользователя получены **DEVICE_CYCLE_1_USER_REPORTED_PASS (8/8)** и **CYCLE_2_USER_REPORTED_PASS (8/8)** на отдельной QA-песочнице. Реальный backup/restore, force-stop, power-loss, TalkBack — NOT_TESTED; production не изменён. [Подробности](docs/ONEPLUS-ISOLATED-QA-CURRENT-2026-11-27.md).

## Исторический внешний QA

- #617/#619 MERGED: проверка выбранного JSON и отдельный SAF QA `ru.paseka.journal.qa.archive`; ранее реальный JSON не появился. Подробности и SHA — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [протоколе SAF](docs/ONEPLUS-QA-SAF-ARCHIVE-2026-11-27.md). Внешний экспорт больше не является обязательным пользовательским путём локального B01. Установленные QA и production не изменены.

## Блокировки до физических доказательств

- **B01 P0 · #623 / IN_MAIN:** [два ZIP и одна кнопка](docs/B01-DAILY-TWO-ARCHIVES-2026-11-27.md). Код `70216c73`: Node **1054/1054**, Android build, Chromium restore + simulated background, Governance PASS. JobScheduler реализован. Изолированный QA #45993522131 PASS, [APK](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45993522131/artifacts/15193929646) до 04.12.2026; физический OnePlus/фон и большие ZIP >256 MiB не подтверждены. Draft #452 исторический. #479/#522/#543 CLOSED. B06/B10 не ослаблены.
- **B04/B05 P0 BLOCKED (Draft #469):** signer и совместимость обновления установленного Android APK, сохранение данных и rollback не доказаны. **Не устанавливать/обновлять производственный APK; установленный отдельный QA пакет не считать доказательством B04/B05.**
- **B06/B10 #442 FROZEN:** нет всех V0–V6 (права/лицензии весов, реальный видеоконвейер и GT, все копии, независимый restore). Автоудаление оригинальных видео запрещено.
- **B07 P1 BLOCKED:** секционный профиль/OP11–14 не активировать без полного набора физических моделей/валидаторов/миграций и сверки DOCX.
- **B09/B11/P2:** зелёный синтетический CI не доказывает настоящий offline, power-loss, storage quota и OnePlus.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_APK_REINSTALL / NO_PRODUCTION_APK_INSTALL / NO_MASS_MERGE.**
