# PROJECT_STATUS — Пасека 2.0

**24.11.2026.** Живой `main=c20d0fc39c8e1142925d2667c74c5c7760d3ce20`. [PR #472](https://github.com/250oisr-eng/Pasekaapp/pull/472) **MERGED по отдельному разрешению**, без публикации: в main полный read-only v1 IDB экспорт, проверка SHA, B02 Blob guard, G0 и SW v316. Fast #3995 SUCCESS на merge SHA, Android #7009 completed/success. Full live restore UI не существует.

**PR #473 MERGED**: B09 fail-closed проверка схемы `main/full_backup/entrance_media` с двумя тестами добавлена в main после 695/695 PASS / Android BUILD SUCCESSFUL на PR SHA. Fast #3998 и Android #7013 на merge SHA проверяются отдельно. Полные legacy migrations и аварийное восстановление NOT_VERIFIED. Полные legacy migrations и аварийное восстановление NOT_VERIFIED.

**PR #471**: в рабочей ветке согласованы компактные правила, реестр B01–B15, план действий и журнал. **Не merged**, новый exact SHA Governance CI проверить.

**Draft #469**: прочтение установленной подписи OnePlus только в mock tests, actual signing fingerprint UNKNOWN, постоянного защищённого ключа нет. **Draft #452** — старый full restore, не merged. **Issue #442** PASEKA02 automatic video cleanup FROZEN. Без независимой копии и V0–V6 нельзя удалять реальные файлы.

**Внешние ворота:** read-only ADB на доступном OnePlus, независимый архив вне устройства, byte-safe восстановление только на пустом тестовом target, постоянный signing keystore вне Git. Технологические OP и старые stacked PR не интегрировать пачкой. Подробности — [реестр](docs/РЕЕСТР-БЛОКЕРОВ.md) и [план](docs/P0-P2-ПЛАН-ЗАКРЫТИЯ-БЛОКЕРОВ-И-ДЕЙСТВИЯ-ПОЛЬЗОВАТЕЛЯ-2026-11-24.md).

**Права:** отдельные разрешения пользователя на последовательное слияние #472, #473 и #471 ограничены проверкой CI/отсутствием конфликтов. #472 и #473 уже merged. #471 — ещё Draft; для merge требуется успешный новый exact-SHA Governance CI и повторная проверка main. Публикация не разрешена. Никаких publish/deploy, установки APK, изменения production-базы, восстановления и удаления.
