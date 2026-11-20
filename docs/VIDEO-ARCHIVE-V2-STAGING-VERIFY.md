# PASEKA02 — повторная SHA-256 проверка protected staging

Дата: 2026-11-20. Статус: **изолированный аудит без права записи**, на базе Draft #232.

## Назначение

`js/video-archive-v2-staging-verify.js` предоставляет `verifyStagedPendingAgainstArchive(db,file,options,deps)`. Функция требует **исходный реальный PASEKA02-файл** и заново читает protected staging, вместо того чтобы доверять только полям `archive_history` или заголовку сессии. Содержимое файла проходит исходный codec v2, все video SHA и общий архивный SHA.

## Порядок проверки

1. Проверить доступность всех пяти stores (main, entrance_media, archive_staging, archive_history, full_backup) и зависимости. Исходный архив валидируется codec, и заново вычисляется SHA всего файла.
2. Открыть согласованную `readonly` транзакцию и считать live state, recognition ledger, ключи видео, все staged rows, историю и количество full_backup. Проверить точный состав session/entries, соответствие backupId/file SHA/revision, без потерь ledger и конфликтов videoId. Чужие записи, отсутствующий header, другой file, неполный набор, чужой backup — отказ.
3. После завершения readonly-транзакции **асинхронно хэшировать каждый фактически сохранённый staged Blob** (не доверять `sourceSha256` в metadata). При несоответствии немедленно отказать, не исправляя и не удаляя копии.
4. Открыть общую финальную `readwrite` транзакцию по пяти stores. Синхронно повторить проверки ledger/state/staging/history и сравнить строгий metadata fingerprint исходного и нового снимков. **Всегда вызвать `abort`**, включая успешный проход. Гонка записи state, ledger, ключей видео, history или staged metadata блокирует отчёт.
5. Выдать только `verifiedAtSnapshot=true`, `metadataStableUnderAbortedLock=true`, `byteIntegrityLocked=false`, `requiresAtomicCommitCheck=true`, `restoreAuthorized=false`, `cleanupAuthorized=false`, `archiveSafe=false`.

## Важнейшее ограничение

**Это не writer-fence для байтов Blob.** Хэширование происходит вне IndexedDB-транзакции. После хэширования, но до заключительной проверки, другой writer теоретически может заменить Blob **с сохранением прежних метаданных, MIME и размера**. Последняя транзакция проверяет metadata, но не имеет права выполнять асинхронный SHA внутри lock. Поэтому даже успешная проверка никогда не даёт права на import, restore, rollback или deletion. Перед настоящим commit требуется отдельный протокол, гарантирующий неизменность байтов с момента проверки до записи (версионированный writer path, атомарный fence/согласованный staged immutable protocol) и повторная регрессия.

## Регрессионные проверки

`tests/video-archive-v2-staging-verify.test.mjs` использует настоящие PASEKA02 и fake-indexeddb со схемой staging и unique backupId-index. Проверяются: входные и журналовые видео, SHA сохранённого Blob, подмена байтов с тем же размером, другой архив с тем же backupId, потерянная staged копия, новое распознавание, изменение истории во время SHA, изменение live записей без изменения revision, появление чужого полного backup, отсутствие protected store и обязательная отмена write-lock без изменения original данных.

## Границы

Только изолированный JS и тесты. Нет интеграции UI, Service Worker, Android bridge и живого восстановления. Никаких удалений/очистки, схемных миграций, production, merge. Все распознанные результаты/tombstones должны пережить будущий commit и rollback, а оригиналы — сохраняться лишь до подтверждённого распознавания с отдельной безопасной cleanup-процедурой по всем управляемым копиям. Физическое Android-тестирование не заменяется успешным CI.
