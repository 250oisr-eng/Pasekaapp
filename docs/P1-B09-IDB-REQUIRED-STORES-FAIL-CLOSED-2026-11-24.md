# B09 · Контракт полноты IndexedDB при открытии (без миграции/очистки)

Дата: 2026-11-24; исходный main: `d179da9a2d93ae193adaaaed7e4435ca42dc2cc5`.

## F0 / дефект

`openDB()` открывает `paseka-v1` с IndexedDB version 3 и создаёт stores `main`, `full_backup`, `entrance_media` только в `onupgradeneeded`. Существующая БД с уже объявленной версией 3, но отсутствующим store не вызывает `onupgradeneeded`; ранее `onsuccess` принимал такую базу и пользователь мог попасть в интерфейс до поздней ошибки при медиа/backup. Не менять схему и не пытаться дорисовать пропавшие данные через `createObjectStore`.

## F1 / минимум безопасного изменения

`index.html/openDB` после `onsuccess` проверяет все три обязательных имени с `objectStoreNames.contains`, **до** назначения global `db` и UI/bootstrap. При пропуске любого store закрывает соединение и возвращает понятную ошибку. Никаких `deleteDatabase`, `clear`, миграций, записи в IndexedDB, downgrade или установки на рабочее устройство. У обычной корректной v3 схемы прежняя семантика открытия и версионирования остаётся.

## F2 / регрессии

`tests/regression.test.mjs`: (a) отсутствующий `entrance_media` при v3 → отказ, закрытие DB, нет транзакций/записи/создания store; (б) валидная v3 → успешное открытие без изменения схемы. Существующие тесты blocked/onversionchange и миграций должны остаться зелёными. Код не притворяется полноценным восстановлением старых версий: v1/v2→v3, old/future schema, blob byte retention, Chrome crash/Quota и rollback необходимо отдельно доказать на архиве/старых fixtures и физическом устройстве.

## Статус и продолжение

`B09_PARTIAL_DRAFT / CI_PENDING`. До exact-SHA PASS и отдельного разрешения на merge не считать `IN_MAIN`. Даже после merge это **только fail-closed открытие неполной базы**, а не полное снятие B09. Физические данные OnePlus не трогались. Любое destructive recovery и PASEKA02 #442 FROZEN.
