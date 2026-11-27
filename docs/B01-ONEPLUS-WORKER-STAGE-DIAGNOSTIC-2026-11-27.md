# B01 / OnePlus G4 — диагностика 180-секундного тайм-аута JobScheduler

Дата: 27.11.2026. **F0–F2: LIMITED_SAFE_DRAFT, не подтверждённое исправление причины.**
Основание: пользовательский ADB и снимок экрана OnePlus NE2213 Android 16/API36,
[аппаратная матрица #624](https://github.com/250oisr-eng/Pasekaapp/pull/624),
[архивный контракт](B01-DAILY-TWO-ARCHIVES-2026-11-27.md).
Базовый `main` при создании ветки: `9b570ad1ff20c7e6cc440ecf8556b14e848667c9`.

## Подтверждённое на устройстве

1. Установлен только тестовый архивный пакет `ru.paseka.journal.qa.daily`; `adb devices`: `NE2213 device`; Android 16/API36.
2. `cmd jobscheduler run -f ... 1346458437` → `Running job [FORCED]`. Android зафиксировал `START-P`, активный JobService и PID.
3. Через приблизительно 180 секунд `STOP-P ... app called jobFinished`; затем `get-job-state` = `waiting`. Последующий `dumpsys`: `Num failures: 1`, `Num system stops: 1`, `Last failed run: 2026-11-27 19:31:44`.
4. Отфильтрованный Logcat не показал `FATAL EXCEPTION`; это **не** означает отсутствие JS/WebView ошибки.
5. Снимок QA после запуска: `Архивы проверены · 2026-11-27`, `latest 2026-11-28 · проверен`, `previous 2026-11-27 · проверен`, одна кнопка восстановления. Слоты сохранены **по UI**, байтовый dump не выполнялся. Дата 28.11 получена ранее в ходе искусственного изменения часов, а не фоновым запуском.
6. **G4 фонового нового ZIP = NOT_VERIFIED.** Совпадение с нативным watchdog `180000L` обоснованно подозревает timeout, но без фазового следа первопричина неизвестна.

## Проверенные и отвергнутые трактовки

- `PERIODIC PERSISTED` доказывает планирование, но не созданный ZIP; отметка успеха соседнего задания не приписывается `PasekaDailyArchiveJob`.
- Наличие LevelDB/blob каталогов не доказывает завершение записи, SHA-256 или CRC.
- Успешный `jobFinished`-вызов не равен `OK`: watchdog вызывает `jobFinished(parameters, true)`, что считается неудачей и запрашивает retry.
- `latest.day >= current.day` обеспечивает ежедневную дедупликацию. Даже исправная задача 27 ноября могла законно **пропустить новый архив**. Однако 180-секундный запуск требует диагностики.
- Прямое принудительное повторение на текущем QA и подмена системной даты **отклонены**: не добавляют сигнала первопричины и создают лишний риск.
- Прямая замена QA APK **отклонена**: ephemeral debug signer, существующие QA данные/архивы подлежат сохранению.
- Не доказано, что причина — JS bridge, загрузка HTML, WebView origin или ожидание IndexedDB; нельзя заранее изменять эти контракты.

## Ограниченная реализация — отдельный диагностический пакет

- `android-native/PasekaDailyArchiveJob.java`: только короткие lifecycle-коды `START`, `ASSET_READY`, `LOAD_REQUESTED`, `PAGE_FINISHED`, `MAIN_FRAME_ERROR`, `RENDERER_GONE`, `WATCHDOG_TIMEOUT`, `SYSTEM_STOP`, `BRIDGE_FINISH`, `JOB_FINISHED`. Нет URL, ошибок с пользовательским текстом, записей пасеки и медиа.
- `android-native/daily-archive-worker.js`: whitelisted коды `BOOTSTRAP`, `ORIGIN`, `MARKER`, `SOURCE_OPEN`, `SOURCE_READ`, `STATE_VALID`, `STORE_OPEN`, `ROTATED`, `FAILED`, `FINISH`; ошибка остаётся `RETRY` и не выдаётся за `OK`.
- `scripts/prepare-android-daily-archives.mjs`: отдельный `diag-config`, пакет **`ru.paseka.journal.qa.daily.diag`**. Старый `config` по-прежнему собирает `.qa.daily`, основной `ru.paseka.journal` не переименовывается.
- Новый GitHub Actions `android-qa-daily-diagnostic.yml` выдаёт отдельный provenance/APK после полного `npm test`, сборки Gradle, aapt и apksigner. Workflow **не устанавливает** и не публикует APK.
- `tests/android-daily-archive-worker.test.mjs` фиксирует изоляцию, фазовые коды, отказ от вывода содержимого и fail-closed Android/WebView настройки.

**Не затронуты:** IndexedDB schema, ZIP/CRC/SHA/ротация/restore, рабочие семьи и видео, логика OP, Service Worker, права, существующие подписанные QA и production. Автосоздание архивов может выполняться только в новом изолированном тестовом sandbox.

## Критерии и следующий физический gate

1. На **точном HEAD** отдельной ветки должны пройти Node/full regressions и отдельный диагностический Android APK CI. Отсутствие workflow run не считается PASS.
2. Проверить сертификат, хеш и appId APK **`.qa.daily.diag`** до установки. Нельзя устанавливать на место `.qa.daily`, удалять прежний QA или трогать production.
3. В **новом** QA только синтетический улей/запись (при необходимости) и реальный первый архив. До него force-job может корректно `SKIP`, а отсутствие main state допустимо.
4. Однократно запустить тестовый JobService через ADB, затем читать только фазовые записи фильтром:

   `adb logcat -d -s PasekaArchiveQA:V '*:S'`

   Не публиковать полный Logcat: он может содержать персональные данные иных приложений.
5. **Диагноз**: `WATCHDOG_TIMEOUT phase=X` и отсутствие `BRIDGE_FINISH` локализует место ожидания; `BRIDGE_FINISH OK/SKIP` подтверждает завершение JS-пути, но ZIP по-прежнему проверяется отдельно в UI. Если есть `FAILED`, конкретный JS-этап известен лишь приблизительно; сообщения/содержимое базы не логируются.
6. После установления доказанной причины — **отдельное минимальное исправление**, regressions и новые exact SHA CI, затем один физический QA-тест. Без этого `G4=NOT_VERIFIED` и B01 остаётся незакрытым.

Статусы на момент подготовки: `CODE_IMPLEMENTED_DRAFT`, `CI_NOT_TESTED`, `DIAG_APK_NOT_BUILT`, `NEW_DEVICE_NOT_TESTED`, `PRODUCTION_NOT_TOUCHED`, `NO_RELEASE`.
