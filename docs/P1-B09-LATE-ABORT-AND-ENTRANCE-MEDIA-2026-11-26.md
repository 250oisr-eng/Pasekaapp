# P1 / B09 — гарантии после позднего отказа транзакции IndexedDB

## F0–F2: источник и жизнеспособность

Тип требования: инженерная надёжность данных (не технологический DOCX).
В `main=346b35035861257be45dae93ee0573cbd4de9082` production-код
`writeMainIfUnchanged`, `writeMainWithBackup`, `writeAutoBackup` записывает
в `main` и `full_backup`; оригинальные видео отдельно в `entrance_media`.
Предыдущий код Draft #538 проверял только синхронное `put()`/QuotaExceededError
и Blob внутри тестового состояния, но не отдельный `entrance_media`.
Новый сценарий: отказ ПОСЛЕ `IDBRequest.onsuccess`, но ДО
`transaction.oncomplete`; подтверждение изменения недопустимо.
Ресурсы: fake-indexeddb и текущий production JS, лицензий/сетевых API нет.
Решение F2: LIMITED_SAFE_DRAFT; реальный Android quota не моделируется.

## F3: инварианты

| Источник | Инвариант после неудачной транзакции |
|---|---|
| `main.state` | тот же revisionId, записи и побайтово тот же Blob |
| `full_backup.previous` | прежняя ревизия, история и Blob неизменны |
| `entrance_media['video-original']` | тот же оригинальный Blob и свойства |
| новые `revisionId` и `record` | отсутствуют после close/reopen |

Никаких запросов к OnePlus, live-данным и внешним источникам.
Сбой `put()` и abort после успешного `put()` должны отклонять
Promise, не сообщать о завершённой операции и сохранять все источники.

## F4–F5: реализация и доказательства

Изменён только `tests/idb-quota-atomic-recovery.test.mjs`,
производственные функции извлекаются напрямую из `index.html`.
Четыре синхронных QuotaExceededError сценария (включая основной
путь `writeMainIfUnchanged`) и четыре late-abort сценария
(обычное сохранение, две границы `writeMainWithBackup`,
автокопия). Все проверки возвращаются в заново открытую
синтетическую v3 IndexedDB; Blob `entrance_media` проверяется
побайтово. Android CI и Fast на точном кодовом SHA должны
завершиться успешно; отсутствие теста реального Quota/PowerLoss
указывается отдельно.

## F6–F7: интеграция

Один scope, существующий main-based Draft #538, не затрагивает
`index.html`, storage-schema/migration, Service Worker, APK, OP
или исходные видео. Откат — откат тестового коммита.
Нет права на merge, production restore, удаление оригиналов
или публикацию. Реальный backup/restore остаётся BLOCKED (B01),
видеодетекция/автоочистка FROZEN #442.
