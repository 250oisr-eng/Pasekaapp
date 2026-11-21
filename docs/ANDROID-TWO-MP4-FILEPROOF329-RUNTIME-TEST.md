# Android MediaStore fileproof329: активный тест двух MP4 — протокол и безопасность

Дата: 2026-11-21. Stacked Draft PR #330 поверх #329.

## Что подтверждено ранее

На физическом OnePlus NE2213/API36 проверены два синтетических MP4 в приватной IndexedDB отдельного APK `proof325`, экспорт PASEKA01 только **в памяти** и сохранность данных после перезапуска. CI #328 подтвердил запись/повторное чтение реального PASEKA01-файла в файловой системе runner. Специализированный **инертный**, не пишущий в Android MediaStore APK `fileproof329` ранее скомпилирован на SHA `77ae44faa1d68b1e8cde17c8fd951e956f4b0457` (run #44937442484), 1230/1230 Node PASS. Это не физическое доказательство Android MediaStore.

## Активная изолированная проверка

Тестовая web fixture `tests/fixtures/android-two-mp4-fileproof329.js`:
- проверяет закреплённые независимо SHA-256 двух 893-байтных MPEG-4/MP4 источников **до создания IndexedDB**;
- создаёт базу `paseka_fileproof_329_v1` **только если полностью пустая**; при существующих записях отказывает без overwrite;
- в одной readwrite транзакции сохраняет state, оба Blob и **durable attempt marker до любой нативной записи**. Поэтому после попытки — даже если MediaStore вернул ошибку или процесс умер — повторная автоматическая запись запрещена;
- закрывает/открывает базу, сверяет сохранённые SHA, использует настоящий `PasekaArchive.exportArchiveFromDatabase`, `parseArchiveBlob`, `verifyArchive` и `validateArchiveForRestore` без commit;
- передаёт только сформированный PASEKA01 <=1 MiB и ожидаемую SHA-256 через `PasekaFileproof329.saveAndReadBack`. Native Java создаёт UUID-имя только в `Download/PasekaProof329/`, проверяет видимые MediaStore collisions, записывает URI, публикует, **читает тот же URI** и сравнивает bytes+SHA, не предоставляя JS возможности выбирать файл или каталог;
- успех `FILE_READBACK_PASS` выдаётся только после подтверждённого ответа native bridge; отчёт — собственный private `files/paseka-fileproof329.ndjson` (native Java report), считываемый через `adb exec-out run-as`. Нет доступа к рабочему пакету, Downloads/Пасека и пользовательским видео;
- на любом шаге BLOCKED не запускает удаление, очистку и восстановление. При ошибке после insert собственный тестовый pending URI может оставаться; удалять автоматически запрещено.

## Автоматические тесты

`tests/android-two-mp4-fileproof329-runtime.test.mjs`: mock native success, corrupted fixture before DB write, native BLOCKED/no second write; реальные `fake-indexeddb` и архивный JS. `.github/workflows/android-two-mp4-fileproof329.yml` собирает специализированную APK, проверяет точный `ru.paseka.journal.archive.fileproof329` через AAPT и загружает artefact. `tools/android-two-mp4-fileproof329-device.ps1` требует SHA ZIP, ровно один авторизованный OnePlus NE2213/API36, **отсутствие ранее установленного fileproof329** и выполняет единственный первый запуск; без `pm clear`, `uninstall`, `force-stop`, восстановления или удаления Android файлов. `tests/test_android_two_mp4_fileproof329_device_mock.sh` проверяет синтаксис PowerShell, безопасный отказ при missing ZIP/предустановленном package и полный mock positive. Физический запуск — только после положительного CI на точном SHA и получения ZIP SHA.

## Чего эта проверка НЕ доказывает

- Внешнее хранилище Android MediaStore на физическом OnePlus пока **NOT TESTED**, до отчёта пользователя.
- Проверяется SHA чтения того же URI **в рамках того же запуска**. Не проверены независимое чтение сохранённого файла после остановки приложения, наличие корректного имени в файловом менеджере или открытие другой программой.
- `validateArchiveForRestore` — **preflight**, не фактический импорт/restore commit в новую IndexedDB.
- Не проверены codec/playback, реальные видео летка, распознавание/аналитика и автоматическое удаление исходников. `recognitionSucceeded=false`, `cleanupAuthorized=false`.
- Query MediaStore может иметь ограниченную видимость чужих записей; нативные UUID + выделенная папка дают защиту теста, но **не доказательство абсолютного отсутствия коллизий**.
- Пакеты `ru.paseka.journal`, `ru.paseka.journal.archive.test`, `ru.paseka.journal.archive.proof325` не переустанавливать и не чистить. Никаких merge/main/deployment.

## Контрольные точки CI

Специализированный run #44938075602 для source SHA `b7e097fff66e02dd6d8a477baff903be474c6187` и отдельный USB safety workflow #44938223744 на SHA `37a7a0bbd728c17a69133baa733d5cb1692105f1` **ожидают итогового подтверждения**; результаты нельзя считать успешными до завершения и просмотра ошибок. Документы и последующие коммиты имеют собственный HEAD и не наследуют CI автоматически.
