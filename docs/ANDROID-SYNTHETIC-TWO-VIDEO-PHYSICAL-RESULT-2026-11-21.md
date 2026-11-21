# Физический Android-тест двух синтетических Blob — 2026-11-21

## Источник доказательства

Отчёт пользователя из Windows PowerShell после запуска скрипта `tools/android_synthetic_two_video_stop.ps1`, закреплённый код `53bab2d6a4a96057b5158f1395bf94b7a10aeff9`. Это отчёт с физического устройства, а не прямой доступ разработчика к USB или к файлам телефона.

| Проверка | Наблюдение |
|---|---|
| Устройство | OnePlus NE2213; Android API 36 |
| Пакет | `ru.paseka.journal.archive.test` |
| Новый каталог | `CREATED_NEW_ATOMICALLY` |
| Синтетические записи | 2, **не playable MP4** |
| Общий SHA-256 контейнера | `35ffcaa22e9fd48889a61b124f07110c300ae4a8208b273f773bc81f9b2c4ffb` |
| SHA-256 Blob 1 | `31d17cae6e57299bb3dde9bd3cff2709b3c29db64970595ac52df41fd4e6aef4` |
| SHA-256 Blob 2 | `09905f783ec6e2576fbca0d2e1620ad72f77e467ec98c13cd61c29b0af57f73f` |
| Android copy before stop | PASS |
| Android copy after stop | PASS |
| Android copy after relaunch | PASS |
| Итог скрипта | `EXTERNAL_TWO_BLOB_SHA_PASS` |
| Android delete | NONE |

Файл оставлен на устройстве:

`/sdcard/Download/Пасека/isolated-archive-synthetic-tests/092330b0d99f47ceb577a5082427905f/synthetic-two-video.paseka`

**Важное разграничение:** этот файл создан скриптом на компьютере, а не экспортирован из `entrance_media` приложения. Не проверялись входной реальный видеофайл, playable MP4, реальное распознавание, IndexedDB, app-export с видео, импорт, rollback, Android Camera/Gallery/MediaStore или очистка после распознавания.

## Статус

- `externalContainerAfterStopVerified=true` — только для указанных искусственных байтов и этой процедуры.
- `appExportWithVideosTested=false`.
- `indexedDbRestoreTested=false`.
- `recognitionSucceeded=false`.
- `cleanupAuthorized=false`.

## Следующий безопасный тест — проектирование, не выполнен

1. Проверить штатный путь записи `entrance_media` в изолированном test package; не трогать production package и старые test2/test3/test4 данные.
2. Для **новой** изолированной тестовой базы сформировать два реально декодируемых, синтетических MP4 с известными независимыми SHA-256 источников; никакой пользовательской съёмки.
3. Записать оба только через штатный тестируемый путь приложения и доказать их сохранность в `entrance_media` после закрытия/повторного открытия; не обходить security guards через прямую неподтверждённую запись.
4. Выполнить новый app-export PASEKA01 в отдельно созданный путь; проверить state, manifest, обе media entries и полные SHA-256 в сравнении с независимыми исходниками.
5. После `force-stop` только изолированного test package и последующего relaunch повторить read-only проверки. Сохранять снимок результатов и отдельные статусы PASS/FAIL/BLOCKED/NOT TESTED.
6. Не использовать существующий файл из этого отчёта для теста app-export, поскольку его происхождение другое. Не удалять никакие Android файлы автоматически.

**Запрещено на данном этапе:** cleanup исходных видео, перезапись архивов, reset/uninstall/clear data, внесение данных в production и merge/deploy. Тест не завершён, пока нет независимых исходных SHA и записи/экспорта внутри приложения.
