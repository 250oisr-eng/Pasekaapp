# Десять независимых циклов сверки веток — 28.11.2026

**Статус:** READ_ONLY_COMPARE_SAMPLE / NOT_170_COMPLETE. **База:** `main dcf8a7c519a4ec64e1d2c86a0cfeb72ba3497417`. Данные: GitHub compare `main...branch`; результаты относятся только к этой базе. Без merge, закрытия PR, retarget, удаления веток, production, видео и реальных данных.

## Охват и метод

Выполнено **10 тематических групп по 8 сравнений**: архивы/B01, Android/подпись, инвентарь, медовые корпуса, семьи, UI, OP/физическая модель, offline/IndexedDB, выпуск/Cloudflare, QA/документация. **79 успешных compare; 1 ответ 404** для `fix/p1-b15-cloudflare-manual-release-main-20261125` (возможно неверное/несуществующее имя ref; не считать удалённой без дополнительной проверки). Из 79 успешных **20 имеют ahead=0** и **59 имеют ahead>0**. Набор тематический и включает как ранее исследованные, так и другие ветки; **не доказано**, что все 80 принадлежат именно 170 оставшимся `merged-only`. Следовательно, нельзя вычитать 80 из 170, объявлять полный аудит, или выводить число удаляемых веток.

`ahead=0` доказывает отсутствие уникальных коммитов относительно текущего main, **но не доказывает отсутствие внешних ссылок и права удаления**. `ahead>0` может быть следствием squash-merge или cherry-pick; **не доказывает** отсутствующий функционал. Список changedFiles — сигнал риска, а не семантический review.

## Итоги десяти групп

| Цикл | Сфера | Сравнений | ahead=0 | Важные наблюдения |
|---|---|---:|---:|---|
| 01 | Архивы/B01 | 8 | 3 | `feat/b01-two-daily-archives`: 25 ahead / 33 behind, Android/native, IndexedDB, Service Worker. `fix/archive-media-integrity-2026-11-14`: 323/1115; wholesale перенос запрещён |
| 02 | Android/подпись | 8 | 0 | Изолированный QA и B04/B05 имеют уникальные SHA; старые Android тестовые ветки расходятся на сотни коммитов; физическое обновление не доказано |
| 03 | Инвентарь | 8 | 1 | `feat/full-frame-inventory-traceability-2026-11-17` 0/609; `feat/inventory-filtered-csv-export-20261127` 17/27, `index.html`/E2E; отдельно проверить отсутствие функционала в main |
| 04 | Медовые операции | 8 | 1 | `work/honey-harvest-history` 0/27; старые sectional/honey ветки меняют coordinator/index.html; B07 и пользовательское правило OP08 2/4→0→2/4 сохраняются |
| 05 | Семьи/матки | 8 | 2 | `feat/family-events-runtime-integration-2026-11-17` 0/1016; `work/family-history-view` 0/94; старые 252-commit ветки несут широкие изменения, не merge-ready |
| 06 | UI/доступность | 8 | 5 | `fix/ui-187-honeycomb-overview-20261127`, `fix/ui-a11y-selective-187-20261127`, `fix/p1-brood-frame-strip-dynamic-20261126` имеют ahead=0; остальные `index.html` необходимо сверять по текущему UX |
| 07 | OP/физическая модель | 8 | 2 | `fix/op07-12-15-day-window-2026-11-17` и `fix/sectional-op06-laying-observation-2026-11-16`: ahead=0. Большие OP11/12 цепочки не переносить до валидаторов B07 |
| 08 | Offline/IndexedDB | 8 | 3 | `fix/p1-sw-safe-cache-main-2026-11-23`, `fix/p1-b11-service-worker-install-private-response-gate-2026-11-24`, `fix/p1-idb-required-stores-open-gate-2026-11-24`: ahead=0; SW redirects/partial-shell разбирать отдельно |
| 09 | Выпуск/Cloudflare | 8 | 1 | `fix/pages-manual-release-gate-2026-11-23` ahead=0; 404 у одного ref; release остаётся запрещён без отдельного разрешения |
| 10 | QA/документация | 8 | 2 | `test/b01-comprehensive-local-qa-20261127` 0/32; `docs/finalize-root-audit-n-20261126` 0/143; `test/p1-body-frame-history-guards-main-20261126` 1/195 — небольшой кандидат на semantic diff |

Счётчик successful compare — не счетчик проверенных PR и не доказательство готовности merge. Проверки CI по SHA этой выборки, полные изменения файлов, закрытые PR и внешние ссылки ещё не проверены.

## Минимальная очередь следующей предметной проверки

1. **Документальный guard / тесты:** проверить, содержит ли main регрессию `tests/equipment-bodies.test.mjs` из `test/p1-body-frame-history-guards-main-20261126` (ahead=1); если уникальна и совместима, отдельный точечный перенос с тестами. Проверить `tests/idb-blocked-upgrade-retry.test.mjs` из `test/p1-b09-blocked-upgrade-main-port-20261126` (ahead=1) без изменения хранения.
2. **Инвентарь CSV:** `feat/inventory-filtered-csv-export-20261127` — сравнить текущий runtime/E2E, не копировать старый `index.html`.
3. **SW/offline:** сравнить защищённые инварианты redirect/partial-shell на текущем `sw.js`, только негативные тесты и отдельный PR при реальном пробеле.
4. **Архивы/Android/B07:** оставить HOLD до доказательств и соответствующих разрешений; не смешивать с приёмкой небольших тестов.
5. **Именно оставшиеся 170 merged-only:** требуется поимённая связь branch↔merged PR, актуальный base/head SHA, уже проверенные 6 merged-only исключить, затем 170 exact compares, semantic path review при ahead>0 и внешние ссылки/automation. До этого статус `NOT_170_COMPLETE`.

**Не сделано:** merge/close/delete/retarget; изменения основного приложения, IndexedDB, production; запуск npm/Android/CI; физический OnePlus. Этот документ — evidence-запись десяти сравнительных циклов, а не разрешение на интеграцию.
