# PROJECT_STATUS — Пасека 2.0

**28.11.2026 · main `dcf8a7c5` (#649 IN_MAIN).** Перед merge всегда сверять актуальный SHA и CI. Правила: [AGENTS.md](AGENTS.md), [индекс](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/PR — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [метриках](docs/WORK-CYCLE-METRICS.json).

**UX:** #643 IN_MAIN; #646 owner DEVICE_USER_REPORTED_PASS 9/11, TalkBack/production NOT_TESTED. #648 1096/1096 Android/Chromium PASS; #650 QA built. **#649 IN_MAIN:** OP07/08, склад, UI, IndexedDB; 1101/1101 Node/Android/Chromium/Gov PASS, B07 BLOCKED. История — в журнале; релиз не выполнялся.

**B07 5 циклов (Draft):** #663 OP11 36 рамок/18 снятых, **1126/1126 Node + Android/Chromium/Gov PASS**; #664 OP13 перенос 1 корпуса / legacy 2 сохранён, **1103 PASS**; #662 OP12 физика↔событие, **1106 PASS**; #665 ранний мёд 2/4, **1115 PASS**; [#666](https://github.com/250oisr-eng/Pasekaapp/pull/666) independent synthetic IDB restore **1105 PASS**. Все Android/Gov PASS. Реальная запись OP11/13/14, backup OnePlus и B07 activation BLOCKED; нет merge/release.

**B03 IN_MAIN (#626):** #472/#623 интегрированы; Fast/Android/Chromium/Governance PASS на `94f883be`. B01/B02/B04/B05/B11/B15 ещё открыты; релиз и независимое восстановление не подтверждены.

**Учёт без видео [#627 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/627):** семейные ID, дата матки, откаты физических операций и защита от двойной записи медовой пары. Main `3f7ad4d7`: 1068/1068 Node и CI PASS. OnePlus/B07 отдельно.

## План работ и журнал

[#621 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/621): фильтр по улью, выполненные работы и переход в журнал по взаимной связи taskId/completedRecordId. На `1a609a9e` 1072/1072 Node и CI PASS.

**[#625 IN_MAIN](https://github.com/250oisr-eng/Pasekaapp/pull/625)** — техническая диагностика в разделе «Ещё»; exact main checks PASS, физический OnePlus отдельно.

## Основные интегрированные функции

- **#597–#599 MERGED:** первый внешний архив с read-only проверкой, история семьи и безопасные ссылки из поиска на записи/инвентарь. Полное независимое восстановление реальных данных ещё не доказано.
- **#603–#604 MERGED:** устранён overlap навигации, один AI-вход в навигации, три превью ульев и однокасательная новая запись из последних событий.
- **#609–#610 MERGED:** одно касание «Очистить» в глобальном поиске, Escape/фокус, aria-live статус числа результатов; 12 результатов и прежние ссылки не изменены. PR `b243e510`: Node **1021/1021**, Android/Chromium 11 viewport и search 320/390/768/Governance PASS.
- **#608/#611 MERGED:** постинтеграционный статус, история и метрики. Физические OnePlus/TalkBack не проверялись. Публикация не запускалась.

## Последняя интеграция и текущий QA-цикл

- **#612 MERGED:** история выбранной семьи открывается непосредственно из быстрого поиска (выборочный перенос старого #600); устаревшие/перенесённые/неоднозначные ID блокируются. Squash main `14b398c97354800062b170e835a97bf7c76b7eb5`. PR code+docs head `4ab891f3c7cfbf26dc4feffc1499f23686c8b560`: Node **1023/1023**, Android build SUCCESS (#45967365737), Chromium E2E mobile/desktop SUCCESS (#45967366165), Governance SUCCESS (#45967365751). Реальные данные не изменены.
- **#613 MERGED / BINARY_PROOF:** отдельный тестовый APK `ru.paseka.journal.qa` с собственным sandbox, без изменения рабочего `ru.paseka.journal`. Main `ab1be71add0e16b20eb47c7a1eaf585411039a46`. CI PR exact source SHA `acd35f567d87c640f2eb620312679cb981d2305f`: **1027/1027 Node**, Android debug build + [isolated QA #45967904156](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45967904156) SUCCESS, Governance SUCCESS. Проверены aapt package ID, apksigner fingerprint и APK SHA256 `e0651987d176e6a45f6a03b2ae2c39f613a9725463942d5583f63b49158eeca6`. QA artifact ID `15183717921`, expires 04.12.2026. **DEVICE_CYCLE_1_USER_REPORTED_PASS (8/8):** пользователь сообщил об успешной установке отдельного QA, пустой стартовой пасеке, навигации 4–3–4 без наложений, доступе к разделам/ИИ, Back/сворачивании и повороте; рабочее приложение и данные не изменились по наблюдению пользователя. **Не независимая техническая аттестация.** **DEVICE_CYCLE_2_USER_REPORTED_PASS (8/8):** тестовый улей/семья/наблюдение, поиск истории, возврат, reopen, авиарежим и отсутствие дубликатов сообщены PASS. Не доказывает force-stop/power-loss/restore. TalkBack и яркий свет NOT_TESTED. [Аппаратный протокол](docs/ONEPLUS-ISOLATED-QA-CURRENT-2026-11-27.md). Код/production-данные не изменены.

## Исторический внешний QA

- #617/#619 MERGED: проверка выбранного JSON и отдельный SAF QA `ru.paseka.journal.qa.archive`; ранее реальный JSON не появился. Подробности и SHA — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [протоколе SAF](docs/ONEPLUS-QA-SAF-ARCHIVE-2026-11-27.md). Внешний экспорт больше не является обязательным пользовательским путём локального B01. Установленные QA и production не изменены.

## Блокировки до физических доказательств

- **B01 P0 · #623 / IN_MAIN:** [два ZIP и одна кнопка](docs/B01-DAILY-TWO-ARCHIVES-2026-11-27.md). Код `70216c73`: Node **1054/1054**, Android build, Chromium restore + simulated background, Governance PASS. JobScheduler реализован. Изолированный QA #45993522131 PASS, [APK](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45993522131/artifacts/15193929646) до 04.12.2026; физический OnePlus/фон и большие ZIP >256 MiB не подтверждены. Draft #452 исторический. #479/#522/#543 CLOSED. B06/B10 не ослаблены.
- **B04/B05 P0 BLOCKED (Draft #469):** signer и совместимость обновления установленного Android APK, сохранение данных и rollback не доказаны. **Не устанавливать/обновлять производственный APK; установленный отдельный QA пакет не считать доказательством B04/B05.**
- **B06/B10 #442 FROZEN:** нет всех V0–V6 (права/лицензии весов, реальный видеоконвейер и GT, все копии, независимый restore). Автоудаление оригинальных видео запрещено.
- **B07 P1 BLOCKED:** OP11 запись, OP13 перенос/дополнительные корпуса, OP14 и полный backup/restore не доказаны; профиль не активировать.
- **B09/B11/P2:** зелёный синтетический CI не доказывает настоящий offline, power-loss, storage quota и OnePlus.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_APK_REINSTALL / NO_PRODUCTION_APK_INSTALL / NO_MASS_MERGE.**
