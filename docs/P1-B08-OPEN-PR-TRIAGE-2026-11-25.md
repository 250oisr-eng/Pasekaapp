# B08 — инвентаризация 394 открытых PR и безопасная очередь main-based переноса

**Дата:** 2026-11-25. **Исходный `main`:** `0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`. Сверено GitHub REST `pulls?state=open&per_page=100&page=1…5`: первый снимок 100 + 100 + 100 + 93 + 0 = **393 PR** (до создания этого Draft #481). После открытия #481 повторно проверена четвёртая страница: **94** элемента, то есть **394 открытых PR**; при неизменных остальных страницах прямых `base=main` теперь **41**, прочие **353**. Полный первоначальный проход доказан; второй прирост подтверждён на странице 4. Счётчики не являются постоянными. Это текущий **снимок**, не доказательство готовности любого PR и не будущее неизменное число.

## F0–F2: полезный путь без доступа к ПК

Блокер B08 касается накопленных зависимых и устаревших PR, а не разрешения массового merge. Исторический снимок 370 PR/30 корневых устарел; не использовать его вместо API. Разрешено сделать **read-only** точный инвентарный обход с пагинацией, отдельную проверку ancestry/semantic diff отдельных кандидатов и предложение минимального main-based переноса. Не допускаются закрытие, merge, ребейз, публикация или перезапись чужих веток.

Пакет `scripts/read-only-pr-triage.mjs` читает только GitHub `GET /pulls?state=open`; `GITHUB_TOKEN` необязателен, но повышает лимиты API. Ничего не записывает в репозиторий. Он прекращает работу с `B08_INVENTORY_NOT_VERIFIED` при ошибке HTTP, дубликате, неверной SHA или отсутствии последней неполной страницы (не выдаёт частичный подсчёт за полный). Возвращает `totalOpen`, `directMainBase`, `otherBase`, `baseCounts`, список main-root с `REVIEW_REQUIRED`, `ancestry=NOT_CHECKED`, `ciStatus=NOT_CHECKED`. Тесты `tests/read-only-pr-triage.test.mjs` покрывают полный обход и негативные случаи. Даже основной список **не** доказывает отсутствие устаревания, бинарную совместимость или CI.

## F3: проверка части кандидатов на исходном SHA

| PR | Тип | Ahead / behind `main` | Достоверное решение |
|---|---|---:|---|
| [#481](https://github.com/250oisr-eng/Pasekaapp/pull/481) | B08 read-only triage | 4 / 0 на measured code/docs SHA | Этот Draft: только GET-пагинация и отрицательные тесты, не merged |
| [#478](https://github.com/250oisr-eng/Pasekaapp/pull/478) | B11 offline/cache | 38 / 0 | VM и CI PASS, Draft. **READY_FOR_MERGE_REVIEW**, но не merged и не released; отдельное разрешение |
| [#479](https://github.com/250oisr-eng/Pasekaapp/pull/479) | B01 диагностический gate | 62 / 0 | CI PASS, но фактические user backup/restore BLOCKED. Не выдавать за готовность восстановления |
| [#480](https://github.com/250oisr-eng/Pasekaapp/pull/480) | B15 Cloudflare release guard | 7 / 0 на измеренном SHA | В работе, exact SHA CI уточнить; не смешивать с release |
| [#469](https://github.com/250oisr-eng/Pasekaapp/pull/469) | P0 startup/signing | 120 / 93 | Большой исторический diff с workflow/index/migrations: только адресный перенос, не прямой merge |
| [#452](https://github.com/250oisr-eng/Pasekaapp/pull/452) | P0 full restore | 141 / 114 | Нет доказанного OnePlus backup/restore, прямой merge небезопасен |
| [#453](https://github.com/250oisr-eng/Pasekaapp/pull/453) | P1 OP технологические | 79 / 114 | Preview/профильные физические ворота, без активации |
| [#451](https://github.com/250oisr-eng/Pasekaapp/pull/451) | P1 Varroa/journal | 30 / 114 | Часть защиты уже в main через #475, нужно сравнить оставшееся, не слить старую цепочку |
| [#52](https://github.com/250oisr-eng/Pasekaapp/pull/52) | P1 безопасность Cloudflare | 8 / 863 | **Установлено расхождение в main:** `request.text()` до ограничения длины; старый PR ограничивает body во время streaming. Предложить **минимальный отдельный main-based port**, не merge #52 |
| [#69](https://github.com/250oisr-eng/Pasekaapp/pull/69) | P1 IndexedDB read transaction | 22 / 863 | Нужен semantic diff против main миграций и устойчивости чтения |
| [#60](https://github.com/250oisr-eng/Pasekaapp/pull/60) | P1 equipment dangling reference | 3 / 863 | Малый diff, но 863 behind; проверить, не покрыт ли текущим inventory inspector |
| [#200](https://github.com/250oisr-eng/Pasekaapp/pull/200) | P1 honey pairs | 10 / 181 | Подтверждённая норма установки медовых корпусов парами, но старый профиль/документация: только main-based выборочная проверка |
| [#381](https://github.com/250oisr-eng/Pasekaapp/pull/381) | Android phone-only docs | 2 / 181 | Исторические инструкции, не смешивать с заблокированным физическим восстановлением |
| [#170](https://github.com/250oisr-eng/Pasekaapp/pull/170) | Device instructions | 1 / 181 | Старые документы, не заменять действующие AGENTS/PROJECT_STATUS |

Ancestry `ahead/behind` измерено относительно SHA выше GitHub `compare_commits`, **не является** доказательством конфликта при git merge и не равняется review кода. Документация может меняться независимо; числа устаревают после нового merge.

## F4–F7: следующая безопасная очередь

1. Закончить #480 B15 и передать на review (без merge).
2. **#52 → отдельный main-based узкий security-port:** streaming capped Cloudflare request body. Проверить auth/CORS/error/413, Content-Length invalid/oversized, stream-overflow, отсутствие влияния на действующие Worker API. Не деплоить Worker.
3. #60 → тест на dangling equipment/identity при чтении, если в main нет равноценного инварианта. Исходная технология/профили не менять без первоисточника.
4. #69 → проверить момент завершения IDB readonly-транзакции на актуальном main и добавить только отсутствующий regression.
5. #200/#453 → source-bound проверка OP и Farrar-isolation, не активировать новое физическое устройство/профиль.
6. #469/#452 → разбить на независимые безопасные доказательства; live restore на рабочем OnePlus заморожен до полной копии и signer.

**Выпуск:** не выполнен. **Слияние:** не выполнено. **CI:** последним SHA каждого Draft проверять отдельно. **B08:** инвентаризация и очередь подготовлены, открытые PR не закрыты. Нужно обновлять live данные при каждой отдельной интеграции.

## Следующий предметный аудит: #60 — обратная целостность legacy-корпусов (25.11.2026)

Проверен именно нынешний `main` (`0e62ced6e34ea1fc92e7e090c2c514e8306c5f8d`): `validateVirtualApiary()` вызывает `PasekaInventory.inspect`, `PasekaEquipmentItems.validateReferences` и `PasekaSectionalPhysicalLayout.inspect`. В `js/equipment-inventory.js` функция `inspect()` перебирает зарегистрированные `equipmentInventory.bodies` и вычисляет `locateAll` для каждого из них; она **не обходит обратно все** `state.layouts[*].corpusIds`, чтобы доказать наличие объекта для непустой ссылки. `PasekaEquipmentItems.validateReferences()` проверяет `items` по их location, а `PasekaSectionalPhysicalLayout.inspect()` применим к другой sectional-модели. Это подтверждает потенциально непокрытый **legacy-layout dangling reference** из #60; не доказывает отсутствие дополнительных независимых guards в прочих путях.

**Граница безопасного переноса:** прежний PR #60 сильно отстал от main (исторический compare: behind 863); прямой merge запрещён. Перед добавлением runtime-guard отдельно проверить: (1) новые/старые Farrar layout с `corpusIds`, созданными до регистрации `equipmentInventory.bodies`; (2) порядок schema migration и `migrateUnsafe`; (3) пустые и некорректные ID, отсутствующий объект, неизвестную spec с явным отличием от легальной legacy-записи; (4) отсутствие mutation в `inspect`; (5) изоляцию sectional-профиля и сохранность пользовательских записей после offline reopen. До завершения такой матрицы **REVIEW_REQUIRED, NO_RUNTIME_CHANGE**, нельзя менять создание/открытие пасеки или запускать автоматическую миграцию. На текущем этапе только read-only аудит.
