# P2 — безопасный список видеозаписей по метаданным (25.11.2026)

## F0–F2
Current main `fdcca080b68aa5b0014b8e99cd3e4f1d428e7ba2` reads all `entrance_media` objects through `getAll()`, retaining original video Blob objects even when rendering a text-only queue. A previously prepared solution exists in stacked Draft #425; **only** its `listEntranceVideos()` routine and focused regression test were selectively carried into a new root Draft. No other code from #425 (including deletion paths) is copied.

**LIMITED_SAFE_DRAFT:** purely read-only cursor enumeration into metadata-only array; existing `getEntranceVideo(id)` continues to read complete original on demand. User-facing sort order remains descending `capturedAt`. No change to stored format, schema, stores, write transactions, reference identity, app profiles, camera, AI model, or media retention.

## F3–F5 invariants
- Original video Blob must not be written, removed, truncated or replaced.
- Cursor transaction is `readonly`; Promise succeeds only after transaction `oncomplete`. Aborts/errors reject.
- Metadata projection preserves original fields except binary `blob`, including legacy records; schema and history are not migrated.
- `tests/p2-entrance-metadata-cursor.test.mjs` checks order, fields, Blob byte SHA after DB close/reopen, legacy fixtures, failure propagation, and absence of `getAll/put/delete/clear` in the list routine.
- Real OnePlus RAM/battery savings are **NOT_MEASURED**. A cursor returning `cursor.value` still clones one record with its Blob per step; this patch reduces simultaneous retained originals, **not** necessarily all browser transient memory consumption.
- P0 full video recovery, physical real recognition and auto-deletion remain BLOCKED / FROZEN #442.

## F6
No merges, deployment, APK install, external permissions, user-data writes, or original-video deletion. Exact GitHub Fast/Android/Governance CI results must be checked by SHA; physical device proof is separately gated.

## Согласование с main 26.11.2026 (F0–F6)

- **F0:** исходная ветка #511 отставала от main и содержала старую реализацию `refreshEntranceVideos`. В main после #514 реализованы generation guard, проверка hive ID после асинхронного запроса и безопасный `data-video-id`. Из старой ветки эти части **не переносились**.
- **F1/F2:** UI запрашивает исключительно список статусов, дат, размеров, hive ID; `getEntranceVideo(id)` по-прежнему получает Blob только для просмотра по запросу. Не требуется новое API, модель детекции, миграция, публикация или устройство.
- **F3/F4:** `listEntranceVideos()` использует только `transaction('entrance_media','readonly')` и `openCursor()`, копирует все метаданные кроме поля `blob` и дожидается `tx.oncomplete`; при abort/error rejects. История IndexedDB, оригиналы, коды записи/просмотра/удаления и #512 остаются нетронутыми. Старая ветка согласована с main `7e755a577cd243c6b4a51e775903e91e63db0a58` на кодовом SHA `e54032ecdfa6cfd8e184b6c31ec066bc02b6e04a`.
- **F5:** `tests/p2-entrance-metadata-cursor.test.mjs` проверяет сортировку, legacy, SHA-256 исходных Blob после закрытия/переоткрытия тестовой БД, запрет записи и сохранность запретов удаления и #514 UI. Fast Quality #45868399561 и Android #45868399450/#45868408015 SUCCESS на кодовом SHA `e54032ecdfa6cfd8e184b6c31ec066bc02b6e04a`; Governance #45868598729 и Android #45868598762 SUCCESS на docs-only `895ac63b73b14061827a634ab9022ff4fa85f68d`. Финальную проверку этого документационного обновления выполнить отдельно.
- **F6:** rollback — revert только реализации `listEntranceVideos`; возвращение `getAll()` увеличит удержание Blob-объектов. Синтетические проверки не измеряют RAM/CPU на OnePlus: `cursor.value` может клонировать один Blob за шаг. B01 и #442 остаются FROZEN. **Слияние не разрешено этим чатом** и требует отдельного решения пользователя.

## F7
Не публиковать, не устанавливать APK, не запускать auto-cleanup/детекцию и не менять пользовательскую базу без отдельных разрешений и ворот.
