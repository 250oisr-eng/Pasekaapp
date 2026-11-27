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

## 27.11.2026 — новая физическая информация: WebView загрузил HTML, но JS-фазы не достигнуты

На OnePlus NE2213 Android 16 в установленном отдельно `ru.paseka.journal.qa.daily.diag`: защищённый SHA APK подтверждён, ADB install `Success`. Принудительный G4 закончился `WATCHDOG_TIMEOUT phase=START` / `JOB_FINISHED retry=true phase=START`, после чего JobScheduler начал повтор. По live logcat (запись начата до последней автоматической попытки) получено:

```text
11-27 20:15:22 WATCHDOG_TIMEOUT phase=START
11-27 20:15:22 JOB_FINISHED retry=true phase=START
11-27 20:16:23 START
11-27 20:16:23 ASSET_READY
11-27 20:16:23 LOAD_REQUESTED
11-27 20:16:23 PAGE_FINISHED phase=START
11-27 20:16:23 PAGE_FINISHED phase=START
```

**Доказано:** Java-активность JobService и чтение встроенного HTML успешны, WebView сообщил об окончании загрузки; однако JS runner ни разу не передал `JS_PHASE` до наблюдаемого момента. **Не доказано:** что именно заблокировало JS — раннее исключение, CSP, неподключённый WebView, недоступность bridge или особенности фонового рендерера. Не менять origin, схему IndexedDB или лимиты резервного копирования наугад. `active ready` не является успехом архивации.

### F0–F2: ограниченное уточнение Draft #629 (аппаратный JS probe)

- Вставлен статический маркер первого встроенного JS после CSP и маркер достижения точки входа архивного runner до любых bridge-проверок.
- В `onPageFinished` `evaluateJavascript` читает **только булевы/enum признаки** и возвращает один из `NO_INLINE`, `NO_DB`, `NO_RUNNER`, `NO_BRIDGE`, `NO_METHOD`, `READY`, `EXCEPTION`. Java выводит лишь статические метки `JS_PROBE_*`; неизвестный результат не печатается. Отдельно `JS_CONSOLE_ERROR` без текста ошибки, URL и содержимого консоли. Это не исправление корня и не обход проверок.
- Для нового подписанного APK отдельный `ru.paseka.journal.qa.daily.probe` и новый isolated workflow; исходный установленный `.qa.daily.diag` и прежние архивы не заменять. Дальнейший физический тест может быть только в **третьей отдельной QA-песочнице** с синтетическими записями, после PASS на точном SHA и проверки APK.
- Если runtime возвращает `NO_INLINE` или отсутствует callback, исследовать WebView JS/CSP/render suppression; `NO_RUNNER` — синхронное выполнение до runner; `NO_BRIDGE`/`NO_METHOD` — bridge; `READY` без `JS_PHASE` — порядок callback/планировщик. Не считать ни одну ветку установленной до фактического аппаратного вывода.
- Следующее безопасное действие на **старом** диагностическом пакете — отменить только его продолжающийся JobScheduler после сбора данных (без `pm clear`, `uninstall`, изменения часов или `force-stop` рабочего пакета). Запускать дополнительные forced retries без содержательного исправления запрещено.

До нового CI: `PROBE_CODE_DRAFT`, `PROBE_APK_NOT_VERIFIED`, `DEVICE_NOT_TESTED`, `B01_G4_NOT_VERIFIED`. Отдельный Draft #629 не сливать и ничего не публиковать.

## 27.11.2026 — на устройстве `JS_PROBE_NO_INLINE` после `PAGE_FINISHED`

На OnePlus NE2213 Android 16 в отдельном подписанном `ru.paseka.journal.qa.daily.probe` (SHA APK в [Draft #629](https://github.com/250oisr-eng/Pasekaapp/pull/629)): локальный SHA подтверждён перед установкой, ADB сообщил `Success`. Принудительный запуск дал `START`, `ASSET_READY`, `LOAD_REQUESTED`, два `PAGE_FINISHED phase=START`, оба с `JS_PROBE_NO_INLINE`; к 30 секундам JobScheduler оставался `active ready`. **Нет ни одного `JS_PHASE`, `BRIDGE_FINISH` и нового проверенного ZIP.** Это физическое доказательство отсутствия глобального inline-маркера **на момент двух callback**, а не доказательство конкретной причины (CSP, main-frame fallback, навигация, WebView lifecycle).

F0–F2: следующая минимальная граница — **только диагностические метки**:
- HTML-генератор даёт статический `id=paseka-qa-inline-marker` первому исполняемому тегу; проба различает `HTML_ABSENT` (в DOM нет целевого тега) и `INLINE_NOT_RUN` (тег присутствует, но JS-маркер отсутствует).
- Android ограниченно классифицирует без URL `PAGE_STARTED_{BLANK,LOCALHOST,LOCAL_PATH,OTHER}` и аналогично `PAGE_FINISHED_*`; отдельные статические `MAIN_FRAME_INTERCEPTED_*` и `MAIN_HTTP_ERROR`. Содержимое HTML, путей, response body, консоли, IndexedDB и SHA не журналируется.
- **Семантика функции неизменна:** CSP, `setBlockNetworkLoads(true)`, отказ любых сетевых запросов 403, существующие `loadDataWithBaseURL`, `OK/SKIP/RETRY`, watchdog и контейнер ZIP остаются прежними. Исправление первопричины до аппаратного доказательства не выдумывать.
- Следующая QA-сборка исключительно новый `ru.paseka.journal.qa.daily.dom`; прежние `.qa.daily`, `.qa.daily.diag`, `.qa.daily.probe` с нестабильными debug-подписями сохраняются без `-r`, `uninstall`, `pm clear`. Новый пакет требует точного SHA/CI и физического пробного запуска. Если HTML отсутствует — исследовать навигацию/перехват, если HTML есть и inline не исполнен — исследовать JS/CSP/WebView. `DEVICE_NOT_TESTED` для `.dom` до реального лога.

**Эксплуатационная мера:** не запускать повторные G4-попытки до содержательного изменения. При необходимости остановить только зависшие job IDs тестовых пакетов адресным `adb shell cmd jobscheduler cancel -u 0 PACKAGE 1346458437`, не трогая рабочее приложение или первоначальные два ZIP.

## 27.11.2026 — физически доказана ошибочная блокировка внутреннего главного HTML (B01/G4)

Установлен отдельный `ru.paseka.journal.qa.daily.dom`; установка и запуск ADB `Success`. На OnePlus NE2213 Android 16 в одном принудительном запуске `JobScheduler` получено:

```text
20:45:44.995 START
20:45:45.003 ASSET_READY
20:45:45.012 LOAD_REQUESTED
20:45:45.057 MAIN_FRAME_INTERCEPTED_OTHER
20:45:45.065 MAIN_HTTP_ERROR
20:45:45.091 PAGE_STARTED_LOCALHOST
20:45:45.091 PAGE_FINISHED_LOCALHOST phase=START
20:45:45.103 PAGE_FINISHED_LOCALHOST phase=START
20:45:45.103 JS_PROBE_HTML_ABSENT
20:45:45.105 JS_PROBE_HTML_ABSENT
```

**Первопричина загрузочной неисправности подтверждена:** `shouldInterceptRequest` без исключений возвращал `403 Forbidden` для всякого запроса, включая *внутренний запрос главного документа*, создаваемый `loadDataWithBaseURL()`. Это уничтожило HTML прежде, чем код архивного worker получил возможность исполниться. `PAGE_FINISHED` обозначает завершение навигации и не удостоверяет действительность HTML. Точный URI главного запроса не выводился ради приватности; `OTHER` — категория, а не утверждение, что это сетевой URL. Android WebViewClient API документирует вызов `shouldInterceptRequest` также для `data:`, а `null` возвращает загрузку ресурса обратно WebView: https://developer.android.com/reference/android/webkit/WebViewClient#shouldInterceptRequest(android.webkit.WebView,%20android.webkit.WebResourceRequest) . Предыдущий `JS_PROBE_NO_INLINE` и текущий `JS_PROBE_HTML_ABSENT` совместно подтверждают отсутствие целевого HTML после HTTP 403.

### F0–F2: минимальное безопасное исправление в Draft #629 (пока без физического PASS)

- `PasekaDailyArchiveJob.java` разрешает `return null` **строго для одного запроса главного фрейма со схемой `data:`**, только пока тот же `JobParameters` активен, под `AtomicBoolean.compareAndSet(true,false)`. Любые последующие `data:`, сетевые `http(s):`, файлы, `content:`, дочерние фреймы по-прежнему получают `403 Forbidden`.
- Сохраняются `setBlockNetworkLoads(true)`, `setAllowFileAccess(false)`, `setAllowContentAccess(false)`, `shouldOverrideUrlLoading=true`, локальный `https://localhost` base URL, CSP `connect-src 'none'`, исходная библиотека ZIP/SHA/CRC, IndexedDB, `OK/SKIP/RETRY` и watchdog. Не добавляются разрешения сети/хранилища и не отменяется проверка целостности.
- На главном внутреннем запросе логируется только фиксированный код `MAIN_FRAME_DATA_ALLOWED_ONCE`, без URL/содержимого. Все оригиналы видео, real-данные и два старых QA ZIP остаются вне изменений.
- Чтобы не заменять ephemeral-подписанный `.qa.daily.dom` и существующие QA-песочницы, вводится независимый `ru.paseka.journal.qa.daily.fix`, только синтетические записи, одноразовый APK в ранее проверенном isolated workflow (новых workflows не нужно). Он не подписан production-ключом; обновлять штатное приложение нельзя.
- **Тестовая приёмка:** exact-head Node tests, Android compile, aapt/apksigner и SHA-256 APK; затем один физический запуск с короткими scoped логами. `MAIN_FRAME_DATA_ALLOWED_ONCE` должен появиться без `MAIN_HTTP_ERROR`, затем `JS_PHASE` и `BRIDGE_FINISH SKIP` либо `BRIDGE_FINISH OK` (в зависимости от состояния только новой QA-песочницы); timeout означает fail. `OK` всё равно не доказывает байтовое восстановление, а `SKIP` не доказывает создание ZIP. Восстановление только в синтетической QA после независимой проверки.
- До физического результата **`IMPLEMENTED_DRAFT`, `B01_G4_NOT_VERIFIED`**. Ни merge, ни release, ни удаление оригиналов, ни production restore без разрешения.

## 27.11.2026 — физический G4: исправленный worker завершил принудительный JobScheduler штатно

OnePlus 10 Pro (NE2213, Android 16/API36). Пользователь установил изолированный `ru.paseka.journal.qa.daily.fix` (ADB `Success`); запустил `cmd jobscheduler run -f ... 1346458437`. Фильтрованный Logcat:

```text
20:52:48.013 START
20:52:48.021 ASSET_READY
20:52:48.037 LOAD_REQUESTED
20:52:48.081 MAIN_FRAME_DATA_ALLOWED_ONCE
20:52:48.147 PAGE_STARTED_LOCALHOST
20:52:48.284 JS_PHASE BOOTSTRAP
20:52:48.289 JS_PHASE ORIGIN
20:52:48.292 JS_PHASE MARKER
20:52:48.295 JS_PHASE SOURCE_OPEN
20:52:48.307 JS_PHASE SOURCE_READ
20:52:48.308 PAGE_FINISHED_LOCALHOST phase=SOURCE_READ
20:52:48.309 JS_PROBE_READY
20:52:48.316 JS_PHASE STATE_VALID
20:52:48.318 JS_PHASE STORE_OPEN
20:52:48.341 JS_PHASE ROTATED
20:52:48.342 JS_PHASE FINISH
20:52:48.342 BRIDGE_FINISH OK phase=FINISH
20:52:48.342 JOB_FINISHED retry=false phase=FINISH
```

Android `get-job-state` после выполнения: `waiting`. Прямое физическое доказательство: исключение для **одного** внутреннего `data:` главного документа устранило ранее подтверждённую 403-блокировку; worker прошёл полный JS/IndexedDB/rotate путь и корректно вызвал `jobFinished(...,false)` примерно за 329 мс. Старый 180-секундный тайм-аут в этом прогоне **не возник**.

**Статус строго по виду испытания:** `G4_FORCED_JOB_USER_REPORTED_PASS` при `CI_VERIFIED_EXACT_CODE_SHA=12848a220b88427f93abc906b3521fa598d7e432` (1073/1073 Node, Android/aapt/apksigner, Governance PASS). `JS_PHASE ROTATED` означает выполнение функции ротации, но не гарантирует что в этот день был создан новый ZIP: процедура может законно завершиться без нового архива. **Новый архив и его независимая целостность — NOT_VERIFIED. Естественное ежедневное срабатывание без ADB — NOT_VERIFIED. Независимое восстановление в новой QA — NOT_TESTED.**

Следующий минимальный физический шаг — только просмотр `Ещё → Резервное копирование` в **`Пасека QA — проверка исправления`** (без `Восстановить` и изменения даты), снимок статуса и двух слотов. Исходная QA с архивами 27/28 ноября, production-приложение и записи пользователя не менялись. Не сливать PR и не публиковать приложение без отдельного разрешения.

## 27.11.2026 — пользовательский скриншот первого проверенного ZIP в исправленной QA

На экране **«Пасека QA — проверка исправления»** (изолированный `ru.paseka.journal.qa.daily.fix`, OnePlus NE2213) пользователь показал раздел «Ещё» → «Резервное копирование»:

```text
Архивирование выполнено · 2026-11-27
Последний: 2026-11-27 · проверен
Предыдущий: ещё не создан
Восстановить
```

**Доказано по UI:** первый ZIP в исправленной QA-песочнице существует и приложение считает его проверенным по собственной процедуре инспекции. В `js/daily-archives.js` проверка сохранённых слотов выполняется через `checked/verify`, включая `inspect` и SHA-256; процедура `rotate` отдельно выполняет read-back `verify(saved)` до promotion. **Нельзя отождествлять UI-отметку с независимой внешней проверкой оригинальных байтов и восстановлением.**

Совместно с физическим журналом `MAIN_FRAME_DATA_ALLOWED_ONCE`, полным `JS_PHASE` и `BRIDGE_FINISH OK retry=false` подтверждено исправление 403 и функционирование пути создания/проверки хотя бы одного ZIP. Но скриншот сделан **после открытия приложения**: оно самостоятельно выполняет catch-up архивирования при запуске. Поэтому источник первого ZIP (фоновый JobScheduler или foreground catch-up) **НЕ АТРИБУТИРОВАН**. Второй календарный день и сохранение двух проверенных поколений в этой QA пока не проверены. Естественное без-ADB выполнение фоновой задачи также `NOT_VERIFIED`.

**Следующий аппаратный gate:** не изменяя часы, не запуская forced job, не восстанавливая данные, дождаться естественного следующего дня и по возможности снять read-only scoped Logcat/состояние JobScheduler **до открытия** QA (чтобы не смешать фоновый и foreground catch-up), затем проверить на экране `latest/previous` после открытия. Переход на другую дату не равен доказательству автоматического фонового создания. Рабочее приложение и исходная QA-песочница с архивами 27/28 ноября не изменялись. PR остаётся Draft.
