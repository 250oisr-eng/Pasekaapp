# B09 — старые версии IndexedDB v1/v2 → v3: самостоятельное доказательство сохранности

Дата: 2026-11-24. Исходный `main=6b865fe0b338f360d763ce3d0599829b7c34dedc`. Область: **только синтетические тесты** существующего `openDB()`, без изменения кода приложения, схемы или реальных записей.

## F0–F2

Существующий main после PR #473 проверяет обязательные stores у v3, но нет доказательства реального `onupgradeneeded` на старых уже заполненных версиях. В `tests/idb-legacy-open-upgrade.test.mjs` используется `fake-indexeddb` с реальным кодом `openDB` из `index.html`, а не имитацией всей операции. Для v1 (main store) и v2 (main + full_backup) создаётся старая база с ревизией, исторической записью, ArrayBuffer и Blob с контрольными байтами, затем открывается реальным `openDB` версии 3. Проверяем: `createdDuringOpen=false`; все три stores существуют; байты, ссылки, история и прежняя версия `state.meta.schemaVersion=1` не меняются; база повторно открывается с теми же байтами. Для базы IDB v4 проверяется `VersionError`, отсутствие downgrade и неизменность sentinel.

## F3–F7 и ограничения

Только это тестовое доказательство B09. Оно **не** подтверждает все миграции `migrateState` с версий 1–15, реальную потерю питания/Quota, данные физического OnePlus или полное восстановление архивов. Если хотя бы один тест не проходит, сохранить FAIL и исправлять неотключая сравнения оригинальных байтов. Ни merge/release, ни устройство, ни production DB, ни видео не затрагиваются. CI на новом SHA обязателен; статус `DRAFT / NOT_IN_MAIN` до отдельного разрешения.

## Exact-SHA результаты

- **Первый SHA** `280bddb264a75a8c36ff82c37ea5a05b23dd586f` [Android #45470164787](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45470164787): `FAIL` — оба теста сверяли порядок `objectStoreNames` как порядок объявления, хотя API возвращает упорядоченный список. Это неверное ожидание теста, не доказанное повреждение медиа. Проверки байтов при первом прогоне не достигались.
- **Исправленный кодовый SHA** `a06de48dd117973d0ba66b7dc4573d15e2979080`: [Android #45470298315](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45470298315) **698/698 PASS, Gradle BUILD SUCCESSFUL**, [Governance #45470298335](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45470298335) **SUCCESS**. Значит, тесты реально достигли сравнения оригинальных Blob байтов, ArrayBuffer, истории, `createdDuringOpen=false`, re-open и `VersionError`.
- `READY_FOR_MERGE_REVIEW / NOT_IN_MAIN`. Никакие правки старых реальных записей, принудительные миграции, Android install, production restore, cleanup не выполнялись. Физическое доказательство B09 остаётся NOT_VERIFIED.
