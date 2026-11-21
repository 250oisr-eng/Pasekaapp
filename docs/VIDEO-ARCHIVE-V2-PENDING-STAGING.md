# PASEKA02 — атомарный защищённый staging для pending originals

Дата: 2026-11-20. Статус: **только изолированный тестовый модуль**, без подключения к рабочему приложению.

## Цель

Использовать ранее проверенный codec PASEKA02 и ledger gate для сохранения копий **ещё не распознанных** видео в IndexedDB staging, не изменяя основное состояние пасеки. Видео должны сохраняться только до подтверждённого распознавания, но данный эксперимент **не имеет удаления**. Ни staged copy, ни метаданные не считаются подтверждённой backup-копией и не дают разрешения на restore/cleanup.

## Область

Новый модуль `js/video-archive-v2-pending-stage.js` содержит:

- `stagePendingRestore(db,file,options,deps)`: принимает **только реальный Blob** PASEKA02 с pending video, а не поддельный decoded object. Codec проверяет SHA каждого исходного Blob, журналовых data URL, структуру архива и ledger. Снаружи транзакции повторно проверяются SHA всего файла и всех staged originals. При неизвестной схеме, отсутствии pending оригиналов, неверном backupId или неполном SHA — отказ.
- Под **одной** IndexedDB `readwrite` транзакцией защищённые stores `main`, `entrance_media`, `archive_staging`, `archive_history`, `full_backup` проверяются вместе. Требуется schemaVersion=15, точная live revision, ledger без потерь, отсутствие предшествующих защищённых staging/history/full_backup. Дополнительно используется fail-closed ID collision guard из PR #231. Затем атомарно сохраняются только header и Blob исходников в staging, а также history. Любая ошибка прерывает всю транзакцию.
- `inspectPendingStaging(db,backupId)`: строго **readonly** проверяет существование header, ожидаемые ключи и связанную history. Результат `protected_unverified` означает только, что обнаружены защищённые метаданные. Он **не означает**, что Blob заново проверены SHA, что архив можно восстановить или что original разрешено удалить. Осиротевшие/неоднозначные записи получают `manual_review_required`.

## Важное ограничение реальной схемы IndexedDB

`archive_staging` уже существует с `keyPath:'id'` и уникальным индексом `backupId`. Поэтому **только header** содержит поле `backupId`; дочерние видеозаписи имеют `sessionId`, `source`, `videoId`, SHA, размер, MIME и Blob, но **не имеют backupId**. Это избегает `ConstraintError` и не изменяет версию/структуру базы. `archive_history` содержит отдельную связанную запись со статусом `staged`.

Нельзя воспринимать этот формат как полноценную копию всего PASEKA02: в staging **не хранится** полный импортируемый state или исходный архивный файл. Для реального commit потребуется заново предоставить и проверить файл, сверить его SHA с header, повторно проверить каждый staged Blob и весь live ledger/state, в одной write-транзакции создать rollback и только затем вводить реальное восстановление.

## Проверки

`tests/video-archive-v2-pending-stage.test.mjs` с fake-indexeddb использует реальный PASEKA02, два источника video (entrance_media и record_media), уникальный backupId индекс staging и защищённые stores. Проверяется успешное атомарное сохранение без изменений main/ledger/entrance_media; реальные SHA каждого Blob; отсутствие удаления; запрет повторного staging, прежних backup, коллизии ID, конкурентного writer, нового распознавания при хэшировании, неверного архива, отсутствие самопроизвольной очистки при повреждении header и readonly диагностика.

## Запреты и следующий этап

- **Нет** `restoreAuthorized`, `archiveSafe`, `cleanupAuthorized`; все они всегда false.
- Нет изменения `main/state`, исходных `entrance_media`, `full_backup` или распознанных результатов; нет нового UI, Service Worker, Android bridge, data migrations, live integration и пользовательских операций.
- Нет `delete`, `clear`, автоматического удаления после распознавания, права считать staged metadata подтверждёнными байтами, rollback или recovery commit.
- Этот Draft нельзя сливать или использовать на живой базе без независимых SHA/recovery/cleanup проверок и отдельного разрешения пользователя. Следующий шаг — rehash staged originals и проверка их неизменности под writer-serialized guard, затем отдельная интеграция атомарного commit/rollback, связка с ledger и физическое Android-тестирование.

## 2026-11-21 — PASEKA02 после прерывания подготовки восстановления

На базе Draft #308 проверена отмена общей транзакции после успешного add заголовка, оригинала и истории по отдельности. После повторного открытия изолированной IndexedDB частичных записей нет. Повтор сохраняет единственный комплект с проверяемым SHA; третья попытка блокируется. Журнал, реестр результатов и посторонний оригинал сохраняются. Исправлена диагностика повреждённого заголовка: ссылка на сам заголовок или видео другой сессии требует ручной проверки. Прежняя версия ошибочно возвращала protected_unverified в воспроизведённом тесте. Схема базы и формат архива прежние. На локальном дереве прошли 15 профильных проверок и весь набор из 1155 тестов. Следующая задача — проверить отмену и повтор финальной атомарной записи при восстановлении летковых видео с сохранением rollback, отдельно от подготовки. Эксперимент использует fake-indexeddb, физическое отключение питания Android не моделировалось.

Инспектор читает количество строк и первичные ключи по существующему индексу sessionId. Число уникальных дочерних ключей должно совпадать с ожидаемым, а каждый ключ должен принадлежать источнику видео этой сессии. Повторное вычисление SHA содержимого остаётся отдельным шагом.

## 2026-11-21 — integrity of staged child metadata

Read-only recovery now checks actual session-indexed child records, not only their keys. A child must have `kind=v2_pending_original`, `sessionId` matching its header, a source-qualified key reconstructed from `source` and `videoId`, SHA256-shaped `sourceSha256`, a positive integer `sourceBytes` equal to `blob.size`, and a valid media MIME. Inconsistent metadata downgrades the entire session to `manual_review_required`. This **does not recompute** the Blob SHA or authorize restore, purge, training or video cleanup. All reads remain inside one readonly transaction; no upgrade or data migration.


## 2026-11-21 — full staged Blob SHA audit, no authorization

`verifyPendingStagingBlobs(db,backupId,shaTool)` provides a **read-only diagnostic** on top of `inspectPendingStaging`. It hashes every stored pending Blob with the existing 1 MiB-chunked SHA implementation; compares the full digest to `sourceSha256`; and rereads session metadata to detect an intervening write. All outputs keep `restoreAuthorized=false` and `cleanupAuthorized=false`, including successful hashing. The positive `byteIntegrityVerified` result refers only to read Blob copies and **does not prove transaction-time stability or authorize a final commit**. Before a future restore, a distinct writer-serialized commit-time recheck and rollback tests are required.


## 2026-11-21 — concurrent same-size Blob substitution

The full diagnostic now validates metadata consistency across two readonly snapshots and **re-hashes the second snapshot's Blob copies**. This detects a writer that changes media bytes without changing length or stored SHA metadata. It must remain isolated from the atomic entrance-only commit module, whose independent archive-pinned source and writer-serialized checks are never skipped by a successful staged hash report. Two integration regressions exercise both sequences. The final authorization and automatic deletion flags remain false, regardless of these tests; this is not a real Android/WebView recovery guarantee.

