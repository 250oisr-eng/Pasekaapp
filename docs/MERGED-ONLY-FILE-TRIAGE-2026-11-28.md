# Проверка 28 merged-only веток: фактические файлы и безопасная очередь — 28.11.2026

**Статус:** READ_ONLY_TRIAGE, не семантическая/исполнительная приёмка и не разрешение на merge/delete. База: `main=dcf8a7c519a4ec64e1d2c86a0cfeb72ba3497417` (повторный compare с main: identical). Использован полный список 176 merged-only из `audit/pr-branch-graph-20261128/docs/PR-BRANCH-MERGEDONLY-COMPARES-01..12-2026-11-28.json`; анализ ниже касается **только 12 тестовых и 16 обычных кодовых веток**, по одному указанному затронутому файлу на ветку. Старый merged PR не означает равенства содержимого при squash/cherry-pick.

## Проверка содержимого GitHub fetch_file (blob SHA)

**Тесты — 12 веток; равенство с main 7, неравенство 5:**

| Ветка | Проверяемый файл | Результат |
|---|---|---|
| `port/p1-b09-idb-read-gates-after485-2026-11-25` | `tests/idb-read-abort-and-malformed-v3.test.mjs` | отличается; все длинные значащие строки ветки присутствуют в main при грубом line-set анализе; проверить семантически |
| `test/b09-quota-atomic-rollback-2026-11-26` | `tests/idb-quota-atomic-recovery.test.mjs` | идентичен |
| `test/p0-b01-archive-request-error-2026-11-25` | `tests/disaster-archive-read-abort.test.mjs` | отличается; уникальная строка поиска границы функции, не доказательство недостающего сценария |
| `test/p0-b01-export-read-abort-2026-11-25` | тот же файл | отличается; main содержит дополнительные проверки, требуется review |
| `test/p1-b08-cloudflare-stream-error-2026-11-25` | `tests/cloudflare-bounded-body.test.mjs` | идентичен |
| `test/p1-b08-readonly-pr-metadata-2026-11-25` | `tests/read-only-pr-triage.test.mjs` | идентичен |
| `test/p1-b09-blocked-upgrade-main-port-20261126` | `tests/idb-blocked-upgrade-retry.test.mjs` | идентичен |
| `test/p1-b11-sw-failclosed-install-2026-11-25` | `tests/service-worker-offline-lifecycle.test.mjs` | отличается; ветка использует устаревшие имена cache v315–v319, не переносить дословно |
| `test/p1-body-frame-history-guards-main-20261126` | `tests/equipment-bodies.test.mjs` | идентичен |
| `test/p1-farrar-profile-180mm-regression-main-20261126` | `tests/equipment-inventory.test.mjs` | отличается; все длинные значащие строки ветки найдены в main, отдельно проверить профильную изоляцию |
| `test/p1-legacy-body-reference-audit-main-20261126` | тот же файл | идентичен |
| `test/ui-global-search-browser-proof-20261127` | `tests/e2e/navigation-layout.e2e.cjs` | отличается; прежняя трёхрядная геометрия и старые viewport-наборы, не заменять современную навигацию |

**Обычный код/скрипты — 16 веток; равенство с main 9, неравенство 7:**

| Ветка | Основной файл | Результат |
|---|---|---|
| `feat/family-lineage-model-clean-2026-11-17` | `js/family-lineage.js` | отличается; отдельные старые OP-04/queen-confirmation строки, высокий риск устаревшего контракта |
| `feat/p0-b01-offline-archive-verifier-2026-11-25` | `scripts/verify-exported-archive.mjs` | отличается; старый readFile/maxBytes путь, проверить новые лимиты и потоковую проверку |
| `feat/p0-b01-readonly-local-media-copy-audit-20261126` | `scripts/audit-local-media-copy.mjs` | идентичен |
| `feat/queen-absence-confirmation-event-2026-11-17` | `js/family-lineage.js` | отличается; один уникальный длинный экспорт getQueenPresenceStatus, нужна предметная проверка API |
| `fix/b01-tar-header-audit-selective-20261126` | `scripts/audit-oneplus-tar.mjs` | идентичен |
| `fix/b04-existing-java-locator-main-port-20261126` | `scripts/check-oneplus-upgrade.mjs` | идентичен |
| `fix/b05-debug-signer-reference-compare-20261126` | `scripts/audit-android-debug-artifact.mjs` | идентичен |
| `fix/b05-keytool-metadata-preflight-main-20261126` | `scripts/check-b05-keytool-certificate.mjs` | идентичен |
| `fix/family-lineage-queen-ownership-guards-2026-11-17` | `js/family-lineage.js` | отличается; тот же старый контракт queen/OP-04 |
| `fix/p0-b01-bounded-file-read-2026-11-25` | `scripts/verify-exported-archive.mjs` | отличается; старая TextDecoder/Buffer стратегия |
| `fix/p1-gps-pesticide-provenance-main-port-20261126` | `js/pesticide-incident.js` | идентичен |
| `fix/p1-json-family-hive-review-main-port-20261126` | `scripts/audit-oneplus-json-transfer.mjs` | идентичен |
| `port/p0-b01-legacy-json-preflight-2026-11-25` | тот же файл | отличается; длинные значащие строки ветки присутствуют в main |
| `port/p0-b04-readonly-installed-signer-2026-11-25` | `scripts/check-oneplus-upgrade.mjs` | отличается; старый java/apksigner locator, есть более новая версия |
| `port/p1-b08-readonly-pr-triage-after489-2026-11-25` | `scripts/read-only-pr-triage.mjs` | идентичен |
| `work/voice-feeding-spoken-fields` | `js/voice-command-parser.js` | идентичен |

## Очередь для независимых исполнителей, без конкурирующих правок

1. **Тестовая дорожка (read-only):** пять отличающихся тестовых веток. Сравнить имена `test()`, проверки ошибок, исходные требования и current main, затем выполнить целевые тесты на точном SHA. Старые SW-кеши/навигацию не копировать. Если сценарий полностью покрыт, отметить `SUPERSEDED_BY_MAIN_CONTENT`; если отсутствует — готовить отдельную узкую регрессию. Никаких изменений IndexedDB/production.
2. **Семьи/матки (read-only до контракта):** три старых `family-lineage.js` варианта; проверить `getQueenPresenceStatus`, OP-04 и `queen_identity_confirmed` относительно действующего coordinator/исторических данных. Не переносить файл целиком; не создавать факт матки по догадке.
3. **Архивы/Android preflight (read-only):** две старые версии архивного verifier и один Android signer locator. Проверить реальные ограничения безопасности, большие ZIP, отсутствие буферного переполнения, установленные ключи; никакого restore, записи или APK install.
4. **Девять идентичных кодовых + семь идентичных тестовых:** `FILE_IDENTICAL_TO_MAIN` для указанного пути, но **не** `BRANCH_SAFE_TO_DELETE`. Перед закрытием PR/удалением ветки отдельно проверить все пути, workflow, ссылки и действующие worktrees.
5. **46 критичных веток** из прежнего снимка остаются отдельным risk-review; автоматический перенос запрещён.

## Контроль рисков и границы доказательства

- Все **28/28** выбранных основных файлов доступны; 16 идентичных blob SHA, 12 отличающихся.
- Строковый анализ — эвристика, не AST/semantic diff; различие не доказывает отсутствия функциональности, равенство одного файла не доказывает равенство всей ветки.
- `npm test`, Chromium, Android и физический OnePlus **не запускались этим документальным циклом**. Нет exact-CI доказательства этого отчёта, кроме read-only GitHub сравнений.
- Код `main`, CI workflow, реальные семьи/улеи, IndexedDB, видео, резервные копии не изменены. Никаких merge, close, delete или публикации.
- Следующий безопасный критерий: для каждого отличающегося файла получить конкретные test-case/line/behavior evidence; только после этого отдельный маленький Draft на неинтегрированную регрессию.

## Дополнительная предметная сверка пяти различающихся тестовых веток

Повторно получены оба варианта каждого тестового файла и извлечены сценарии `test(...)` (названия тестов и непосредственно связанные проверки).

| Ветка | Сценарии ветки относительно main | Решение |
|---|---|---|
| `port/p1-b09-idb-read-gates-after485-2026-11-25` | Все 8 деклараций `test(...)` находятся в main: malformed v3, abort, completion, request failure, late blocked open, versionchange | Не переносить тестовый файл; до новой записи требуется лишь точное исполнение существующей регрессии |
| `test/p0-b01-archive-request-error-2026-11-25` | Все 8 деклараций тестов уже в main, включая interrupted `getAllKeys`, отсутствие `entrance_media` и дополнительный legacy store | Не переносить файл, main содержит те же сценарии |
| `test/p0-b01-export-read-abort-2026-11-25` | Все 5 сценариев ветки уже в main, main дополнительно содержит 3 теста | Не переносить старый тест |
| `test/p1-b11-sw-failclosed-install-2026-11-25` | Все 6 заявленных тестов присутствуют в main; ранняя ветка привязана к `paseka-shell-v318`, main — к `paseka-shell-v327` | Не копировать старые константы; при изменениях SW запускать актуальный lifecycle |
| `test/p1-farrar-profile-180mm-regression-main-20261126` | Все объявления `test(...)` ветки присутствуют в main; анализ длинных значимых строк не выявил отсутствующих строк | Не переносить; профильную совместимость проверять текущим набором тестов |
| `test/ui-global-search-browser-proof-20261127` | Старый набор ориентирован на прежние 3 ряда навигации; main содержит новое полевое 2-row поведение, Workspaces, touch-target и back/home тесты | Не откатывать новую геометрию; физический OnePlus/TalkBack отдельно NOT_TESTED |

**Степень доказательства:** подтверждены тексты test-описаний и отдельные assert из полученных GitHub файлов; не доказано совпадение динамического поведения. `npm test`, Chromium, Android, OnePlus не исполнялись, поскольку в данном инструментальном окружении нет доступного GitHub checkout и сети для `git clone`; CI для PR #656 не найден. Данные не изменялись. На этом read-only этапе новая регрессия не выявлена, создавать дублирующий тестовый PR не требуется.

**Решение по следующему циклу:** вместо переноса старых тестов — диагностика `getQueenPresenceStatus` и OP04 old-identity guard в `js/family-lineage.js`; любые изменения только после source-contract сверки и локальных регрессий. Дополнительно — read-only сравнение `scripts/verify-exported-archive.mjs` для безопасного handling больших архивов. Никаких live операционных изменений.

## Независимая сверка family-lineage (код, без записи данных)

Прочитан текущий `main/js/family-lineage.js` и старая ветка `feat/queen-absence-confirmation-event-2026-11-17`, дополнительно `feat/family-lineage-model-clean-2026-11-17`:
- `getQueenPresenceStatus` **есть** в текущем main и экспортирован через `window.PasekaFamilyLineage`. Это не пропущенная функция (старая ветка тоже её содержит).
- В main также есть `confirmQueenAbsence` и `recordQueenLayingObserved`; последнего нет в старом snapshot. Подтверждение отсутствия требует `userConfirmed===true`, реального OP-04 split event, валидного времени, совместимого семейного ID. `getQueenPresenceStatus` проверяет согласованность ID матки и события отсутствия, возвращает `historical`, `confirmed_absent`, `confirmed_present`, `inconsistent` или `unresolved` (либо null для отсутствующей семьи).
- Старая `feat/family-lineage-model-clean` не содержит новую `confirmQueenAbsence` и новый контроль `recordQueenLayingObserved`; полная замена main файлом из неё недопустима. Отсутствие старой символьной ошибки `OP04_SOURCE_QUEEN_NOT_IDENTIFIED` в main **не** означает отсутствие проверки, так как текущий `applySplit` отдельно проверяет ссылки и состояние имеющейся матки, а идентичность детей оставляет unresolved. Семантическую эквивалентность всех веток нельзя объявить без исполнения регрессий.
- **Решение:** перенос API из трёх старых family-lineage вариантов не обоснован; code implementation не предпринимать без воспроизведённого отсутствующего поведения.
