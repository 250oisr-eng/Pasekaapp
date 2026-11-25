# P0 + P2 — проверка совместимости без merge (25.11.2026)

## Назначение
Производная тестовая ветка от [Draft #512](https://github.com/250oisr-eng/Pasekaapp/pull/512) (base SHA `37f1d85e4d98febf6d5e3ceea1b3bd64c1e7f07a`) с **единственным** переносом `listEntranceVideos()` из независимого [Draft #511](https://github.com/250oisr-eng/Pasekaapp/pull/511). Проверка не даёт права merge любого родителя и не является выпуском.

## F0–F3
* Два изменения затрагивают разные функции одного `index.html`; надо доказать, что новый `readonly` курсор просмотра метаданных не обходит запрет удаления оригинала.
* Нет изменений IndexedDB schema, Service Worker, Android API, видеоаналитики, OP, физической модели или реальных данных.
* Уровень доказательства: `LIMITED_SAFE_DRAFT`. Только синтетические записи в `fake-indexeddb`.

## F4–F5
* Объединённая ветка сохраняет `getEntranceVideo`, `putEntranceVideo` и архивные P0 проверки #512.
* Включены прежние регрессии P0 и P2, а также `tests/p0-p2-entrance-composed.test.mjs`: synthetic original Blob byte SHA, listing without Blob, direct delete rejection, whole-DB reset rejection, original hash after both rejections.
* При любом CI FAIL сохранять Draft, найти причину, не маскировать ошибки.
* Проверка не подтверждает реальную экономию RAM, полный backup/restore, device behavior или модель распознавания.

## F6–F7
Это **stacked тестовый Draft** на base #512 для совместимости до отдельного разрешения merge. Не сливать этот PR и родителей автоматически. После разрешённого merge соответствующих независимых PR провести интеграционные регрессии на точном `main` SHA. Оригиналы и production база не затронуты; #442 остаётся FROZEN.
