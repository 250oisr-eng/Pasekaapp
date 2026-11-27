# PROJECT_STATUS — Пасека 2.0

**27.11.2026 · live main `ab1be71add0e16b20eb47c7a1eaf585411039a46` after user-approved #613.** Перед merge всегда сверять актуальный SHA и CI. Правила: [AGENTS.md](AGENTS.md), [индекс](docs/PROJECT-CONTROL.md), [F0–F7](docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md). Исторические SHA/PR — в [журнале](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md) и [метриках](docs/WORK-CYCLE-METRICS.json).

## Основные интегрированные функции

- **#597–#599 MERGED:** первый внешний архив с read-only проверкой, история семьи и безопасные ссылки из поиска на записи/инвентарь. Полное независимое восстановление реальных данных ещё не доказано.
- **#603–#604 MERGED:** устранён overlap навигации, один AI-вход в навигации, три превью ульев и однокасательная новая запись из последних событий.
- **#607 MERGED:** единая на всех вкладках сотовая навигация **4–3–4**, соприкасающиеся шестиугольники, 11 маршрутов, центральная пчела в профиль без надписи на голубом радиальном фоне; доступное имя AI сохранено. PR `49f85367`: Node **1017/1017**, Android/Chromium 11/11/Governance PASS.
- **#609–#610 MERGED:** одно касание «Очистить» в глобальном поиске, Escape/фокус, aria-live статус числа результатов; 12 результатов и прежние ссылки не изменены. PR `b243e510`: Node **1021/1021**, Android/Chromium 11 viewport и search 320/390/768/Governance PASS.
- **#608/#611 MERGED:** постинтеграционный статус, история и метрики. Физические OnePlus/TalkBack не проверялись. Публикация не запускалась.

## Последняя интеграция и текущий QA-цикл

- **#612 MERGED:** история выбранной семьи открывается непосредственно из быстрого поиска (выборочный перенос старого #600); устаревшие/перенесённые/неоднозначные ID блокируются. Squash main `14b398c97354800062b170e835a97bf7c76b7eb5`. PR code+docs head `4ab891f3c7cfbf26dc4feffc1499f23686c8b560`: Node **1023/1023**, Android build SUCCESS (#45967365737), Chromium E2E mobile/desktop SUCCESS (#45967366165), Governance SUCCESS (#45967365751). Реальные данные не изменены.
- **#613 MERGED / BINARY_PROOF:** отдельный тестовый APK `ru.paseka.journal.qa` с собственным sandbox, без изменения рабочего `ru.paseka.journal`. Main `ab1be71add0e16b20eb47c7a1eaf585411039a46`. CI PR exact source SHA `acd35f567d87c640f2eb620312679cb981d2305f`: **1027/1027 Node**, Android debug build + [isolated QA #45967904156](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45967904156) SUCCESS, Governance SUCCESS. Проверены aapt package ID, apksigner fingerprint и APK SHA256 `e0651987d176e6a45f6a03b2ae2c39f613a9725463942d5583f63b49158eeca6`. QA artifact ID `15183717921`, expires 04.12.2026. **DEVICE_NOT_TESTED:** установка QA и офлайн/IDB/TalkBack на OnePlus не проверены. [Аппаратный протокол](docs/ONEPLUS-ISOLATED-QA-CURRENT-2026-11-27.md). Код/production-данные не изменены.

## Блокировки до физических доказательств

- **#596 P1 / DEVICE_NOT_TESTED:** мобильная навигация и жесты/TalkBack/работа в перчатках на настоящем OnePlus не проверены.
- **B01 P0 BLOCKED (Draft #452):** полная внешняя реальная копия IndexedDB и независимое восстановление/rollback не доказаны. Отсутствие доступных видео/копий не означает пустую базу. Не менять/удалять записи, копии, оригиналы.
- **B04/B05 P0 BLOCKED (Draft #469):** signer и совместимость обновления установленного Android APK, сохранение данных и rollback не доказаны. **Не устанавливать новый APK на OnePlus.**
- **B06/B10 #442 FROZEN:** нет всех V0–V6 (права/лицензии весов, реальный видеоконвейер и GT, все копии, независимый restore). Автоудаление оригинальных видео запрещено.
- **B07 P1 BLOCKED:** секционный профиль/OP11–14 не активировать без полного набора физических моделей/валидаторов/миграций и сверки DOCX.
- **B09/B11/P2:** зелёный синтетический CI не доказывает настоящий offline, power-loss, storage quota и OnePlus.

**NO_RELEASE / NO_PRODUCTION_MUTATION / NO_VIDEO_DELETE / NO_ONEPLUS_INSTALL / NO_MASS_MERGE.**
