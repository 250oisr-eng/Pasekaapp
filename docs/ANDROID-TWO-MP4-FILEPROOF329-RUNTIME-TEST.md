## 2026-11-21 — ФИЗИЧЕСКИЙ PASS MediaStore readback: fileproof329 / 2 MP4 / PASEKA01 (OnePlus NE2213/API36)

- Пользователь выполнил pinned `tools/android-fileproof329-readonly-recovery.ps1` из code SHA `f9f38349584a8a21427a163473dd046dac21696e` на физическом OnePlus **NE2213/API36**. Отчёт: `PACKAGE: EXISTING_FILEPROOF329 | READ_ONLY`; `REPORT_BYTES: 466`; `REPORT_SHA256: 002fbc37d6627e1412f95ad68946388dceeb257fda55b51b8df62b7ba3886ac4`; `REPORT_LINES: 1`; `REPORT_STATUS: PASS`; `STATUS: ISOLATED_FILEPROOF329_MEDIASTORE_PASS`.
- **Полный PASEKA01** `ARCHIVE_BYTES: 3158`, `ARCHIVE_SHA256: 4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`. Источник MP4 №1 `794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f`, №2 `bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff`. Native bridge записал файл с нативным UUID в **отдельный `Download/PasekaProof329/`**, прочитал тот же MediaStore URI и сверил bytes/SHA; этот факт подтверждён **существующим отчётом приложения**, валидированным read-only recovery, а не самостоятельным извлечением внешнего файла через PC.
- Предыдущий исходный установочный PowerShell вернул `PROOF_JSON_INVALID`; новый скрипт успешно обработал существующую запись **без повторной установки, запуска приложения, нового экспорта или удаления**, восстановил проверенный PASS. Точную байтовую причину первоначального сбоя прежнего JSON parser по одному выводу не установить; факт валидного отчёта подтверждён.
- **Не проверено:** файл из Android Downloads повторно открыт **после перезапуска процесса/телефона** независимо от отчёта; настоящее восстановление `PASEKA01` в свежую IndexedDB через commit; воспроизведение/декодирование двух MP4; анализ/распознавание пчёл; удаление видео. `PERSISTED_FILE_POST_RESTART: NOT_TESTED`, `RESTORE_COMMIT_AND_MP4_PLAYBACK: NOT_TESTED`, `VIDEO_RECOGNITION_AND_CLEANUP: NOT_AUTHORIZED`, `cleanupAuthorized=false`, `recognitionSucceeded=false`.
- Закрытый эксперимент **не трогал** `ru.paseka.journal`, `ru.paseka.journal.archive.test` или `ru.paseka.journal.archive.proof325`; никаких файлов на Android не удалялось. Тестовый пакет `fileproof329` и его external архив **сохранить**. Не повторять одноразовую запись и не применять `pm clear/uninstall`. Следующий этап — спроектировать строго read-only проверку сохранённого PASEKA01 извне через URI/MediaStore с SHA-256 после остановки без удаления и затем отдельный безопасный restore в совершенно новую тестовую БД. Draft [#331](https://github.com/250oisr-eng/Pasekaapp/pull/331), no merge/main/deployment.

## Проверенные CI и одноразовый физический сценарий

- [Android proof329 #44938075602](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938075602), точный кодовый SHA **`b7e097fff66e02dd6d8a477baff903be474c6187`** — **completed/success**, Node **1233/1233 PASS**, Gradle **BUILD SUCCESSFUL**, AAPT подтвердил `ru.paseka.journal.archive.fileproof329`. Артефакт [#14720900563](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938075602/artifacts/14720900563) `paseka-fileproof329-two-mp4-runtime-apk`, размер ZIP **3349848 B**, SHA-256 архива ZIP, подтверждённый GitHub Actions upload **`3213b323fbf2c6521c88da93abe172611559377375f4f2a167e9e85f86cb9727`**.
- В старом Windows mock CI был **FAIL** из-за использования зарезервированной PowerShell автоматической переменной `$args` при формировании ADB команды. Исправлено отдельным `$argv`, без изменения APK. [USB CI #44938285085](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938285085) и [#44938291588](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938291588) на **точном SHA `f2b7a4290af78835f482214ba64b1038cb5d536b`** — **completed/success**, проверены PowerShell parser, `missingzip`, `package already installed`, полный mock успех с двумя pinned SHA. Ни один mock не выполняет `pm clear`, `uninstall`, `force-stop` или удаление файлов телефона.
- **Физический запуск пока НЕ выполнялся**. Нужно скачать **один** указанный ZIP-артефакт GitHub (как `paseka-fileproof329-two-mp4-runtime-apk.zip` в `Downloads`) и один раз вызвать pinned `tools/android-two-mp4-fileproof329-device.ps1` по source SHA `f2b7...`, передав ZIP SHA. Если `BLOCKED`, пользователь не переустанавливает пакет и ничего не удаляет; результат исследуется отдельно. Сценарий создаёт временный каталог только на ПК, а синтетический .paseka в отдельной папке телефона **сохраняется**.
- Никаких доказательств восстановленного архива, codec decoding, распознавания или очистки на основе данного шага. `cleanupAuthorized=false`.

---

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
