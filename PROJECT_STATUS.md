# PROJECT_STATUS — Пасека 2.0

**28.11.2026 · [#647 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/647)** `31fdfe86`: повседневный учёт, офлайн-экспорт, изолированный OP02, runtime assets и npm lock; exact HEAD `8a221bc7`, Node 1153/1153, Fast/Android/Chromium/3 QA/Gov 7/7 PASS. Дерево merge совпало с проверенным HEAD. 100/100 pinned deps reachable. [Аудит](docs/PR-BRANCH-DEPENDENCY-AUDIT-2026-11-28.md). Без удаления веток, релиза или активации B07.

**27.11.2026 · UX merge `de04d1725e175adf00fcfda69e9b3c8aebb00b6b` (#643).** Перед merge всегда сверять актуальный SHA и CI. Правила: [AGENTS.md](AGENTS.md), [индекс](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/PR — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [метриках](docs/WORK-CYCLE-METRICS.json).

**UX:** #643 IN_MAIN 1085/1085; #646 owner DEVICE_USER_REPORTED_PASS 9/11, TalkBack/production unchanged NOT_TESTED. #648 IN_MAIN `a7fcf2f1`, exact 1157/1157 + Chromium/Android/Gov/Workers PASS; #650 QA only. #651 согласован с main, CI pending. **#649 IN_MAIN** (`dcf8a7c5`): OP07/08 секционный медосбор, атомарное сохранение и проверки. На точном main Fast/Android/Chromium/Governance SUCCESS. B07 profile gate остаётся BLOCKED; данные пользователя не затронуты. No release.

**B03 · RESOLVED_INTEGRATION_SCOPE / IN_MAIN (#626 MERGED):** #472/#623 already merged; Fast/Android/Chromium/Governance PASS on `94f883be`; current main differs by docs-only commit, exact-main Governance PASS. Release history not independently verified; B01/B02/B04/B05/B11/B15 remain open. No production release or restore authorized.

**Учёт без видео [#627 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/627):** семейные ID, дата матки, откаты физических операций и защита от двойной записи медовой пары. Main `3f7ad4d7`: 1068/1068 Node и CI PASS. OnePlus/B07 отдельно.

## План работ и журнал

**#668 CSV period review:** сводка событий по всем ульям и типам CSV, без медиа и без изменения базы. `main=1c6c50d0`, точный HTML перенос двух фрагментов; Node/Android/Governance/Chromium требуются на новом SHA.



**#659 integration review:** медоносы, наблюдения, фильтры по годам и стадиям, полная история. Точечно перенесено 2 HTML-ханка с сохранением новых защит инвентаря и архива; exact CI ожидается. Не автоматизирует физические действия.



**#661 inventory reconciliation:** база `e94111aa`, защита карточки/повторной регистрации корпуса и 5 регрессий, никаких правок пользовательских записей. Exact SHA CI PENDING; OnePlus NOT_TESTED.



**#647 IN_MAIN:** интеграция с #649 проверена; аудит 671 ветка / 404 PR / 351 stacked; без массовых операций. Следующие #648/#651 требуют согласования с новым main.

[#621 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/621): фильтр по улью, выполненные работы и переход в журнал по взаимной связи taskId/completedRecordId. На `1a609a9e` 1072/1072 Node и CI PASS.

**[#625 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/625)** — техническая диагностика в разделе «Ещё»; exact main checks PASS, физический OnePlus отдельно.

## Основные интегрированные функции

- **#597–#599 MERGED:** первый внешний архив с read-only проверкой, история семьи и безопасные ссылки из поиска на записи/инвентарь. Полное независимое восстановление реальных данных ещё не доказано.
- **#603–#604 MERGED:** устранён overlap навигации, один AI-вход в навигации, три превью ульев и однокасательная новая запись из последних событий.
- **#609–#610 MERGED:** одно касание «Очистить» в глобальном поиске, Escape/фокус, aria-live статус числа результатов; 12 результатов и прежние ссылки не изменены. PR `b243e510`: Node **1021/1021**, Android/Chromium 11 viewport и search 320/390/768/Governance PASS.
- **#608/#611 MERGED:** постинтеграционный статус, история и метрики. Физические OnePlus/TalkBack не проверялись. Публикация не запускалась.

## Текущие проверенные QA-сценарии

- **#612 IN_MAIN:** переход из быстрого поиска в историю семьи с проверкой неоднозначных ID; Node 1023/1023, Android/Chromium/Governance SUCCESS на историческом SHA. Подробные SHA и ссылки в журнале.
- **#613 IN_MAIN / BINARY_PROOF:** отдельный `ru.paseka.journal.qa` sandbox; CI PASS на точном историческом SHA. Владелец сообщил два физических цикла 8/8 и 8/8, но независимая техническая аттестация, TalkBack, power-loss и реальное восстановление не проверены. [Аппаратный протокол](docs/ONEPLUS-ISOLATED-QA-CURRENT-2026-11-27.md).

## Исторический внешний QA

- #617/#619 MERGED: проверка выбранного JSON и отдельный SAF QA `ru.paseka.journal.qa.archive`; ранее реальный JSON не появился. Подробности и SHA — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [протоколе SAF](docs/ONEPLUS-QA-SAF-ARCHIVE-2026-11-27.md). Внешний экспорт больше не является обязательным пользовательским путём локального B01. Установленные QA и production не изменены.

## Блокировки до физических доказательств

- **B01 P0 · #623 / IN_MAIN:** [два ZIP и одна кнопка](docs/B01-DAILY-TWO-ARCHIVES-2026-11-27.md). Код `70216c73`: Node **1054/1054**, Android build, Chromium restore + simulated background, Governance PASS. JobScheduler реализован. Изолированный QA #45993522131 PASS, [APK](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45993522131/artifacts/15193929646) до 04.12.2026; физический OnePlus/фон и большие ZIP >256 MiB не подтверждены. Draft #452 исторический. #479/#522/#543 CLOSED. B06/B10 не ослаблены.
- **B04/B05 P0 BLOCKED (Draft #469):** signer и совместимость обновления установленного Android APK, сохранение данных и rollback не доказаны. **Не устанавливать/обновлять производственный APK; установленный отдельный QA пакет не считать доказательством B04/B05.**
- **B06/B10 #442 FROZEN:** нет всех V0–V6 (права/лицензии весов, реальный видеоконвейер и GT, все копии, независимый restore). Автоудаление оригинальных видео запрещено.
- **B07 P1 BLOCKED:** секционный профиль/OP11–14 не активировать без полного набора физических моделей/валидаторов/миграций и сверки DOCX.
- **B09/B11/P2:** зелёный синтетический CI не доказывает настоящий offline, power-loss, storage quota и OnePlus.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_APK_REINSTALL / NO_PRODUCTION_APK_INSTALL / NO_MASS_MERGE.**
