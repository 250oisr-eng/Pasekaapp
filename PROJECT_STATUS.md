# PROJECT_STATUS — Пасека 2.0

**24.11.2026, согласование PR #475 после #474.** Базовый подтверждённый `main=6ec1b20d618924959122821c81fc0bef808e6b9e`; live GitHub имеет приоритет. [Журнал](docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md), [реестр B01–B15](docs/РЕЕСТР-БЛОКЕРОВ.md), [план внешних испытаний](docs/P0-P2-ПЛАН-ЗАКРЫТИЯ-БЛОКЕРОВ-И-ДЕЙСТВИЯ-ПОЛЬЗОВАТЕЛЯ-2026-11-24.md).

## Интеграция и точные проверки

- **#472 MERGED:** read-only полный IDB архив, SHA, fail-closed Blob guard, G0, SW v316. Основной SHA `9e3c76b...` Fast/Android PASS. Реальный restore запрещён.
- **#473 MERGED:** проверка обязательных IDB stores без изменения базы. Основной SHA `c20d0fc...` Fast/Android PASS.
- **#471 MERGED:** правила F0–F7, реестр и планы.
- **#474 MERGED:** безопасный docs-only push-main Governance CI без публикации. На точном `main=6ec1b20d618924959122821c81fc0bef808e6b9e` [Governance #45473457945](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45473457945) SUCCESS и [Fast #45473457920](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45473457920) SUCCESS.
- **#475:** согласование безопасного Varroa/journal save rollback и выбранного улья с уже объединённым #474. Исходный кодовый PR SHA `ace5993909879615db7b16083775c3f17089c78e`: Android **709/709 PASS, BUILD SUCCESSFUL**. Обновлённый reconciliation HEAD требует самостоятельных CI. Не утверждать merge до фактического GitHub результата.
- **Draft #476:** B09 test-only v1/v2 upgrade и атомарный abort; последний SHA `a71e69bc47eb5411ef5ff0887b96f47af0464bda` **701/701 PASS**, Android/Docs SUCCESS; после #475 потребует нового согласования.
- **Draft #469:** read-only mock ADB, installed signer OnePlus UNKNOWN и постоянный ключ отсутствует. **Draft #452:** старый restore не merged. PASEKA02 **FROZEN #442** — реальные веса, видео, V0–V6 и удаление не разрешены.

## Следующий gate

На согласованном HEAD #475 повторить Android+Docs CI и проверить `behind main=0`/mergeable. После отдельного уже данного разрешения — последовательное merge #475, точный CI main и согласование #476 с новым main. B01/B04–B06/B10–B11 физически не закрыты.

**Запреты:** никаких release, Pages deployment, APK install, production database restore/cleanup и удаления исходных видео. Без подтверждённой внешней копии физические операции B09 запрещены.
