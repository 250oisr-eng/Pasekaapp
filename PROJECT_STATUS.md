# PROJECT_STATUS — Пасека 2.0

**27.11.2026 · verified main `eda81f8ffbf7491dba7b973373248f28cf19450a` after approved #619.** Перед merge всегда сверять актуальный SHA и CI. Правила: [AGENTS.md](AGENTS.md), [индекс](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/PR — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [метриках](docs/WORK-CYCLE-METRICS.json).

## Основные интегрированные функции

- **#597–#599 MERGED:** первый внешний архив с read-only проверкой, история семьи и безопасные ссылки из поиска на записи/инвентарь. Полное независимое восстановление реальных данных ещё не доказано.
- **#603–#604 MERGED:** устранён overlap навигации, один AI-вход в навигации, три превью ульев и однокасательная новая запись из последних событий.
- **#607 MERGED:** единая на всех вкладках сотовая навигация **4–3–4**, соприкасающиеся шестиугольники, 11 маршрутов, центральная пчела в профиль без надписи на голубом радиальном фоне; доступное имя AI сохранено. PR `49f85367`: Node **1017/1017**, Android/Chromium 11/11/Governance PASS.
- **#609–#610 MERGED:** одно касание «Очистить» в глобальном поиске, Escape/фокус, aria-live статус числа результатов; 12 результатов и прежние ссылки не изменены. PR `b243e510`: Node **1021/1021**, Android/Chromium 11 viewport и search 320/390/768/Governance PASS.
- **#608/#611 MERGED:** постинтеграционный статус, история и метрики. Физические OnePlus/TalkBack не проверялись. Публикация не запускалась.

## Последняя интеграция и текущий QA-цикл

- **#612 MERGED:** история выбранной семьи открывается непосредственно из быстрого поиска (выборочный перенос старого #600); устаревшие/перенесённые/неоднозначные ID блокируются. Squash main `14b398c97354800062b170e835a97bf7c76b7eb5`. PR code+docs head `4ab891f3c7cfbf26dc4feffc1499f23686c8b560`: Node **1023/1023**, Android build SUCCESS (#45967365737), Chromium E2E mobile/desktop SUCCESS (#45967366165), Governance SUCCESS (#45967365751). Реальные данные не изменены.
- **#613 MERGED / BINARY_PROOF:** отдельный тестовый APK `ru.paseka.journal.qa` с собственным sandbox, без изменения рабочего `ru.paseka.journal`. Main `ab1be71add0e16b20eb47c7a1eaf585411039a46`. CI PR exact source SHA `acd35f567d87c640f2eb620312679cb981d2305f`: **1027/1027 Node**, Android debug build + [isolated QA #45967904156](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45967904156) SUCCESS, Governance SUCCESS. Проверены aapt package ID, apksigner fingerprint и APK SHA256 `e0651987d176e6a45f6a03b2ae2c39f613a9725463942d5583f63b49158eeca6`. QA artifact ID `15183717921`, expires 04.12.2026. **DEVICE_CYCLE_1_USER_REPORTED_PASS (8/8):** пользователь сообщил об успешной установке отдельного QA, пустой стартовой пасеке, навигации 4–3–4 без наложений, доступе к разделам/ИИ, Back/сворачивании и повороте; рабочее приложение и данные не изменились по наблюдению пользователя. **Не независимая техническая аттестация.** **DEVICE_CYCLE_2_USER_REPORTED_PASS (8/8):** тестовый улей/семья/наблюдение, поиск истории, возврат, reopen, авиарежим и отсутствие дубликатов сообщены PASS. Не доказывает force-stop/power-loss/restore. TalkBack и яркий свет NOT_TESTED. [Аппаратный протокол](docs/ONEPLUS-ISOLATED-QA-CURRENT-2026-11-27.md). Код/production-данные не изменены.

## Аппаратный цикл 3 — JSON не создан на устройстве (FAIL)

- **USER_REPORTED_FAIL:** размер найденного неопознанного файла ≈330000 байт, `Unexpected token 'P', "PK"...is not valid JSON`; затем пользователь подтвердил, что настоящий `paseka-full-idb-*.json` **отсутствует**. Архив **НЕ сохранён/не проверен**, SHA и копия NOT_TESTED. Не удалять ZIP или данные, не переустанавливать QA. B01 остаётся BLOCKED.
- **#617 MERGED:** ZIP PK/не-JSON теперь отклоняются до парсинга, Node 1032/1032, Android/Chromium/Governance PASS; в установленном QA этого исправления нет. **Корневая причина — Blob `a.download` не гарантирует Android WebView запись**, скачивание физически не подтверждено.
- **#619 MERGED / BINARY_PROOF:** отдельный `ru.paseka.journal.qa.archive`, системный Android `ACTION_CREATE_DOCUMENT` с посегментной передачей и SHA readback; не обновляет старую QA или production. Точный PR SHA `ad8f183893de7eadfa3f4f696906fafb1948af81`: **1038/1038 Node PASS**, Android build SUCCESS (#45975935822), отдельный SAF QA APK SUCCESS (#45975935838), Governance SUCCESS (#45975935844). CI проверил package/apksigner/SHA. APK SHA256 `83ce0f45cd57acc81f3fd5368b7e13cc8db3057221124b536147336d429ef4d6`; GitHub artifact ID `15187042938` (до 04.12.2026). **DEVICE_NOT_TESTED:** подтверждение файлового диалога, сохранения и повторного чтения на OnePlus отсутствует. Старый QA с данными сохраняется; новую QA нужно испытать с новой синтетикой. [Протокол](docs/ONEPLUS-QA-SAF-ARCHIVE-2026-11-27.md).

## Блокировки до физических доказательств

- **#596 P1 / DEVICE_CYCLE_1_USER_REPORTED_PASS:** геометрия 4–3–4, переходы, Back, поворот и первый запуск на OnePlus — PASS по отчёту пользователя 8/8 от 27.11.2026; TalkBack, перчатки, яркое солнце и длительная эксплуатация отдельно NOT_TESTED.
- **B01 P0 · новый локальный scope / IMPLEMENTED_DRAFT:** [два ежедневных ZIP и одна кнопка](docs/B01-DAILY-TWO-ARCHIVES-2026-11-27.md), ветка `feat/b01-two-daily-archives`; старый Draft #452 не является пользовательским путём. CI/Android/физическое восстановление ещё не подтверждены. B06/B10 и ограничения оригиналов не ослаблены.
- **B04/B05 P0 BLOCKED (Draft #469):** signer и совместимость обновления установленного Android APK, сохранение данных и rollback не доказаны. **Не устанавливать/обновлять производственный APK; установленный отдельный QA пакет не считать доказательством B04/B05.**
- **B06/B10 #442 FROZEN:** нет всех V0–V6 (права/лицензии весов, реальный видеоконвейер и GT, все копии, независимый restore). Автоудаление оригинальных видео запрещено.
- **B07 P1 BLOCKED:** секционный профиль/OP11–14 не активировать без полного набора физических моделей/валидаторов/миграций и сверки DOCX.
- **B09/B11/P2:** зелёный синтетический CI не доказывает настоящий offline, power-loss, storage quota и OnePlus.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_APK_REINSTALL / NO_PRODUCTION_APK_INSTALL / NO_MASS_MERGE.**
