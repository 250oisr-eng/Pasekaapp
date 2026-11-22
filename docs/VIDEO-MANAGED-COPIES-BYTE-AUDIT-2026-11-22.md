# Побайтовая инвентаризация известных управляемых видеокопий — 22.11.2026

Статус: тестовый read-only этап, **не разрешение на удаление**.

## Реализовано

`js/video-managed-copies-byte-audit.js` выполняет один `readonly` IndexedDB snapshot пяти защищённых stores: `main`, `entrance_media`, `archive_staging`, `archive_history`, `full_backup`. Вне транзакции он пересчитывает SHA-256 **только распознанных форматов** для заданной пары `source/videoId`: оригинал `entrance_media`, `v2_pending_original`, legacy `video` (без полного SHA, блокируется), `rollback_video`, `full_backup.quarantinedMedia` и журналовые Data URL из известных структур `state`, `rollback_state`, `beforeState`, `afterState`. Порядок и тип источника должны совпадать; остальные видео не превращаются в разрешение для кандидата.

Только фиксированные выводы без Blob или Base64: число найденных, число прошедших hash/bytes, расположение, коды неизвестных форматов. Для `opaque_staging_state`, старых неопознанных видео, неизвестного `full_backup`, неподдерживаемой истории, некорректных размеров и SHA возвращается запретительный диагноз.

Две важные границы: (1) хэширование происходит после завершения `readonly` snapshot; конкурентная запись после снапшота не исключена, повторный atomic revision gate для удаления отсутствует; (2) системная Gallery/MediaStore/Downloads, внешние архивы и кэши физически недоступны браузерному аудитору. Поэтому всегда `status:BLOCKED`, `cleanupAuthorized:false`, `deleteAllowed:false`, `allCopiesVerified:false`, `externalCopiesVerified:false`, `dataModified:false`.

## Испытания

`tests/video-managed-copies-byte-audit.test.mjs` — пять изолированных synthetic случаев: три согласованные копии, подмена байтов staging, журналовый Data URL с unidentified legacy, непрозрачные архивы с сокрытием байтов, запрещённый ID/ошибка readonly. Встроено в существующий video workflow. Реальный Android, фактическое распознавание пчёл и удаление файлов **NOT_TESTED**.

## Что остаётся до физического удаления

- Чёткое разрешение на *только собственный* приватный media capture вместо file picker неизвестного происхождения.
- Доказательство качества настоящего офлайн распознавания и атомарной связи с SHA, результатом и ledger.
- Подтверждение отсутствия неуправляемых копий на Android и сохранение старых/резервных данных.
- Межтранзакционный optimistic lock + локальные recovery/rollback tests.
- Отдельный физический тест на изолированном Android с синтетическим файлом и последующим проверенным удалением — только после согласования, без удаления пользовательских видео.

Нельзя называть ограниченные SHA-проверки «all copies safe». PR Draft, main/production и данные пасеки не изменять.
