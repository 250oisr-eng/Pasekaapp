## 2026-11-22 — OnePlus: физический PASS локального ONNX Runtime Web / WASM

Пользователь передал полный JSON с OnePlus после выдачи исправленного тестового APK из [сборки #45000574979](https://github.com/250oisr-eng/Pasekaapp/actions/runs/45000574979), исходный коммит 1cc6be654d93c19f9b9da25782f60d994e3b4649, APK SHA-256 e6a5c5adec9645df1372fd307b3f25b4e7a0920dd9ffdbf3bccacd4f0984635e. Это контрольная сумма выданного файла; отчёт телефона не содержит собственного измерения SHA.

```json
{"status":"PASS","code":"LOCAL_ONNX_WASM_ADD_2_EXACT","packageId":"ru.paseka.journal.diagnostic.ortmodule","model":"SELF_AUTHORED_SYNTHETIC_ADD_2_ONLY","runtime":"PASS","beeRecognition":"NOT_TESTED","videoAccess":"NOT_ATTEMPTED","cleanup":"NOT_TESTED","externalRequests":"NOT_ATTEMPTED","input":3,"output":5}
```

Физическая проверка загрузки локального модуля и исполнения синтетического графа завершена. Повтор на OnePlus не нужен. Следующий этап — проверка происхождения и условий распространения конкретных весов детектора летка перед автономным испытанием на размеченных кадрах. Допуск к распознаванию и удалению видео остаётся закрытым.

## 2026-11-22 — повтор ONNX без замены ранее установленного приложения

В #352 на 73b9d014 исправленный APK успешно собран (run 45000158169), общая сборка также успешна. У старого и нового APK с одинаковым ID ortsmoke разные SHA-256 сертификатов v2: ffbbd3ade07803840b90151fc0f6dca0a682c23aa6108c22ab4beb4fe4af19dd и c39141c52510009fd0cc8f8579e551979f58e6cc19a4896b6ec5b3dd38338288. Контрольные суммы обоих ZIP сверены с данными GitHub. Для совместной установки новая диагностика получила отдельный ID ru.paseka.journal.diagnostic.ortmodule. Исправлена проверка результата: только точное float32 5 даёт PASS; регрессия включает NaN, бесконечность и соседнее значение. Отчёт, проверка aapt и регрессия привязаны к новому имени. После сборки проверить SHA артефакта и передать APK для одного физического теста. Старый APK остаётся установленным. Распознавание пчёл и очистка не проверяются.

## 2026-11-22 — Android ONNX physical BLOCKED, Draft PR #352

- Physical report: isolated package ru.paseka.journal.diagnostic.ortsmoke, ORT_ERROR no available backend found / Failed to fetch dynamically imported module; runtime BLOCKED. Bee recognition/video access/cleanup not tested.
- Draft PR #352 (branch fix/android-ort-webview-local-module-2026-11-22) proposes same-app preflight .mjs load, typed JS Blob URL, absolute packaged WASM URL and Blob revocation, plus regression tests. No production app, existing data, or video changed.
- CI at exact HEAD and Android retest NOT YET VERIFIED. Next: verify isolated APK workflow and one-tap on-device result. No merge, deploy or deletion.

---

## Android ONNX WASM — exact-SHA CI PASS и проверенный APK (2026-11-22)

- После начальных ошибок изолированного CI исправлен запуск реального WASM в Node: Node ESM не поддерживает `http:` JS-модуль; используются только локальные `file:` для JS и `data:` для pinned WASM, **без внешнего HTTP**. Дополнительно общий `npm test` пропускает специализованное ONNX runtime испытание с явной пометкой skip, а isolated workflow `PASEKA_SYNTHETIC_ORT_CI=1` обязательно выполняет и не позволяет skip. Это устранение реальных CI failure, не скрытие проблем.
- На code SHA `9003ba94d6f621b2a02db8eea9a4f7bd073e6c26`: [isolated workflow #44999470475](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44999470475) **completed/success** на повторной попытке после внешнего сбоя загрузки Maven/Gradle (в первой попытке зависимость `org.jetbrains.kotlin:kotlin-stdlib-jdk8` и другие не находились; библиотеки/зеркала не менялись). Фактически прошли ONNX Runtime Web WASM `3+2=5`, подготовка web-assets, Gradle debug APK, `aapt` проверки изолированного package, upload. [Generic Android #44999470546](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44999470546) **completed/success**. Archive isolated workflow `#44999470466` skipped, не является тестом восстановления.
- GitHub artifact ZIP `paseka-synthetic-onnx-wasm-isolated-apk`, ID `14744334351`, ZIP 7 965 464 B, digest SHA-256 `24a37fab78c8e612f1cc861cf093b58123dbbca8cc051d681ee3d00d517f1cad` — независимо совпал с GitHub. Извлечён единственный `app-debug.apk`, 12 913 955 B, SHA-256 `4eb4bddf9addc37f96f4afd7fe12248606d90dcea3f07504f26056d68eba6160`. В APK подтверждены `assets/public/ort.min.js`, `ort-wasm-simd-threaded.mjs`, `ort-wasm-simd-threaded.wasm` (14 848 852 B), `synthetic-add.onnx` (127 B), тестовый runner. Ссылка на extracted APK предоставляется пользователю в чате.
- **Физический Android запуск ONNX ещё NOT_TESTED.** Даже физический PASS будет означать только синтетическую локальную математику через ONNX WebView WASM, не bee detection, real media, source-bound recognition, и не cleanup. Исходные три физические PASS для IndexedDB, MP4 playback, 3 JPEG frames сохраняются. Старые тестовые APK и данные не очищать.
- Следующий шаг: одно безопасное тестовое приложение на телефоне, одна кнопка и полный PASS/BLOCKED отчёт. После этого оценивать реальную модель только при подтверждённых лицензиях конкретных весов и независимых benchmark. main/deploy/merge/удаление не выполнялись.

---

## Android — test-only локальное ONNX WASM исполнение (2026-11-22)

- Подготовлен полностью **авторский синтетический ONNX граф** `Add(x,bias=2)` (вход float32[1] `3` → ожидаемый выход `5`), программно собираемый только из protobuf-структур в `scripts/generate-synthetic-onnx.mjs`. Ни один байт обученных весов третьих лиц не используется; модель не распознаёт ни пчёл, ни изображений.
- Создан новый независимый тестовый APK `ru.paseka.journal.diagnostic.ortsmoke`, не меняющий production, `selftest`, `mediatest` и `frametest`. `scripts/prepare-android-synthetic-ort-apk.mjs` упаковывает локально `onnxruntime-web@1.31.1` (MIT), `ort.min.js` и однотредовый WASM-бэкенд из пакета, без CDN/API. Кнопка `tests/fixtures/android-synthetic-ort-runner.js` вызывает `InferenceSession.create` только для локального `synthetic-add.onnx`, `session.run({x:3})`, сверяет строго `5`, возвращает один отчёт PASS/BLOCKED.
- `tests/android-synthetic-ort.test.mjs` проверяет отсутствие доступа к пользовательскому видео/IndexedDB/network и выполняет **реальное WASM вычисление с тем же синтетическим ONNX** в Node CI; тест fail-closed, не допускает skip при отсутствии runtime. Отдельный workflow `.github/workflows/build-android-synthetic-ort-apk.yml` ставит только test-only pinned runtime, запускает тесты, собирает отдельную APK и проверяет package ID.
- **Границы:** даже будущий аппаратный PASS будет означать лишь offline execution математической ONNX модели, НЕ доказательство детекции пчёл, качества, лицензии сторонних весов, tracking/direction, `recognitionSucceeded` или удаления. Ни одна из семи найденных моделей пчёл не допущена к исполнению; пользовательские видео/данные/backup и production не затрагиваются.
- Следующий gate: проверить CI на exact HEAD и ошибки, получить точный SHA APK, только затем предоставить Android тест по одной кнопке. Никакого автоматического install/restart/cleanup.

---

## VIDEO MODEL — InsectAI Model Zoo: цепочка лицензии весов (2026-11-22)

- Проверены первичные LICENSE: `IDEA-Research/GroundingDINO` Apache-2.0 (GitHub blob SHA `f1460f5e6ad1e90abb720a1536a46e3d057686a9`) и `darsa-group/flat-bug` MIT (blob `bee96279e49757f77280f9c8ddf0bf28983dda2d`). Независимый InsectAI Model Zoo отдельно предупреждает о непрямом происхождении лицензионных ярлыков.
- Grounding DINO — общий text-guided detector с опубликованными checkpoints, но **неизвестны** права на конкретный checkpoint/его SHA-256 и offline Android RAM/perf, нет независимого benchmark летка. У flatbug каталог сообщает об AGPL-уведомлении в весах Ultralytics несмотря на MIT кода; типовая задача top-down плоский фон, не леток. Оба — **BLOCKED**, веса не загружены.
- Добавлены кандидаты в `tests/fixtures/bee-detector-candidate-inventory.json` (всего 7), регрессионный `tests/video-bee-candidate-inventory.test.mjs` и документальная сверка `docs/VIDEO-BEE-DETECTOR-CANDIDATE-REVIEW-2026-11-22.md`. Даже при корректной лицензии исходника никакой model inference и удаление оригиналов не разрешены.
- Следующий безопасный этап: синтетический самостоятельно созданный ONNX/офлайн WebView WASM smoke-test runtime, отдельно от реально обученной модели. Не выдавать `runtime PASS` за `recognition PASS`. Никаких изменений пользовательских данных, хранилищ, архивов, записей телефона или production.

---

## Видео / реальная модель — проверка LICENSE первичных репозиториев (2026-11-22)

- По публичным GitHub-файлам прочитаны MIT `AjayJohnAlex/Bee_Detection/LICENSE` (blob `891259553e1a6f161d94cdb5d370c9cfaf59e56b`) и GPL-3.0 `Gratheon/models-gate-tracker/LICENSE` (blob `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7`). `Ajay.../requirements.txt` подтверждает Ultralytics 8.0.134, torch 2.0.1 и deep-sort-realtime; Gratheon использует HTTP server и внешние модели. **Лицензии кода не дают автоматически права на конкретные веса**, базовый checkpoint и датасет. Immutable upstream commit и SHA реальных весов НЕ получены.
- Добавлена новая `tests/fixtures/bee-detector-candidate-inventory.json`: пять публичных кандидатов со статусами `BLOCKED`, без бинарных моделей и без утверждений о проверенной лицензии весов; `tests/video-bee-candidate-inventory.test.mjs`: регрессии против ошибочного продвижения repo MIT/GPL в weights rights, с вызовами существующего fail-closed `PasekaVideoDetectorCandidateGate`.
- Дополнен `docs/VIDEO-BEE-DETECTOR-CANDIDATE-REVIEW-2026-11-22.md` конкретными первичными лицензиями, библиотеками и остаточными неизвестными. Не импортировался `.pt`, не выполнялись скрипты из внешних репозиториев, не подключены веса и не изменялись пользовательские видео/база/офлайн-кеш.
- Next: проверить CI на exact HEAD нового Draft PR. После этого исследовать доказуемые разрешения на *файл весов + базовую предобученную модель + датасет*, pinned hash и конвертируемость без исполнения untrusted pickle. Offline Android inference / actual video recognition / cleanup остаются NOT_TESTED.

---

## 2026-11-22 — проверен кандидат maxim2100

Полное дерево содержит один yolov8n.pt. Его связь с результатом обучения на пчёлах и разрешение на распространение не подтверждены. В демонстрации подпись Bee присваивается всем рамкам. Решение и фиксированные исходники — в [отчёте](docs/VIDEO-BEE-DETECTOR-CANDIDATE-REVIEW-2026-11-22.md). Следующий шаг — поиск опубликованных весов детектора летка с явной лицензией. Участие пользователя не требуется.

## 2026-11-22 — проверка весов bee-yolo-tracking

В фиксированной ревизии vladvroust есть одноклассовая конфигурация для пчёл и метка bee. Оба видеосценария загружают общие cfg/yolo.cfg и bin/yolo.weights. В полном дереве этой ревизии требуемого файла и отдельно идентифицируемого обученного checkpoint пчёл не найдено; при проверке список GitHub Releases был пуст. Корневой LICENSE содержит GPLv3. Происхождение конкретных весов, их контрольная сумма и условия распространения остались неподтверждёнными. Решение — исключить эту ревизию из очереди испытаний на устройстве. Следующий кандидат для проверки — maxim2100/bee-detection-classification: сопоставить файл весов с реальной задачей детекции и условиями автора до загрузки.

## 2026-11-22 — Gratheon: проверка назначения весов

В [ревизии 21faabd](https://github.com/Gratheon/models-gate-tracker/tree/21faabd0ea2d57f9e0d4434fc47b5af0839fbb81) BeeDetection.py использует контуры OpenCV и fitEllipse, а BeeClassification.py запускает predict_on_batch для классификации подготовленных изображений. В дереве есть SavedModel с переменными, корневой LICENSE содержит GPLv3, Training/BeeDataset подключён отдельным подмодулем BeeAlarmed/BeeDataset. Проверены исходники и метаданные; веса не скачивались. Отдельная модель классификации не решает задачу локализации на полном кадре. Следующий шаг — проверить происхождение весов следующего кандидата для детекции летка. На SHA 23728d707bc3229b5944e6939ca2fc3954424e59 локально прошли 3/3 теста допуска, Android CI #44955879058 успешен, #44955879068 пропущен.

Для #344 получен физический MEDIA_ERROR_4_android-proof-black после сверки SHA, белый кадр не проверялся. PASS трёх кадров H.264 в #347 относится к другой фикстуре. Повтор запусков от пользователя сейчас не требуется.


## VIDEO MODEL — проверка реальных кандидатов и fail-closed gate (2026-11-22)

- После физического PASS IndexedDB, синтетического MP4 playback и трёх JPEG кадров проведён независимый аудит кандидатов для Android: Matt Nudi, Apiarist YOLOv8s, Honey-Bee-Society AutoGluon, Gratheon gate tracker и MIT ONNX Runtime. Подробности и публичные первичные ссылки — `docs/VIDEO-BEE-DETECTOR-CANDIDATE-REVIEW-2026-11-22.md`.
- Matt Nudi публикует `best.pt` и внутренние метрики, но лицензия весов/базовой модели и мобильный runtime не подтверждены. Apiarist заявляет Apache-2.0 для весов и классы Worker/Drone/Queen/Varroa, но модель обучена для осмотра рамок, а не летка, базовые YOLOv8s/Ultralytics AGPL условия нуждаются в отдельной проверке. Honey-Bee-Society — классификатор (~383 MB), не детектор/трекер летка. Gratheon — исходный серверный Jetson/Python pipeline, недоказаны лицензия конкретных весов и offline WebView. **Ни одна модель не допущена** к inference/копированию в APK.
- Новый `js/video-detector-candidate-gate.js` — только неактивный анализ доказательств, без сети, хранилищ, весов и вызовов модели. Возвращает конкретную причину блокировки при отсутствии прав, SHA, mobile runtime или независимого benchmark; даже при всех самодекларированных положительных полях не разрешает `canDownloadWeights`, `canRunInference`, `recognitionSucceeded`, `cleanupAuthorized`. Добавлен `tests/video-detector-candidate-gate.test.mjs` с отрицательными сценариями.
- Главная точка неопределённости: проверить immutable license chain *конкретных весов* и базовой модели, а затем реальную пригодность для детекции летка. Нельзя скачивать/исполнять untrusted `.pt` pickle и выдавать презентационные метрики за независимую точность.
- Следующее: CI exact HEAD для нового Draft PR, ревью результатов и последующая проверка доступных модели/лицензий. Не трогать существующие тестовые приложения и видео, не создавать production data, не удалять ничего.

---

## ANDROID FRAME TEST — подтверждён PASS на физическом телефоне (2026-11-22)

- Пользователь выполнил установленную изолированную APK `ru.paseka.journal.diagnostic.frametest` на физическом телефоне и передал полный текст отчёта: `status: PASS`, `code: SYNTHETIC_MP4_THREE_FRAMES_EXTRACTED`, `fixtureSha256: 29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49`, `frameExtraction: PASS`, `frames: 3`, `width: 64`, `height: 64`, `recognition: NOT_TESTED`, `cleanup: NOT_TESTED`, `actualVideos: NOT_ACCESSED`.
- Это **отчёт пользователя о физическом запуске** изолированной сборки, а не независимый ADB-лог. Прохождение проверок означает три JPEG кадра из оригинальной синтетической 1720-байтной H.264-фикстуры со сверенным SHA-256, без доступа к данным пасеки. Отдельно ранее на телефоне подтверждены IndexedDB round-trip и синтетическое воспроизведение MP4. Достоверность real-world detection/tracking из этого НЕ следует.
- На ранее актуальном SHA `d7f6413eb66c90c53d2e10836b491de0b341c7e5` GitHub Actions **completed/success**: isolated frame APK #44955064401 и общая Android APK #44955064399; архивная isolated APK workflow #44955064402 skipped, не является тестом. Code SHA исходного APK `26a2de0af6ba5ba23198a6ff1802e66789f18446`, CI #44954851869 completed/success.
- Никаких повторов one-shot, очистки, переустановки тестовых APK или удаления файлов. Непроверенными остаются реальные MP4, оригинальный архив restore, реальное распознавание пчёл, сохранение результата и политика удаления после успешного распознавания.
- **Next:** отдельный этап поиска и правовой/технической проверки конкретного бесплатного детектора Apis mellifera с фиксированными весами и лицензией; без подтверждения provenance, accuracy и Android offline runtime не запускать inference и не разрешать cleanup. Существующие test-only APK/данные сохранить.

---

## ANDROID FRAME TEST — verified CI APK and direct phone handoff (2026-11-22)

- На code/test SHA `26a2de0af6ba5ba23198a6ff1802e66789f18446` [workflow #44954851869](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44954851869) **completed/success**: fixture SHA check, static safety tests, Capacitor web test package, Gradle debug APK, `aapt` package identity and artifact upload; generic Android workflow #44954851844 success, архивный isolated APK workflow skipped.
- Verified GitHub artifact `paseka-synthetic-frame-extraction-isolated-apk`, ID `14726629748`, ZIP 3343582 байта, SHA-256 `fb8de747050e545649ec2b856dd5942d84a956c9cc2c2554e830d3343eefaec2` (соответствует digest GitHub); содержит ровно `app-debug.apk` 8282933 байта, SHA-256 `0e80aaff0d6b327f41ec09b41700f2e3671d4656792cd7ee26e746a415e9e0c6`. Извлечённый APK предоставлен в чате для теста на Android без ПК.
- **Физический результат извлечения кадров — NOT TESTED.** Исходные installed `selftest` и `mediatest` не заменять/не очищать. Один запуск новой кнопки, один отчёт; PASS будет подтверждением только synthetic frame extraction, не ML recognition. User videos/backup/IndexedDB не изменены. Merge/deploy не выполнялись.

---

## ANDROID VIDEO — следующий аппаратный gate: три JPEG-кадра из синтетического MP4 (2026-11-22)

- Изучен реально существующий `js/entrance-frame-preparation.js`: извлекает 2–4 временных JPEG кадра из видео после SHA-проверки, не содержит ИИ inference/удаления. Лицензионная проверка конкретных весов модели и независимое качество detector отсутствуют; **распознавание пчёл пока нельзя объявить протестированным**.
- Для дальнейшего доказательства **без обращения к пользовательскому видео** создан независимый тестовый Android package `ru.paseka.journal.diagnostic.frametest`. Он проверяет SHA ранее физически воспроизведённого синтетического 1720-byte MP4, запускает **тот же** модуль `entrance-frame-preparation.js` в Android WebView, извлекает три JPEG-кадра, проверяет формат, геометрию 64×64, возрастающие timestamp и повторный хэш исходного Blob. В отчёте выводится только счётчик/геометрия, не JPEG или видео.
- Файлы: `tests/fixtures/android-synthetic-frame-extraction-runner.js`, `scripts/prepare-android-synthetic-frame-apk.mjs`, `tests/android-synthetic-frame-extraction.test.mjs`, `.github/workflows/build-android-synthetic-frame-apk.yml`. Новый пакет отличен от production, `selftest`, `mediatest` и `restoreproof335`; исходные тестовые APK не сбрасываются. Нет MediaStore, IndexedDB, network, удаления, model weights, background services.
- **PASS в будущем будет означать лишь факт получения трёх JPEG-кадров синтетической записи на телефоне**. Не будет подтверждать качество кадра по содержимому, наличие пчелы, detection/inference, трекинг, распознавание или cleanup. Все такие статусы остаются `NOT_TESTED`.
- Next: новый Draft PR, проверка workflow на точном HEAD, только после success извлечение APK и физический тест по одной кнопке. Merge/deploy/production, изменение и удаление пользовательских файлов запрещены.

---

## ANDROID MP4 — физический PASS синтетического декодирования (2026-11-22)

- Пользователь запустил отдельный APK `ru.paseka.journal.diagnostic.mediatest` на реальном телефоне и передал текст результата: `status: PASS`, `code: SYNTHETIC_H264_METADATA_PLAYBACK_PROGRESS`, `fixtureSha256: 29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49`, `videoDecode: PASS`, `width: 64`, `height: 64`, `currentTime: 0.2478`. Это пользовательский отчёт **реального тестового запуска**, а не независимый ADB-лог; подтверждён программный gate метаданных, `playing` и `timeupdate >0.05` на синтетическом H.264.
- Отчёт одновременно фиксирует `recognition: NOT_TESTED`, `cleanup: NOT_TESTED`, `actualVideos: NOT_ACCESSED`. **Нельзя** переносить PASS на реальные MP4, модель распознавания, файл архива PASEKA01 или удаление видео после успешного распознавания.
- На прежнем code SHA `f0d7f5e80ebc6995c743578b006d416c0eb320d8` workflow #44954165092 завершён success; на последнем проверенном перед этой записью SHA `3b1409c50acaa74b09b8c0369d8af14973e01b97` изолированная сборка #44954365300 и общая Android сборка #44954365266 — success. Workflow архивного APK skipped, не считать успехом.
- Сохранить существующие тестовые APK/хранилища, **не повторять one-shot**, не удалять реальные и синтетические видео или архивы. Следующий независимый шаг: изучить доступную реализацию распознавания и подготовить отдельный test-only gate на синтетическом входе без воздействия на пользовательское хранилище. Любую очистку реальных видео допускать только после отдельно доказанного завершения распознавания и подтверждения пользователя.

---

## ANDROID MP4 — успешная test-only APK сборка и независимая проверка артефакта (2026-11-22)

- Code/test SHA `f0d7f5e80ebc6995c743578b006d416c0eb320d8`: [GitHub Actions #44954165092](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44954165092) — **completed/success**, включая pinned MP4 SHA/length, Node static safety regressions, Capacitor sync, Gradle assembleDebug, `aapt` проверки уникального тестового package и upload APK ZIP; generic Android build #44954165090 — completed/success. Skipped isolated archive workflow не считать проверкой.
- Artifact `paseka-synthetic-mp4-decoder-isolated-apk` ID `14727076715`; ZIP 3 343 556 байт, GitHub и независимый SHA-256 совпали: `a0de4fd5b1dda7d5455f2bdba4d7e618bf4e2b5c7c375831babcf734d646bc60`. ZIP содержит ровно `app-debug.apk`, 8 280 639 байт, независимый SHA-256 `7b896afcd7f5c53dde75b6aa5d343f376b71269b7bebdf6e6b186a43366ff64e`. Экстрактованный APK предоставлен пользователю отдельной ссылкой в диалоге; не публиковался в production.
- Следующее доказательство — пользовательский скриншот после **однократного** запуска кнопки в новом отдельном APK на Android. Не удалять/не переустанавливать старое приложение `selftest`. MP4 hardware decoding ещё NOT_TESTED, recognition, restore и cleanup NOT_TESTED; первый PASS IndexedDB сохраняется.

---

## ANDROID MP4 — изолированный тест синтетического H.264 (2026-11-22)

- После физического PASS отдельного IndexedDB теста стартовал **новый** изолированный test-only APK `ru.paseka.journal.diagnostic.mediatest`, не заменяет `ru.paseka.journal.diagnostic.selftest`, production `ru.paseka.journal` и архивный `restoreproof335`.
- Фикстура `tests/fixtures/android-synthetic-mp4.js`: оригинально сгенерированный **чёрный H.264 baseline MP4 64×64, 1.6 с, без аудио, 1720 байт**, локально при помощи ffmpeg `lavfi color`, SHA256 `29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49`; base64 хранится в исходном коде, без сети и сторонних медиа. Это не настоящие видео пасеки.
- `tests/fixtures/android-synthetic-mp4-runner.js`: один запуск по нажатию; создаёт Blob в памяти, HTMLVideoElement `play()`; PASS только при метаданных 64×64/duration>1, событии `playing`, `timeupdate` и `currentTime>0.05`, затем SHA256 фикстуры. Ошибка/таймаут/блокировка autoplay => BLOCKED; URL освобождается в памяти, **никаких пользовательских файлов и IndexedDB не трогает**.
- `scripts/prepare-android-synthetic-mp4-apk.mjs`: сборка отдельного package в чистом checkout при `PASEKA_SYNTHETIC_MEDIA_BUILD=1`; `tests/android-synthetic-mp4.test.mjs`: SHA/длина/MP4 header, изоляция и статические запреты внешнего storage/network/delete. Отдельный workflow `.github/workflows/build-android-synthetic-mp4-apk.yml` строит и проверяет test-only APK.
- **Только программный этап**: физический Android decoder PASS/FAIL/BLACK SCREEN ещё NOT TESTED; распознавание пчёл, оригинальные MP4, восстановление и очистка — NOT TESTED. Никаких автоматических удалений/переустановок/миграций/production.
- Дальше: создать Draft PR, проверить CI на точном HEAD; APK устанавливать только после успешной сборки и подтверждения точного package/хэша. Прежнее тестовое приложение и его доказательство сохранить.

---

## ANDROID SELF-DIAGNOSTIC — физический PASS по скриншоту пользователя (2026-11-22)

- Пользователь установил отдельную тестовую APK на физический Android и прислал скриншот экрана «Диагностика Пасеки» после однократного запуска кнопки. На экране: `status: PASS`; `packageId: ru.paseka.journal.diagnostic.selftest`; `database: paseka-self-diagnostic-only-v1`; `syntheticRecords: 2`; `videoDecode: NOT_TESTED`; `recognition: NOT_TESTED`; `cleanup: NOT_TESTED`; `productionAccess: NOT_ATTEMPTED`. Это **физическое наблюдение UI**, не независимый протокол Android/ADB; его достаточно для подтверждения завершённого изолированного теста IndexedDB, но не для доказательства других этапов.
- Для code/test SHA `ef283fdf3bf172d21ed69afdaf5a5cfff58fdc75` CI #44953473256 был success; после документальных обновлений новый HEAD `5170a8b5c6248bbe28a97e55d60ddcd679acf276` также имеет success для test-only APK и Build Android APK, isolated archive workflow skipped.
- **Не повторять** one-shot тест, не переустанавливать приложение, не очищать `paseka-self-diagnostic-only-v1`: сохранять диагностическую базу как доказательство. Исходный PASEKA01, 2 MP4, их декодирование/распознавание и удаление остаются NOT_TESTED.
- Следующий независимый безопасный этап: проектировать отдельный one-button тест медиадекодирования **только встроенной синтетической MP4-фикстуры** с доказанным происхождением и SHA, без `MediaStore`, без чтения/удаления реальных файлов, и отдельно подтвердить его на устройстве. Не смешивать PASS IndexedDB с PASS MP4 или cleanup.

---

## Android self-diagnostic — isolated APK CI PASS (2026-11-22)

- На точном SHA `ef283fdf3bf172d21ed69afdaf5a5cfff58fdc75` workflow [#44953473256](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44953473256) — **completed/success**. Все шаги завершились успешно: JS/IndexedDB тесты, подготовка web assets, Capacitor sync, Java/Gradle `assembleDebug`, проверка `aapt` на отдельный `ru.paseka.journal.diagnostic.selftest`, публикация только CI-артефакта (НЕ production).
- Артефакт `paseka-self-diagnostic-isolated-apk` ID `14726119493`, ZIP digest SHA-256 `83c9ff5481f46610a75de2f5736948c976c75fb4a42593a2a8486223633b022e` (SHA именно **ZIP**, не APK), размер ZIP 3342185 байт, expiry `2026-12-05T21:50:24Z`. Build Android APK #44953473285 также completed/success на этом SHA. Отдельный workflow из старой цепочки skipped, не считался тестом.
- APK **не установлен** на телефоне и работа реального Android WebView/IndexedDB ещё NOT_TESTED. Исходный restore335 архив, настоящие видео, их декодирование, распознавание и удаление не тронуты. Никаких прав на production, слияние или release не давалось.
- Следующий безопасный этап: проверить пользовательский способ установки test-only APK непосредственно с телефона и один запуск кнопки диагностики; не запрашивать ПК и не подменять тестом двух синтетических Blob доказательство реального восстановления MP4.

---

## Android self-diagnostic: изолированная первая версия (2026-11-22)

- Пользователь разрешил начать подготовку диагностики одной кнопкой непосредственно в Android-приложении, без ПК. Для исключения повреждения реальных данных первый этап реализован **только в отдельном тестовом APK**, package `ru.paseka.journal.diagnostic.selftest`, независимо от production и restoreproof335.
- `tests/fixtures/android-self-diagnostic.js`: по нажатию единственной кнопки до создания базы проверяет `indexedDB.databases()`; если база `paseka-self-diagnostic-only-v1` уже существует или проверка невозможна, **BLOCKED**. Иначе создаёт только эту отдельную базу, атомарно записывает два синтетических Blob, закрывает/открывает IndexedDB и побайтово сравнивает две записи. Тестовая база сохраняется для форензики; повторная запись запрещена. Приложение не читает реальные архивы, видео, пользовательскую IndexedDB или MediaStore; никакого удаления.
- `scripts/prepare-android-self-diagnostic-apk.mjs`: генерация отдельной HTML-страницы и package ID при явном `PASEKA_SELF_DIAG_BUILD=1` в чистом CI. `tests/android-self-diagnostic.test.mjs`: успешный round-trip, отказ при существующей базе, отсутствие API inventory, статический safety gate. `.github/workflows/build-android-self-diagnostic-apk.yml`: отдельная GitHub Actions сборка debug APK + проверка уникального package.
- **Границы доказательства:** даже PASS подтверждает только два синтетических Blob в собственной базе; НЕ подтверждает восстановление PASEKA01, две настоящие MP4, медиадекодер, распознавание, очистку после распознавания и отсутствие внешних копий. По всем этим пунктам `NOT_TESTED`.
- **Next:** дождаться CI на точном HEAD новой рабочей ветки и исправить проблемы, не публиковать и не устанавливать APK автоматически. Для ручной установки на устройство требуется отдельный согласованный безопасный сценарий; прежние одноразовые ADB действия не повторять.

---

## RESTORE335 — case-sensitive проверка private input ENOENT (2026-11-22)

- Ужесточён read-only parser gate: ENOENT принимается только для **точного** пути `files/fileproof335-input.paseka` с учётом регистра (`-cmatch`); ответ с `files/Fileproof335-input.paseka` блокирует `PRIVATE_INPUT_ABSENCE_NOT_CONFIRMED` до вызова `dd`. Это предотвращает ложное доказательство отсутствия целевого файла при диагностике другого имени на Android.
- Изменены `tools/android-restore335-dd-zero-count-parser-readonly.ps1` и `tests/mock_android_restore335_dd_zero_count_parser.py`; добавлен негативный сценарий `stat_wrong_case`. Code/test SHA `576c7260c5c4d4cdf49a5cf9cc8edb8e407e04e9`.
- Новая версия **пока не прошла CI на своём итоговом SHA** и не запускалась на телефоне. Не выполнять ADB-тест на устройстве до успешного CI. Не повторять прежний write-test, не изменять и не удалять видео, архивы или данные.

---

## 2026-11-22 — RESTORE335: согласование диагностики stat и тестов CI

На HEAD 623bfc3f364783f45dab5032f49e12691a9a06ec запуск #44949902977 упал: при неоднозначном stat скрипт корректно завершился до dd, но mock требовал count=0. Матрица теперь проверяет отсутствие любого вызова dd при отказе предварительных проверок, один вызов при ошибке baseline и два при допуске. Принят только ENOENT для точного имени входного файла (exit 0/1). Добавлены отказ доступа с «cannot stat», ошибка для другого пути и ENOENT на stderr. Следующий шаг после успешного CI — один read-only запуск с OnePlus NE2213/API36. Реальная запись, restore и cleanup не проверялись.

## RESTORE335 — fail-closed проверка stat перед read-only dd (2026-11-22)

- В Draft PR #341 диагностический скрипт `tools/android-restore335-dd-zero-count-parser-readonly.ps1` теперь останавливается с `PRIVATE_INPUT_ABSENCE_NOT_CONFIRMED`, если `stat` возвращает тип файла, неизвестный ответ или отказ в доступе. Один лишь пустой `ls -A files` недостаточен для продолжения при противоречащем ответе `stat`.
- Дополнена mock-ADB / real-pwsh матрица для `stat_regular`, `stat_unrecognized`, `stat_permission_denied`. Это тесты без записи, удаления и запуска Android-приложения.
- Code SHA до документации: `a6978b0f55fef35ff30189835e861c39950c54cb`. **CI после исправления ещё должен быть проверен на актуальном HEAD**, ранее успешный CI относится к `cdda1f6e5caf0babe12c96e57b5f5000904a4fdf`.
- Физический запуск нового скрипта, restore IndexedDB, воспроизведение и удаление двух MP4 по-прежнему NOT TESTED. Следующий шаг: проверить успешный CI на точном SHA, затем только один read-only parser probe на NE2213/API36, без повторения старой записи.

---

## RESTORE335 — физический v2-аудит: files/ пуст, dd conv=excl требует проверки парсера (2026-11-22)

- Пользователь выполнил pinned `tools/android-restore335-post-dd-failure-readonly-v2.ps1` на OnePlus NE2213/API36 после прежнего one-shot `EXCLUSIVE_TEST_PRIVATE_INPUT_STAGE_FAILED`: host ADB 1.0.41 SHA PASS; исходный PASEKA01 3158B SHA PASS до и после; `PRIVATE_FILES_DIRECTORY: PRESENT`; `PRIVATE_INPUT_STAT_EXIT_CODE: 0`, `PRIVATE_INPUT_STAT_STDOUT_BYTES: 67`, `PRIVATE_INPUT_STAT_STDERR_BYTES: 0`, `PRIVATE_INPUT_STAT_ERROR_CLASS: NONE`; `PRIVATE_INPUT_FILE_TYPE: UNKNOWN_OR_ABSENT`; `PRIVATE_FILES_VISIBLE_ENTRY_COUNT: 0`, `PRIVATE_FILES_LIST_CLASS: EMPTY`; `SHELL_T_RUN_AS_CWD: MATCH`; `PRIVATE_DIR_WRITE_PERMISSION_TEST: ALLOWED`; `DD_HELP_EXIT_CODE: 0` и упоминание `excl`, `fsync`, `none` = True; `STATUS: RESTORE335_POST_FAILURE_READONLY_AUDIT_V2_COMPLETE`. **С высокой уверенностью приватный input файл отсутствует, но точные 67 байт `stat` не были показаны; прежнее скриптирование ошибочно доверяло exit 0 для диагностик на stdout. Нельзя выдавать ROOT CAUSE за подтверждённую.** Original сохранён; private directory пуст.
- Подозрение, основанное на внешнем исходнике Android Toybox: `toys/posix/dd.c` из Android репозитория перечисляет `excl` в справке, но `dd_conv[]` содержит `fsync,noerror,notrunc,sync` и комментарий `TODO sparse excl nocreat` (https://android.googlesource.com/platform/external/toybox/+/90937f6e7e180bc1c54e6e7e9e287f1fada9c203/toys/posix/dd.c). Это версия исходника, не идентифицированный бинарник пользователя: **поддержка `conv=excl` на телефоне остаётся непроверенной**.
- В Draft PR #341 добавлен `tools/android-restore335-dd-zero-count-parser-readonly.ps1`: строго SHA-пин modern ADB и исходника, NE2213/API36 + оба test-only APK, `files/` должен быть пуст; `stat` диагностирует отсутствие не полагаясь только на exit, а `toybox dd if=/dev/null count=0 status=none` и `toybox dd if=/dev/null count=0 conv=excl status=none` проверяют parsing **без аргумента `of=`, без stdin исходника, без записи данных**. Выводит `REJECTED_BY_PARSER` / `ACCEPTED_FOR_ZERO_COUNT` / `UNVERIFIED` и сверяет оригинал после. ACCEPTED_FOR_ZERO_COUNT не доказывает эксклюзивную семантику для реального файла.
- Отдельные pwsh/mock regressions: нулевой exit со stdout-ошибкой, stderr-ошибка, успешный нулевой count, неожиданный ответ, ошибочный baseline, не пустой каталог, испорченный/изменённый original. Новый CI; физический запуск только после success exact HEAD. **Не повторять старую one-shot запись; никакого install, restart, restore IndexedDB, MP4, delete или cleanup.**

---

## RESTORE335 — физический read-only аудит: files/ есть, private input UNKNOWN; v2 диагностика (2026-11-21)

- Пользователь выполнил pinned `tools/android-restore335-post-dd-failure-readonly.ps1` на физическом OnePlus NE2213/API36: новый ADB 1.0.41 и SHA исполняемого файла PASS, исходный PASEKA01 3158B SHA PASS; `PRIVATE_FILES_DIRECTORY: PRESENT`; `PRIVATE_INPUT_FILE_TYPE: UNKNOWN_OR_ABSENT`; `PRIVATE_INPUT_STATUS: UNVERIFIED_PRESERVE`; `DD_HELP_EXIT_CODE: 0`; `DD_HELP_CONV_EXCL_MENTIONED: True`, `DD_HELP_CONV_FSYNC_MENTIONED: True`, `DD_HELP_STATUS_NONE_MENTIONED: True`; после проверки исходный архив `ORIGINAL_SOURCE_POST_FAILURE: SHA256_PASS_3158_BYTES`; `PRIVATE_FILE_MODIFICATION: NOT_ATTEMPTED`; `RESTORE_COMMIT: NOT_TESTED`; `RECOGNITION_CLEANUP: NOT_AUTHORIZED`; `STATUS: RESTORE335_POST_FAILURE_READONLY_AUDIT_COMPLETE`. **Это не подтверждение отсутствия файла**, т.к. предыдущий скрипт объединил ненулевой exit, stderr и неожиданный тип в один UNKNOWN/ABSENT. Каталог существует; исходный архив не изменён. Старый one-shot писать снова запрещено; не удалять/очищать APK или данные.
- В Draft PR #341 добавлен независимый только-читающий `tools/android-restore335-post-dd-failure-readonly-v2.ps1`: тот же закреплённый host ADB SHA/path и identity NE2213/API36; stat типа каталога и файла с отдельными exit/stdout/stderr длинами и классом причины, безопасный listing `ls -A files` с подсчётом и классом без показа имён; `adb shell -T run-as ... toybox pwd` для сравнения CWD с `exec-out`; read-only `toybox test -w files` для оценки прав; `toybox dd --help` и внешний original SHA recheck. Если обнаружен обычный файл размером <=8192B — только тогда чтение в память и SHA; nonregular не читается. Никакого `dd` с `of=`, `mkdir`, `cat` от stdin, restart, IndexedDB, delete, cleanup. Не путать `test -w` с фактической успешной записью; `dd --help` не доказывает принятие всех флагов в конкретном запуске.
- Отдельный mock pwsh CI покрывает complete, partial, missing, missing dir, unexpected file names, stat failures, symlink, permission probes, divergence shell cwd, source corruption и опцию dd help. Физическая проверка v2 и причины предыдущего dd всё ещё **NOT TESTED / UNKNOWN**, до реального вывода никаких повторных write шагов и нового restore. Исходный archive, тестовый package и любые созданные файлы сохранять. CI на exact финальном SHA проверить перед предоставлением команды.

---

## RESTORE335 — физическая exclusive private staging BLOCKED; только read-only форензика (2026-11-21)

- Пользователь на реальном OnePlus NE2213/API36 выполнил pinned one-shot `tools/android-restore335-modern-adb-exclusive-stage.ps1` из SHA `3bd1958623ed2eaa30a71645119cd859bd461fc5`. Пройдено: `HOST_ADB_VERSION: Android Debug Bridge version 1.0.41`, `ADB_EXE_SHA256: PASS_PINNED`, `ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES`, `PINNED_RUN_AS_DIRECTORY_PRECHECK`. На этапе 5/6 `EXCLUSIVE_CREATE_IN_EXISTING_TEST_PACKAGE_ONLY` получено `STATUS: BLOCKED / DETAIL: EXCLUSIVE_TEST_PRIVATE_INPUT_STAGE_FAILED`, с `ONE_SHOT_NO_RETRY_NO_INSTALL_NO_OVERWRITE_NO_RESET_NO_DELETE`. Поскольку gate `mkdir -m 700 files` пройден, каталог `files/` мог быть создан; исход `toybox dd` не определён: file может отсутствовать, быть частичным или полностью правильным. Отчёт не раскрывает, что именно вызвало BLOCKED: remote nonzero exit, stdout или stderr. **Никаких повторных записей, установки/очистки APK, удаления файлов, запуска restore без дополнительного чтения.**
- В том же Draft PR #341 добавлен `tools/android-restore335-post-dd-failure-readonly.ps1`: SHA-пин ADB и внешнего оригинала, проверка устройства/обоих test-only packages и run-as cwd; `toybox stat -c %F` для directory/file без следования symlink, `stat -c %s` размера, только для regular <=8192B `cat` в память с SHA256 (не выводит содержимое); при неполном/чужом файле оставляет нетронутым. `toybox dd --help` только read-only показывает поддержку excl/fsync/status=none; повторный SHA внешнего оригинала. Нет dd-записи, mkdir, touch, delete, shell или reset.
- Тесты `tests/mock_android_restore335_post_dd_failure_readonly.py` проверяют complete/partial/altered/missing/symlink/unverified stat/help failure/source changed/invalid original; отдельный workflow `.github/workflows/test-android-restore335-post-dd-failure-readonly.yml`. **Exact code SHA `455dd4ec52fa544fce7b912e432c48534e6b2063`: профильный CI `#44948412022` success**, финальный docs HEAD и физическая forensic проверка ещё ожидают отдельной верификации. Другие feature/Android build не являются доказательством физического восстановления.
- Restore IndexedDB + двух MP4, декодирование/распознавание, cleanup — NOT TESTED / NOT AUTHORIZED. Переход к ним допустим только после доказательства целостного private test archive и отдельных guard-ов тестовой базы. Не трогать main, production и пользовательские файлы.

---

## RESTORE335 — реальный binary stdin PASS, подготовлен безопасный one-shot private stage (2026-11-21)

- Пользователь выполнил pinned `tools/android-restore335-modern-adb-pinned-stdin-readonly.ps1` из SHA `efd79ea2ea1aa351c28f5c53b55edf1dfe149b06` на физическом OnePlus NE2213/API36: новый ADB 1.0.41 и SHA256 исполняемого файла PASS, исходный PASEKA01 3158B SHA PASS, `REMOTE_EXIT_CODE: 0`, `REMOTE_STDOUT_BYTES: 69`, `REMOTE_STDOUT_SHA256: 572ea8f6596a7f6481bdb699fa4a4f7d717977a748c03434cfbac510d8aaad7d`, `STDIN_TRANSPORT: SHA256_PASS_3158_BYTES`, `STATUS: RESTORE335_MODERN_ADB_READONLY_STDIN_PASS`. **Аппаратно доказана побайтовая целостность передачи stdin; Android private file write, IndexedDB restore, MP4 decode/playback, recognition и cleanup НЕ выполнялись**. Исходный внешний архив сохранился.
- В существующем Draft PR #341 добавлен новый, отделённый от чтения, одноразовый `tools/android-restore335-modern-adb-exclusive-stage.ps1` для **только** отдельного установленного тестового пакета `ru.paseka.journal.archive.restoreproof335`. Сначала проверяет ADB path/SHA, телефон/оба тестовых пакета, SHA исходного архива и точный cwd через run-as; создаёт каталог `files` простым `mkdir -m 700` (не `-p`, поэтому существующий каталог => BLOCKED), передаёт 3158B через `toybox dd ... conv=excl,fsync status=none` (эксклюзивная запись, перезапись запрещена), читает private файл назад и сравнивает SHA, ещё раз проверяет исходный внешний файл. На любой ошибке — BLOCKED, НЕ повторять автоматически и НЕ удалять/очищать. Никакого запуска приложения, изменения IndexedDB, других приложений, MP4 распознавания или очистки.
- Добавлены regressive actual pwsh+mock ADB tests: PASS, неверная модель, исходник неверной SHA, существующий каталог с защищённым sentinel, ошибки mkdir/dd с misleading exit=0, повреждённый stdin, изменение внешнего источника после операции, отказ при второй попытке. Отдельный CI workflow. CI на exact HEAD и физическая запись пока должны подтверждаться отдельно; итог предыдущего code/workflow SHA #44947992104 был success, однако документальные коммиты создают новый HEAD.
- Следующий безопасный gate: подтвердить workflow на последнем SHA, затем **одна** физическая команда exclusive stage. Только после фактического private SHA PASS разрешать отдельную one-shot проверку пустой тестовой IndexedDB и двух синтетических MP4 в пакете restoreproof335. Запрет на merge, production, uninstall, overwrite, автоматическое удаление видео сохраняется.

---

## RESTORE335 — modern ADB 1.0.41 staged on real Windows (2026-11-21)

- User ran SHA-pinned offline Windows stage at `1bb445b133aea1f59918482ba4774cd6f60a54e3`: `SOURCE_ZIP_SHA256: 89d108360a3bf2924d3bea837239edaccc22fd6ff5befd3787c4348a9fe4f09d`, `ADB_EXE_SHA256: bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee`, `VERIFIED_ADB_VERSION: Android Debug Bridge version 1.0.41`, `ISOLATED_ADB_PATH: C:\Users\n12D8\AppData\Local\Temp\paseka-offline-platformtools-43f92107c17d47d7a2853a42348efe9b\platform-tools\adb.exe`, `OLD_ADB_AND_SYSTEM_PATH: UNCHANGED`, `ANDROID_CONNECTION: NOT_ATTEMPTED`, `STATUS: RESTORE335_OFFLINE_PLATFORMTOOLS_READY`. ZIP provenance requires user's official-source claim; structural checks and local hashes alone cannot cryptographically prove Google source. No actual device connection in stage.
- Same Draft PR #341 adds a **distinct** `tools/android-restore335-modern-adb-pinned-stdin-readonly.ps1` that takes exactly staged ADB absolute path and SHA as defaults, validates exe SHA/version before any device access, checks existing NE2213/API36 two test packages and original 3158B pinned PASEKA01 archive, then streams only from memory through `adb shell -T run-as ... /system/bin/toybox sha256sum -` and demands matching remote SHA. No write, install, application launch, restore, recognition or deletion.
- New real-pwsh/mock ADB negative and success scenarios + workflow. Physical new-ADB stdin proof **NOT TESTED** until exact latest SHA CI success; no more testing with old ADB 1.0.32. No merging, deployment or production changes.

---

## Restore335 — ZIP_UNSAFE_ENTRY on physical Windows / root directory fix (2026-11-21)

- User executed pinned offline Windows ZIP stage from HEAD `f7ff409e9553e371bc811f73e67c9d65bb6c37d1`: `STAGE: 1/3 ...`, `STATUS: BLOCKED`, `DETAIL: ZIP_UNSAFE_ENTRY`, `ANDROID_CONNECTION_NOT_ATTEMPTED_NO_SYSTEM_CHANGES_NO_DELETE`. This proves original validator rejected some ZIP entry, NOT that Google's ZIP was malicious; exact offending entry not printed and cause is not independently confirmed.
- Found probable legitimate root directory `platform-tools/` rejected by strict regex that expected at least one character after slash. In same Draft PR #341 allow exactly empty root directory marker (and require zero content), retain traversal, duplicate path, DLL and size checks. Added CI regressions that accept official-style root marker up to stage 3 and still reject malicious nonempty root marker; Linux mock sets TEMP explicitly. Real ZIP verification on physical Windows remains NOT TESTED after fix.
- No Android, system PATH or original source modified. Next: CI exact SHA, then reuse existing Google ZIP for one offline no-device stage; do not redownload unless provenance cannot be verified.

---

## RESTORE335 — автономная локальная подготовка официального Windows ADB (2026-11-21)

- Реальный OnePlus подтвердил `run-as + toybox sha256sum /dev/null` PASS, pinned source PASEKA01 3158 байт SHA PASS. На ПК обнаружен ADB 1.0.32. Передача binary stdin, восстановление двух MP4, распознавание и cleanup — NOT TESTED. Никогда не повторять старый one-shot installer / stdin с ADB 1.0.32.
- В существующем Draft PR #341 добавлен `tools/android-restore335-offline-platformtools-stage.ps1` для **уже скачанного пользователем с официального сайта Google** `platform-tools-latest-windows.zip`. Офлайн проверяет структуру ZIP (уникальность путей, traversal, размер, DLL), распаковывает только в свежую отдельную папку Windows TEMP, показывает локальный SHA файла и ADB, вызывает только `adb.exe version`. Не изменяет PATH, не удаляет старый adb, не подключается к телефону и не выполняет restore/cleanup. Нельзя считать структурную проверку доказательством происхождения ZIP: пользователь должен скачать после принятия лицензии на официальной странице Google.
- Добавлены негативные PowerShell/mock tests для отсутствующего, небезопасного, дублированного или неполного ZIP, отдельный CI workflow. Positive сценарий с реальным Google ZIP **NOT TESTED** до предоставления файла на Windows. Далее — только после подтверждения нового ADB отдельный readonly stdin SHA тест и контроль внешнего оригинала.
- Последние CI на точном HEAD и аппаратная проверка нового ADB ожидают подтверждения. Никаких изменений в main, production или Android.

---

## RESTORE335 — physical run-as/Toybox PASS; legacy ADB 1.0.32 discovered (2026-11-21)

- User ran SHA-pinned no-stdin physical proof on OnePlus NE2213/API36 from `2ffb17d2a4ca7399472cddbf1827ada86daaa916`: `ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES`, `HOST_ADB_VERSION: Android Debug Bridge version 1.0.32`, `REMOTE_EXIT_CODE: 0`, `REMOTE_STDOUT_BYTES: 77`, `RUN_AS_TOYBOX_DEV_NULL_SHA: PASS`, `STDIN_TRANSPORT: NOT_TESTED`, `PRIVATE_PATH_WRITE: NOT_ATTEMPTED`, `RESTORE_COMMIT: NOT_TESTED`, `RECOGNITION_CLEANUP: NOT_AUTHORIZED`, `STATUS: RESTORE335_NO_STDIN_TOYBOX_PROBE_PASS`. Confirmed actual on-device run-as and toybox hash engine; no binary stdin proof. No writes/restore/cleanup.
- Host's **ADB 1.0.32 is legacy**. This plausibly explains `shell -T` being forwarded to device (mksh `chvt`) and non-PTY stdin shell hang; these are compatibility hypotheses, not proven root cause of every preceding failure. Stop further stdin commands with this ADB binary. Google official current Android SDK Platform-Tools are free; use a modern adb on host before further transport testing.
- Same Draft PR #341 adds fail-closed host ADB preflight (`>=1.0.41`) in existing stdin script before reading or transmitting archive bytes. Mock regression tests old 1.0.32 rejection and 1.0.41 pass; CI pending on code+docs SHA. No changes to production, test packages or user data. Next gate: verify CI, then obtain/use official modern ADB on PC and verify path/version, followed by a separate single read-only transport proof.

---

## RESTORE335 — physical no-flag stdin SHA timed out (2026-11-21)

- User ran pinned script at SHA `0322168064b94afc5e54d199d867bff719bea459` on real OnePlus NE2213/API36. Device and both installed test packages checked; source PASEKA01 3158B SHA256 PASS. Stage 3 `adb shell run-as ... toybox sha256sum -` produced `STATUS: BLOCKED / ADB_TIMEOUT_12S`. No remote digest, device write, installation, restore or cleanup. **Do not claim stdin corruption or successful delivery.**
- Earlier `shell -T` was treated by Android mksh as chvt, but omitting `-T` did not resolve the transport. The hang might relate to stdin EOF/PTY protocol; not proven. **Do not repeat this same test.**
- In existing Draft PR #341 added `tools/android-restore335-toybox-no-stdin-readonly.ps1`: verifies device/packages and pinned original, shows host ADB version, then executes **only** `adb -d exec-out run-as <test pkg> /system/bin/toybox sha256sum /dev/null` and requires exact empty-string SHA. No stdin, no shell `-T`, no Android files created/modified. New mock-ADB pwsh tests (pass, diagnostic, wrong digest, empty output, corrupted source), separate workflow.
- Next: exact HEAD CI check, then **one** physical non-writing no-stdin capability probe; only then design transfer. No old one-shot installer, private path writes, restore, video deletion or production change.

---

## RESTORE335 — physical mksh chvt failure identified (2026-11-21)

- On physical OnePlus NE2213/API36 the pinned readonly probe with `adb shell -T ...` returned original SHA PASS (3158B), remote stdout 120B SHA `6b670de5719e5c29131dde7d253b4024d7693876dc60f43483c57504c40ab73e`, `REMOTE_DIAGNOSTIC: /system/bin/sh: chvt: can't find tty:  run-as ru.paseka.journal.archive.restoreproof335 /system/bin/toybox sha256sum -`. This identifies Android mksh processing `-T` as a terminal-switch argument, instead of successful remote hashing; no stdin integrity proof, no writes/restore.
- In Draft PR #341 removed `-T` from bidirectional `adb shell run-as ... /system/bin/toybox sha256sum -`. Host standard input is redirected (not tty), allowing ADB to select raw shell without the unsupported switch. Updated mock and static CI to reject `shell -T`. This is a hypothesis to test on the physical ADB binary, not yet physical PASS.
- Next gate: verify exact HEAD CI and run one pinned no-write physical probe; never re-run old one-shot installation or delete original/video.

---

## RESTORE335 — physical 120-byte remote diagnostic (2026-11-21)

- User ran pinned no-write toybox stdin probe on OnePlus NE2213/API36, script commit `a68a091b1ebd720d6be35e88eeab70a256b2e2da`: external PASEKA01 original 3158B SHA PASS, remote `EXIT_CODE: 0`, `STDOUT_BYTES: 120`, `STDOUT_SHA256: 6b670de5719e5c29131dde7d253b4024d7693876dc60f43483c57504c40ab73e`, `OUTPUT_CLASS: COMMAND_DIAGNOSTIC`, `STATUS: BLOCKED`. No received digest; actual diagnostic string was intentionally hidden. Do not infer successful transfer or byte corruption. No file writes, install, restore, cleanup.
- Same Draft PR #341 now permits **only strict short printable recognized** `run-as`/`sha256sum` command diagnostics in stdout; unrecognized/binary content is redacted. Additional mock-ADB tests include safe diagnostic and redaction. No new Android operation; physical cause still unverified. Next: confirm exact HEAD CI then run the same pinned read-only diagnostic once. Never repeat original installer.

---

## RESTORE335 — physical shell -T returned command diagnostic (2026-11-21)

- User ran pinned `adb shell -T run-as <restoreproof335> sha256sum` on OnePlus NE2213/API36 from `fdfbeb221d4b1608748174c154edc5de90505bb7`: original PASEKA01 3158B SHA PASS, `REMOTE_EXIT_CODE: 0`, `REMOTE_STDOUT_BYTES: 99`, `REMOTE_STDOUT_SHA256: 4c6c469b11269c215ee1af4fb6ab8e580441d06cbf6623c1e7afc34af448ca09`, `REMOTE_OUTPUT_CLASS: COMMAND_DIAGNOSTIC`, `STATUS: BLOCKED`. This is not a digest and does not prove incorrect stdin transmission; diagnostic contents not disclosed. No Android writes/restore/deletion.
- For test-only next gate in same Draft PR #341, command pinned to absolute `/system/bin/toybox sha256sum -` under `run-as`; toybox treats `-` as stdin and avoids reliance on lookup of unqualified sha256sum. Static + mock negative tests updated. Physical outcome and exact latest SHA CI pending.
- Next: verify exact SHA CI and perform at most one read-only physical attempt; do not restage archive or repeat old installer.

---

## RESTORE335 — empty exec-in stdout root cause (2026-11-21)

- Physical OnePlus pinned read-only run (`b6b2175a7c077616e9884ef4a2cccef7a241ae61`): original archive 3158 bytes SHA PASS; `REMOTE_EXIT_CODE: 0`, `REMOTE_STDOUT_BYTES: 0`, `REMOTE_STDOUT_SHA256: e3b0c442...`, `REMOTE_OUTPUT_CLASS: EMPTY`, `STATUS: BLOCKED/STDIN_SHA256_OUTPUT_INVALID`. No writes, restore, recognition, cleanup.
- ADB source confirms `exec-in` copies host stdin only, unlike `exec-out` which copies device stdout. The empty stdout is explained by command semantics, NOT proof of input corruption. Read-only probe switched to bidirectional `adb shell -T run-as ... sha256sum`, with PTY disabled and explicit SHA check. Same Draft PR #341; mock and workflow updated.
- New shell -T code/test CI and real-device probe NOT YET VERIFIED. Do not repeat installer or write private files; next step CI exact SHA then single physical read-only proof.

---

## RESTORE335 — physical stdin probe BLOCKED (2026-11-21)

- User executed pinned read-only probe at `090fb2f9604ddbd26dad4ee0e2492d67a40abd9f` on physical NE2213/API36: source `ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES`; stage 3 `STATUS: BLOCKED / STDIN_SHA256_OUTPUT_INVALID`. Remote stdout did not match the expected digest syntax; not evidence of changed stdin bytes. No Android writes/install/restore/cleanup.
- Same Draft PR #341 updated with bounded non-content diagnostics: remote exit code, stdout byte count and SHA256, classification of output as error diagnostic/empty/unknown. Mock regressions extended. New CI exact HEAD and physical diagnostic pending.
- Next: confirm CI on exact latest SHA, then one read-only pinned rerun; never repeat installer or write to private test directory before root cause is established.

---

## RESTORE335 — read-only binary stdin transport probe (2026-11-21)

- Physical OnePlus NE2213/API36 path-audit: pinned external PASEKA01 3158 bytes SHA256 PASS; `run-as pwd` = `/data/user/0/ru.paseka.journal.archive.restoreproof335`; `files/`, private input and report all NOT_FOUND. Earlier 65/62 byte diagnostics are missing-file stdout, not stored files.
- Draft PR #341 stacked over #340; test script `tools/android-restore335-stdin-sha-readonly.ps1` reads source into PC memory, verifies pinned SHA, streams bytes via direct `adb exec-in run-as <existing test package> sha256sum` without shell/redirection/file writes, verifies remote digest and rejects non-digest stdout.
- Mock CI cases: success, corrupt stdin, diagnostic stdout with exit 0, corrupt original blocked before stdin. Workflow exists; exact HEAD CI and physical USB execution **NOT VERIFIED**. No restore/MP4 decoding/recognition/deletion; no installs or production edits.
- Next single gate: confirm workflow CI on exact HEAD, then one non-writing physical stdin diagnostic. If SHA passes, separately design a safe file-staging operation in existing test-only package; no retry of previous one-shot installer.

---

## RESTORE335 — confirmed CI for read-only missing-path audit (2026-11-21)

- Code/test/workflow SHA `cdf937797078234aeb9817d686d551795203c4e6` проверен: [GitHub Actions #44944519356](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44944519356) **completed/success**: PowerShell parse, static no-write tests, real `pwsh` mock-ADB with missing-file diagnostic text on stdout and exit=0. Последующие изменения — документация.
- Физический run-as cwd и путь `files` пока NOT TESTED новым audit script; **вместо повторной записи** требуется один read-only осмотр cwd + ls -ld. Не считать mock доказательством on-device путей. Исходный архив 3158B original SHA PASS по последней аппаратной проверке.

---

## RESTORE335 — физический forensic PASS: оба private файла НЕ СУЩЕСТВУЮТ (2026-11-21)

- На реальном OnePlus NE2213/API36 пользователь выполнил pinned read-only forensic script SHA `341b99d6bf47875740024c929fe76e8b564d559e`. Из консоли: `ORIGINAL_BYTES: 3158`, `ORIGINAL_SHA256: PASS`; `PRIVATE_BYTES: 65` с печатным содержимым **`cat: files/fileproof335-input.paseka: No such file or directory\r\n`**, `REPORT_BYTES: 62` с текстом **`cat: files/restore335-report.json: No such file or directory\r\n`**. Эти 65/62 байта — **ADB/Android diagnostic stdout**, а не private файлы; прежние отчёты о существующей 65B копии и 62B репорте **опровергнуты**. Оригинал физически сохранён/цел, ничего не удалено. Стадия 6 app launch и restore commit не выполнялись.
- Корневая причина ошибки 65B SHA: предыдущий `adb exec-out run-as ... cat` предоставил сообщение о missing file в stdout, в раннем коде ошибочно рассчитан SHA diagnostic bytes. Почему исходный `exec-in run-as ... sh -c ...` не создал private input — ещё не установлено (проверить run-as cwd и наличие files dir). Не повторять старый installer; новый пакет уже установлен.
- В новой ветке `test/android-restore335-missing-private-path-audit-2026-11-21` создан `tools/android-restore335-private-path-readonly.ps1`: exact device+packages, pinned original SHA и direct `run-as ... pwd`/`run-as ... ls -ld files|input|report` без `sh -c` и без записей; отдельно классифицирует строки missing file, даже при exit=0. Node static tests и real pwsh/mock ADB (missing path in stdout with exit=0) добавлены. CI на exact code SHA ещё не подтверждён.
- НЕ перезаписывать, переустанавливать, сбрасывать новый пакет, не затрагивать production/FILEPROOF329 и внешний оригинальный PASEKA01. Android restore, decoder, распознавание и cleanup — NOT TESTED/NOT AUTHORIZED.

---

## RESTORE335 — 65B read-only forensic preview CI PASS (2026-11-21)

- На code/test/workflow SHA `341b99d6bf47875740024c929fe76e8b564d559e` [GitHub Actions #44944133054](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44944133054) **completed/success**: PowerShell syntax, static no-write/no-install/128-byte bound tests и actual `pwsh` c mock-ADB 65-byte private diagnostic text. Код не проверен на физическом Android новым инструментом.
- Следующий физический read-only сценарий `tools/android-restoreproof335-private65-forensics.ps1`: показывает ASCII/hex **только малого private input 65B и private report 62B**, не выводит исходный архив и не трогает другие директории. Перед этим проверяет pinned original SHA и test packages. Любая неопределённость — BLOCKED, никакого удаления/reset/reinstall/retry old staging.
- По реальным измерениям исходный файл 3158B/SHA PASS; private file 65B first mismatch byte 0; report exists 62B. **Причина ошибки до содержимого этих bytes не установлена.**

---

## RESTORE335 — физический post-failure read-only 65-byte private file (2026-11-21)

- Пользователь запустил закреплённый read-only `tools/android-restoreproof335-readonly-diagnostic.ps1` (code SHA `8ace0319bf54810c4c1016213e5df718ee3cea3c`) на OnePlus NE2213/API36. Точный результат: `ORIGINAL_BYTES: 3158`, `ORIGINAL_SHA256: PASS`; `PRIVATE_BYTES: 65`, `PRIVATE_SHA256: d626473be6b6766170d63ca7bdf77b854cf94fb769825b2f1db3854cd9c52a60`; `PRIVATE_MATCHES_ORIGINAL: NO`; `FIRST_DIFFERENT_BYTE_OFFSET: 0`; `LENGTH_DELTA: -3093`; `PRIVATE_REPORT_PRESENT: YES_BYTES_62`; `RESTORE_COMMIT: NOT_CONFIRMED`. Это реальные аппаратные данные из консоли пользователя, а не CI mock. Исходный архив после инцидента **сохранён с подтверждённым SHA**.
- В новом test-only пакете `ru.paseka.journal.archive.restoreproof335` осталась private копия 65 байт и отчёт 62 байта. Причина неизвестна, возможна ошибка передачи binary stdin/интерпретации shell. 65 байт не позволяют предполагать восстановление видео. Старый one-shot `tools/android-restoreproof335-one-shot.ps1` **НЕ повторять**, уже установленный пакет не удалять, не перезаписывать private test file, не сбрасывать базу и не удалять оригинальный файл.
- Для определения природы 65 байт создана отдельная ветка `test/android-restore335-private65-forensics-2026-11-21`. `tools/android-restoreproof335-private65-forensics.ps1` расширяет ранее проверенный read-only script, **печатает hex и печатный ASCII не более 128 байт только из private input и небольшого private report**, не выводит исходный архив, не выполняет запись/launch/stop/install/delete. Повторно требует exact old/new packages, исходный SHA, device NE2213/API36. Тесты PowerShell parser/CI mock + safety.
- Следующий шаг: подтвердить CI на exact SHA, затем один bounded read-only physical запуск для выявления содержимого 65 и 62 байт; только после этого формировать корневое исправление. Нет физического restore commit, decoder/recognition/cleanup NOT TESTED/NOT AUTHORIZED.

---

## RESTORE335 read-only diagnostic CI PASS (2026-11-21)

- Exact code/test/workflow SHA `8ace0319bf54810c4c1016213e5df718ee3cea3c`, GitHub Actions [#44943612626](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44943612626) **completed/success** on PR #338 head (later changes docs only). PowerShell syntax, JS source safety and actual `pwsh` with mock ADB scenarios succeeded: (a) private mismatch reports first offset and no-write, (b) exact private match, (c) original SHA mismatch blocks before private read. Mock is not physical hardware evidence.
- Next: one **read-only** run of pinned `tools/android-restoreproof335-readonly-diagnostic.ps1` on already connected OnePlus. Must not reinstall/retry staging, `pm clear`, remove original, or launch new app. Compare original/private sizes and hashes; only after actual diagnostic decide next safe action.

---

## RESTOREPROOF335 — физический BLOCKED на private readback (2026-11-21)

- Пользователь запустил единственный pinned PowerShell one-shot script SHA `0b6d76b0fc415233656018a23e28e3165cbc0779` на OnePlus NE2213/API36. Наблюдаемая последовательность: стадия 1 device/package gate, стадия 2 original archive SHA gate, стадия 3 ZIP/APK SHA gate, стадия 4 install нового отдельного package, стадия 5 transfer private input — `STATUS: BLOCKED`, `DETAIL: PRIVATE_INPUT_READBACK_SHA_MISMATCH`. Статус `RESTORE_PROOF335: ANDROID_SYNTHETIC_PASS` **НЕ получен**. Стадии 6 launch/IndexedDB restore и 7 post-restore original SHA **НЕ выполнены**.
- Сценарий подтвердил исходную контрольную сумму *перед* transfer и успешно установил новый TEST-ONLY package `ru.paseka.journal.archive.restoreproof335`. О точных length/SHA уже созданного `files/fileproof335-input.paseka` на устройстве данных пока нет. Старый archive после ошибки пока не перепроверен. Не утверждать, что ошибка вызвана CRLF, ADB или сохранением Blob без диагностики. Прежний тестовый `fileproof329`, production пользовательская база не изменялись командами сценария; новый private test file мог быть создан/повреждён.
- **НЕ ПОВТОРЯТЬ старый one-shot script**: он проверяет отсутствие нового package и не должен перезаписывать private file. Никакого `pm clear`, `uninstall`, повторной установки, удаления тестового архива или пользовательских данных.
- Создан stacked read-only diagnostic branch `test/android-restore335-private-readback-diagnostic-2026-11-21`. Новый `tools/android-restoreproof335-readonly-diagnostic.ps1` только проверяет OnePlus, exact old+new package, original SHA, существующий private readback bytes/length/SHA и первый offset расхождения, плюс факт private report — **ничего не пишет/не запускает/не удаляет**. `tests/android-restoreproof335-readonly-diagnostic.test.mjs` и `tests/mock_android_restoreproof335_readonly_diagnostic.py` моделируют reading changed private vs original. Специализированный CI на новом SHA ещё требует подтверждения.
- Следующий приоритет: дождаться green CI диагностики, затем **один** запуск pinned read-only tool на пользовательском ПК и получить реальный вывод; после этого исправлять первопричину transfer (если она подтверждена), сохраняя существующее test-only состояние.

---

## RESTOREPROOF335 — одноразовый ADB сценарий: MOCK CI PASS (2026-11-21)

- Код/test SHA `0b6d76b0fc415233656018a23e28e3165cbc0779`, [GitHub Actions #44943098055](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44943098055): **completed/success**. PowerShell parser, Python parser, 3/3 static safety tests и реальный `pwsh` против mock-ADB проходят. Позитивный mock проверил 7/7 последовательных стадий: source preflight, ZIP/APK SHA, отсутствие нового package, install только в mock, private byte staging/readback, отчет, повторный source digest. Негативный mock изменённого source SHA остановился на 2/7 **до** установки; ни одной mock-записи private.
- MOCK prints `RESTORE_PROOF335: ANDROID_SYNTHETIC_PASS` только как имитацию; это **не** реальный OnePlus и не доказательство Android IndexedDB! На физическом телефоне APK #336 ещё не установлен, bytes original не переданы и restore NOT_TESTED.
- Pinned user artifact [ID 14721928022](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44942628866/artifacts/14721928022), SHA256 ZIP `28e62f19d80a4ede343041a658da7093b2c106c82a02e0db23f2ccedd5bde176`; APK `5ba91f66576e8f859a398655be001d0116819478501981650505ea66a92f496e`. Script `tools/android-restoreproof335-one-shot.ps1` pinned to code SHA before doc update, no overwrite/cleanup/production.
- Следующее физическое действие возможно только на компьютере пользователя и по локальному запуску: скачать ровно pinned GitHub artifact ZIP в Downloads, запустить pinned PowerShell one-shot скрипт, прислать полный отчет. Не повторять при BLOCKED и не очищать ни один пакет. Результат не считать успешным до реального report.

---

## RESTOREPROOF335 — одноразовый ADB аппаратный сценарий, CI mock gate (2026-11-21)

- На основе подтверждённой сборки Draft #336 (GitHub Actions #44942628866, exact artifact SHA ZIP `28e62f19d80a4ede343041a658da7093b2c106c82a02e0db23f2ccedd5bde176`, APK `5ba91f66576e8f859a398655be001d0116819478501981650505ea66a92f496e`) создана ветка `test/android-restore335-safe-device-transfer-2026-11-21`.
- `tools/android-restoreproof335-one-shot.ps1` (PowerShell): **только конкретный OnePlus NE2213/API36**, existing original synthetic `fileproof329`, exact 3158 B source SHA `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`, исходно отсутствующий package `ru.paseka.journal.archive.restoreproof335`. Проверяет ZIP SHA, APK SHA и ZIP entries **до** установки нового тестового пакета. Нет `install -r`, PM clear, uninstall, force-stop, удаления. В памяти ПК читает старый архив, передаёт bytes только в private `files/fileproof335-input.paseka` вновь установленного test-only пакета через ADB exec-in/run-as, независимо сверяет private SHA, запускает test-only Activity один раз, читает private test report и повторно сверяет original SHA.
- `tests/android-restoreproof335-device-safety.test.mjs` закрепляет имена, SHA и запреты; `tests/mock_android_restoreproof335_device.py` запускает **настоящий pwsh** против фальшивого ADB, проверяя 7 этапов и сценарий неправильного source SHA без установки. Workflow `.github/workflows/test-android-restoreproof335-device-mock.yml` добавлен, фактический CI статус нового SHA **не подтверждён**.
- Внимание: mock использует другой synthetic file и программно заменяет закреплённые SHA **только во временной копии тестируемого скрипта**; это не проверка физических bytes OnePlus. До green exact CI **не передавать пользователю рабочую физическую команду**.
- Даже при mock CI PASS физическая установка/передача/restore остаются NOT_TESTED; user запускать только по отдельной проверенной инструкции после запроса. Оригинальный архив, production и real video не трогать; `cleanupAuthorized=false`.

---

## FILEPROOF335 — Android APK compiled and artifact SHA-pinned (2026-11-21)

- В Draft PR #336 на exact HEAD `595e8075f084d79f1adf6f20d1bcce7038f1421e` специализированный [GitHub Actions #44942628866](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44942628866) **completed/success**. Прошли Node/VM safety tests, web config isolation, Android Java bridge compilation, Gradle assembleDebug и проверка aapt, что APK appId только `ru.paseka.journal.archive.restoreproof335`. Это CI, не физический Android запуск.
- Готов единственный CI artifact `paseka-restoreproof335-isolated-apk`, ID `14721928022`, [download page](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44942628866/artifacts/14721928022), expires 2026-12-05. Artifact ZIP SHA256 `28e62f19d80a4ede343041a658da7093b2c106c82a02e0db23f2ccedd5bde176`, APK SHA256 из workflow `5ba91f66576e8f859a398655be001d0116819478501981650505ea66a92f496e`. Не заменять pinned значения позднейшими сборками без новой проверки.
- Приложение **не установлено** на телефон, source staging ещё не проверен. В пакете есть native read-only bridge для private `fileproof335-input.paseka` и browser one-shot restore тест в базе `paseka-fileproof335-destination-only-v1`, без удаления данных.
- Следующий этап — безопасная автоматизация загрузки артефакта, exact SHA preflight, отсутствия нового test pkg, чтения внешнего pinned archive и единственной test-only ADB передачи **без перезаписи** внутрь private files нового пакета; отдельный mock CI до выдачи аппаратной команды.

---

## FILEPROOF335 — отдельный Android test-only APK, подготовка сборки (2026-11-21)

- На базе Draft #335 создана новая ветка `test/android-fileproof335-separate-apk-2026-11-21`. Цель: **только новый отдельный** Android package `ru.paseka.journal.archive.restoreproof335`; существующий `ru.paseka.journal.archive.fileproof329` и рабочий `ru.paseka.journal` не меняются.
- `scripts/prepare-android-fileproof335-isolated-apk.mjs`: stage `web` в чистом GitHub Actions checkout подменяет appId на отдельный тестовый, включает лишь `PasekaArchive`, ограниченный restore335 browser fixture и тестовый bootstrap. Stage `native` в **генерируемом Android проекте** создаёт Java `Restore335InputBridge`, читающий строго `getFilesDir()/fileproof335-input.paseka` (3158 байт, pinned SHA `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`) только один раз; записи в оригинальный архив, MediaStore и Downloads нет. Одноразовый reporter сохраняет результат только в новом private package без перезаписи.
- `tests/fixtures/android-fileproof335-start.js` извлекает только проверенные test-only private input bytes, передаёт `Uint8Array` в `PasekaIsolatedRestore335.run()` и сообщает `cleanupAuthorized=false`, `recognitionSucceeded=false`.
- `.github/workflows/build-android-fileproof335-isolated-apk.yml`: сборка в CI с проверкой distinct packageId через aapt и загрузкой debug APK только как artifact. `tests/android-fileproof335-apk-isolation.test.mjs`: negative safety checks. APK **не устанавливался** и физического Android restore не было.
- **Критический незавершённый блок:** безопасная доставка bytes из исходного PASEKA01 внешнего файла на телефоне в *приватное пространство нового тестового пакета*; исходный файл нельзя перезаписывать или удалять. Никакие команды физической передачи/установки не выдавать до подтверждения CI и отдельного fail-closed device protocol. Новый input файл пока не создан на устройстве.
- CI на точном SHA нового build/test workflow — PENDING/NOT CHECKED; не объявлять сборку successful до фактического success. Не merge/deploy, не менять пользовательскую базу или оригинал видео.

---

## FILEPROOF335 — test-only WebView restore gate CI 7/7 PASS (2026-11-21)

- В stacked [Draft PR #335](https://github.com/250oisr-eng/Pasekaapp/pull/335) код/тесты SHA `023cfea81f92f62c9de03c0f41f6edf47a565de9` проверены: [CI #44942008049](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44942008049), isolated browser/IndexedDB gate **7/7 tests PASS, 0 failures** (job success).
- Test-only модуль `tests/fixtures/android-fileproof335-isolated-restore.js` использует строго отдельную БД `paseka-fileproof335-destination-only-v1`; проверяет исходный 3158 B archive SHA и две MP4 SHA через `PasekaArchive.validateArchiveForRestore`, затем атомарно пишет 1 state+2 MP4 в новую пустую базу; закрывает/открывает и сверяет содержимое.
- Дополнительно закрыт риск повторной попытки после аварийного abort: модуль теперь требует успешную `indexedDB.databases()` и **блокирует любое ранее созданное имя test-only DB, даже если база пуста**. Новый тест моделирует перезапуск WebView после abort и подтверждает no-retry/no-overwrite.
- Позитивный CI harness подменяет digest **только всего synthetic PASEKA01** на pinned FILEPROOF329 archive SHA; сам файл, хранящийся на телефоне, в CI **не загружался**. Внутренние SHA обоих MP4 при этом настоящие. Поэтому результат является проверкой test-only логики в VM/fake-indexeddb, а **не** реальным восстановлением физических байтов на Android.
- Следующий этап требует нового test-only Android package и строго ограниченного способа чтения pinned original archive; существующий `fileproof329`, production IndexedDB и пользовательские видео не изменять. Ни APK, ни физический restore на этом этапе не выполнялись.

---

## FILEPROOF335 — подготовлен browser gate восстановления в будущий изолированный Android package (2026-11-21)

- После физического FILEPROOF329 read-only PASS и CI-успеха атомарного fake IndexedDB restore в Draft #334 выделена ветка `test/android-isolated-restore335-browser-gate-2026-11-21`. Новый `tests/fixtures/android-fileproof335-isolated-restore.js` — **test-only WebView-ready fixture, НЕ интегрирован в APK**.
- Для данных назначения зафиксировано отдельное test-only имя `paseka-fileproof335-destination-only-v1`. Модуль принимает только 3158-byte SHA-pinned synthetic PASEKA01 (точный SHA `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`), проверяет manifest/state/video через `PasekaArchive.validateArchiveForRestore` и оба исходных SHA, затем выполняет транзакционную запись state+2 MP4 исключительно в пустую тестовую IndexedDB, close/reopen и SHA-проверку. Нет API удаления/очистки, доступа к рабочей БД, записи во внешний архив или включения в production.
- Добавлен CI-only VM/fake-indexeddb suite `tests/android-fileproof335-isolated-restore-browser.test.mjs`: атомарность, запрет повторного запуска, отказ в непустом destination, принудительный rollback и неправильный archive SHA. Позитивный тест **подменяет только SHA всего 3158-byte synthetic архива в VM harness**, потому что реальный файл физического телефона не копируется в CI; внутренние видео SHA проверяются реальными digest. Такой mock НЕ доказывает восстановление точных Android bytes.
- Добавлен workflow `.github/workflows/test-android-fileproof335-isolated-restore.yml`; его результат ещё требуется подтвердить на exact SHA. Следующий этап: CI regression и, только после отдельного аудита, новый test-only Android package с отдельной базой и подтверждённой read-only подачей исходного файла. Не запускать существующий fileproof329 на запись; физический restore/MP4 decoder/cleanup NOT TESTED.

---

## FILEPROOF329 — isolated restore commit CI PASS (2026-11-21)

- В отдельной ветке Draft PR #334 `test/fileproof329-isolated-restore-commit-2026-11-21` (base Draft #333) код/test/workflow SHA `82befb3a7d653378284246ea668252961ff69e05` проверен: GitHub Actions [run #44941671182](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44941671182) **completed/success**. Проверка выполнялась только в Node/CI с `fake-indexeddb`; APK и физический Android не использовались.
- Тест `tests/fileproof329-isolated-restore-commit.test.mjs`: real `PasekaArchive` export/restore preflight, атомарная readwrite транзакция state+2 synthetic MP4 в отдельную новую пустую test DB, close/reopen и проверка SHA; блокировка непустого destination; принудительный abort после первого видео со сверкой пустого назначения; повреждённый video hash блокирует до записи.
- Первый CI #44941627356 был **failure до тестов** из-за `npm ci` при отсутствии `package-lock.json`; это исправлено в workflow на `npm install --package-lock=false`. Успешный CI относится к новому точному SHA, не старому failed run.
- **Граница доказательств:** это test-only commit, а не production restore API и не физический restore. Реальный PASEKA01 на телефоне не читается этим тестом, настоящие видео не декодируются, cleanup запрещён. Следующий этап — отдельный безопасный native/Android isolated restore по самостоятельному плану с preflight, без чтения рабочих данных и перезаписи пакетов.

---

## FILEPROOF329 — подготовлен изолированный restore commit CI (2026-11-21)

- Физический OnePlus NE2213/API36: предшествующий read-only preflight `FILEPROOF329_ANDROID_READONLY_PREFLIGHT_PASS` подтверждает 3158-byte PASEKA01, manifest, state и два SHA-pinned MP4; **restore commit, Android MP4 decoder и cleanup остаются NOT_TESTED**.
- Следующий независимый этап в ветке `test/fileproof329-isolated-restore-commit-2026-11-21` поверх read-only Draft PR #333. Добавлен **только CI-тест** `tests/fileproof329-isolated-restore-commit.test.mjs` с `fake-indexeddb`, оригинальным `PasekaArchive.exportArchiveFromDatabase` и `validateArchiveForRestore`. Тест создаёт отдельную исходную тестовую БД, затем новую пустую test-only destination, атомарно записывает state+2 synthetic MP4 в одной транзакции, закрывает и вновь открывает БД для независимой SHA-проверки.
- Негативные сценарии: существующая запись блокирует импорт без перезаписи; abort после первого MP4 должен откатить и state, и MP4; повреждённый video payload блокирует до открытия readwrite транзакции. Исходный Buffer не меняется.
- Специализированный CI `.github/workflows/test-fileproof329-isolated-restore.yml`. На новом code/test SHA CI ещё требует подтверждения. Не меняет production restore API, Android APK/IndexedDB устройства, user media, внешний PASEKA01 и содержимое рабочей пасеки.
- Следующий шаг: получить green CI на точном SHA; затем решить, как безопасно проверить ту же операцию на устройстве в новом отдельном test-only package без контакта с существующей базой. Не запускать физический restore в существующем `fileproof329` пакете.

---

## FILEPROOF329 — физический read-only preflight PASS (2026-11-21)

- Пользователь на OnePlus NE2213 / API36 выполнил закреплённый скрипт `tools/android-fileproof329-readonly-preflight.ps1` с code SHA `d2933ddd5b7be2caa131bf64c8179c34e35e703e`. Получен полный вывод пяти стадий и финальный `STATUS: FILEPROOF329_ANDROID_READONLY_PREFLIGHT_PASS`.
- Подтверждены: `EXISTING_SYNTHETIC_PACKAGE: VERIFIED`, `PRIVATE_REPORT: SHA256_PASS`, `EXTERNAL_ARCHIVE: SHA256_PASS`, `PASEKA01_MANIFEST: PASS`, `STATE_SCHEMA_AND_HIVE: PASS`, `VIDEO_1_SHA256: PASS`, `VIDEO_2_SHA256: PASS`. Архив 3158 байт с pinned SHA `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186` ранее независимо проверен `adb sha256sum`; файл сохранён.
- CI для точного code SHA: [run #44941100823](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44941100823) — completed/success, включая реальный PowerShell с mock ADB precheck. Физический результат — отдельно из пользовательского консольного вывода, не из CI.
- **Не доказано:** restore commit, воспроизводимость MP4 аппаратным декодером, распознавание пчёл, корректная очистка после распознавания. `RESTORE_COMMIT: NOT_TESTED`, `MP4_DECODER: NOT_TESTED`, `RECOGNITION_CLEANUP: NOT_AUTHORIZED`. Синтетический тест не является подтверждением сохранности пользовательских данных или готовности production.
- Следующий приоритет: isolated restore commit с новой пустой тестовой IndexedDB и явным read-only source + no-overwrite/fail-closed preflight; только отдельный безопасный этап. Не удалять оригинальный синтетический архив, не менять production и реальные данные.

---

## FILEPROOF329 — подтверждён CI на исправлении VoidTaskResult (2026-11-21)

- Код/тесты SHA `d2933ddd5b7be2caa131bf64c8179c34e35e703e`: [CI #44941100823](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44941100823) completed/success. Проверены синтаксис Node+PowerShell, негативные сценарии, ADB fail mock, **ADB positive USB precheck -> stage2** с реальным `pwsh`; служебный `VoidTaskResult` не возникает. Последующие изменения — только документация.
- Физическая проверка исправленного скрипта всё ещё NOT_TESTED; не делать вывод об успешном восстановлении/декодировании MP4/очистке.

---

## FILEPROOF329 — PowerShell VoidTaskResult readout failure (2026-11-21)

- Физический OnePlus: после изменения ADB аргументов кодовый SHA `54cbfc24f931270eba7cacf7b045e4c684e61c22` дал `STAGE: 1/5 USB_DEVICE_PRECHECK`, затем `BLOCKED`: PowerShell попытался преобразовать `System.Threading.Tasks.VoidTaskResult` к `System.Byte`. Это сбой тестового парсера, **не** повреждение архива или пользовательских данных; аппаратная проверка архива новым скриптом не дошла до чтения.
- Исправлен `Adb`: `[void]$stdoutTask.GetAwaiter().GetResult()` подавляет служебный результат успешного async `CopyToAsync`, возвращаются только байты `$stream.ToArray()`. В CI добавлен позитивный mock `adb devices -l`/getprop/pm, подтверждающий прохождение стадии 1 до безопасно отклонённой стадии 2, и статический регрессионный тест утечки результата task.
- Не выполнять следующий физический запуск до successful CI на точном SHA. Archive SHA, известный ранее: `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`. Удаление, восстановление и видео-распознавание НЕ выполнялись.

---

## FILEPROOF329 — подтверждён CI исправления ADB (2026-11-21)

- На code/test/workflow SHA `54cbfc24f931270eba7cacf7b045e4c684e61c22` GitHub Actions [run #44940959276](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44940959276) завершил job `preflight` со статусом success: Node и PowerShell синтаксис, отрицательные тесты, а также отдельный mock `adb devices -l` с exit=1 через реальный `pwsh`. Это подтверждает корректную передачу аргументов и диагностический отказ на мок-устройстве, не фактический запуск исправленной версии на NE2213.
- Следующая контрольная точка — единственная read-only физическая попытка по закреплённому SHA; при отказе диагностическое сообщение. Restore commit, декодирование MP4 и удаление видео остаются NOT_TESTED/NOT_AUTHORIZED.

---

## FILEPROOF329 — первая стадия ADB_EXIT_1, исправление аргументов (2026-11-21)

- По фактическому выводу пользователя скрипт pinned SHA `2e08487bb9d056466711f5588d538133304ec66d` скачался успешно, затем на `STAGE: 1/5 USB_DEVICE_PRECHECK` выдал `STATUS: BLOCKED / DETAIL: ADB_EXIT_1`. Это не тест внутренней целостности архива. Ни восстановление, ни очистка, ни чтение архива этим новым запуском не подтверждены.
- Проверка кода выявила риск использования специальной PowerShell-переменной `$args` как формального параметра функций `Adb`/`AdbText`. В ветке PR #333 её заменили на `$argv`; ошибки ADB теперь помечаются безопасной категорией команды и ограниченным stderr. Реальную точную причину ADB_EXIT_1 ещё нужно подтвердить.
- Добавлен регрессионный тест аргументов и CI-сценарий с фальшивым исполняемым `adb`, вызываемый реальным `pwsh` и проверяющий fail-closed обработку `devices -l`. CI/аппаратный тест на последнем SHA ожидает проверки. Существующий синтетический архив с закреплённым SHA не изменялся.
- Следующий этап: проверить CI на точном code SHA, затем один повторный read-only запуск исправленного скрипта; при BLOCKED без установки/удаления/повторных ручных действий.

---

## FILEPROOF329 — ограничение ADB, подтверждённый CI (2026-11-21)

- Исправленный код+тесты SHA `2e08487bb9d056466711f5588d538133304ec66d`: специализированный [CI #44940781025](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44940781025) — completed/success: Node syntax, PowerShell syntax, negative/source-safety checks. CI не доказывает физическую диагностику ADB.
- Уточнение: причина предыдущего молчаливого ожидания не установлена (возможны этап скачивания скрипта и ожидание ADB). Для нового запуска команду скачивания ограничивать `-TimeoutSec 20` и выводить этап до скачивания; новая PS1 ограничивает ADB до 12 секунд на вызов.
- Физический запуск нового скрипта NOT_TESTED. Запрещены delete/reset/install/restore/cleanup. Сохранить прежний файл и результат SHA.

---
## FILEPROOF329 — исправление молчаливого зависания (2026-11-21)

- Пользователь сообщил: первоначальный Android preflight оставался с мигающим курсором и без вывода; `Ctrl+C` завершил попытку. Последующие отдельные безопасные ADB-команды подтвердили NE2213 как `device`, ровно один файл `paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka` и pinned SHA `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`. Это **не** подтверждает внутренний preflight и не доказывает причину зависания.
- В PR #333 исправлен `tools/android-fileproof329-readonly-preflight.ps1`: пять коротких диагностических стадий до ADB-запросов; stdout/stderr читаются асинхронно; каждый ADB-процесс ограничен 12 секундами, при timeout прерывается только созданный ADB-процесс (не приложение); результат `ADB_TIMEOUT_12S` fail-closed. Добавлен регрессионный статический тест.
- CI на новом SHA и физический повторный запуск после исправления пока не подтверждены. Пользовательское видео и синтетический архив не менялись, удаление не разрешено.
- Следующий шаг: green CI на SHA исправления, затем один запуск закреплённого read-only диагностического сценария, который показывает этап сбоя.

---

## FILEPROOF329 — CI подтверждён для read-only Android preflight (2026-11-21)

- На HEAD `e8e44f7933226f8774723a39aa47c47a77360465` специализированный GitHub Actions [run #44939952001](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44939952001): `preflight` job completed/success; Node parser, PowerShell parser, negative + source-safety checks прошли. Это проверка кода, не физический Android запуск.
- Следующее действие: один read-only вызов `tools/android-fileproof329-readonly-preflight.ps1` с существующим тестовым архивом, только после фиксации CI. Нет установки APK, restore commit или удаления видео. Телефон пока не подвергался новому тесту.

---

## FILEPROOF329 — следующий аппаратный read-only gate (2026-11-21)

- CI для первоначального PR #333 HEAD `7dbfa8c39990211a9fd6110ce6b1be9a94a640dc`: [run 44939830190](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44939830190) завершён `success` (Node parse и негативные тесты). Это не физический restore.
- Добавлен `tools/android-fileproof329-readonly-preflight.ps1`: читает только уже установленный `fileproof329`, его private report и ровно один синтетический архив в `/sdcard/Download/PasekaProof329`; в памяти сверяет внешний SHA, PASEKA01 manifest, state и оба MP4 chunk/SHA. Без записи даже на ПК; нет force-stop, перезапуска, установки, restore или удаления.
- Добавлены статический негативный тест и PowerShell parse gate; CI на новом HEAD ожидает подтверждения. Запуск на физическом устройстве не выполнялся, `restoreCommit=NOT_TESTED`, `cleanupAuthorized=false`.
- Не использовать аппаратную команду до успешного CI на точном SHA. Не менять производственное приложение и пользовательские данные.

---

## Контрольная точка — FILEPROOF329 внешний архив и read-only preflight (2026-11-21)

- Физический OnePlus NE2213/API36: пользователь сообщил `ISOLATED_FILEPROOF329_POST_STOP_EXTERNAL_SHA_PASS`. Независимый ADB readback 3158-byte PASEKA01 совпал с pinned SHA `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186` до и после `force-stop` только тестового приложения; private report остался неизменным. Доказательство относится только к синтетическому пакету `ru.paseka.journal.archive.fileproof329`.
- Следующий этап в ветке `test/android-fileproof329-restore-preflight-2026-11-21`: `tools/fileproof329-archive-preflight.mjs` читает локальную копию архива без изменений, требует точно закреплённые размер/SHA, проверяет формат/manifest/chunk hashes через production `PasekaArchive`, валидирует структуру state и два изолированных MP4 (ID/size/SHA), не вызывает restore commit.
- Негативные тесты `tests/fileproof329-archive-preflight.test.mjs`; специализированный CI workflow. CI на HEAD новой ветки пока не подтверждён; реальный внешний файл этой новой проверкой ещё не проверялся.
- Нет удаления видео, распознавания, MP4 decoder/playback, восстановления данных, production install/deploy/merge. `cleanupAuthorized=false`. Оригинальный физический тестовый файл нужно сохранить.
- Следующее действие: проверить CI на точном SHA, затем выполнить только read-only preflight на байтах существующего синтетического архива, без обновления APK/перезаписи файла и без восстановления.

---

## 2026-11-21 — Draft #332: независимый SHA физического внешнего PASEKA01 после stop; CI mock PASS, телефон NOT TESTED

- На основании **действительного** OnePlus NE2213/API36 `ISOLATED_FILEPROOF329_MEDIASTORE_PASS` (файл PASEKA01 **3158 B**, SHA-256 `4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`; private report 466 B, SHA `002fbc37d6627e1412f95ad68946388dceeb257fda55b51b8df62b7ba3886ac4`) открыт stacked [Draft PR #332](https://github.com/250oisr-eng/Pasekaapp/pull/332) поверх #331.
- Создан `tools/android-fileproof329-external-after-stop.ps1`: проверка **только** ранее созданного synthetic MediaStore файла под `/sdcard/Download/PasekaProof329` с нативным `paseka-proof329-UUID.paseka`. Скрипт требует один авторизованный OnePlus NE2213/API36, существующий `ru.paseka.journal.archive.fileproof329`, прежний private report с **exact pinned SHA**, ровно один файл в выделенном test-каталоге. Сначала независимо читает **реальные бинарные байты файла через `adb -d exec-out cat`**, проверяет длину 3158, `PASEKA01` magic и полный заранее известный SHA. **Только после прохода обоих preflight** делает `am force-stop` **исключительно fileproof329**, повторно читает *тот же* файл и сверяет SHA, затем сверяет неизменность private report. Нет install, повторного экспорта, relaunch, restore, удаления/очистки. При ошибке или отсутствии доступа shell к Android Downloads — `BLOCKED`, без ложного PASS.
- Новые `tests/test_android_fileproof329_external_after_stop_mock.sh` и `.github/workflows/test-android-fileproof329-external-after-stop.yml` проверяют шесть ADB mock случаев: success, corrupt-before (без stop), corrupt-after (BLOCKED), two-files (без stop), wrong-name (без stop), missing-package (без stop). Мок-тест создаёт только временный **синтетический** архив 3158 B и подставляет его hash **исключительно в отдельную временную копию скрипта runner**, не изменяя production/pinned hashes в репозитории.
- [CI #44939381130](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44939381130), точный source SHA `df4bc4fc69160e629ea13ec4a5116ba19b87f9cd`: **completed/success**, PowerShell parser и **6/6 mock PASS**. Это не реальный USB. Реальный post-stop external file SHA на телефоне **NOT TESTED** до вывода пользователя.
- Следующий шаг после проверки CI: один запуск закреплённой команды с компьютера и подключённого OnePlus. **Не удалять / не переустанавливать `fileproof329` и не трогать прежние пользовательские архивы**, иначе утратится независимая контрольная точка. Дальнейший restore в отдельную IDB пока отдельная задача. `cleanupAuthorized=false`, `recognitionSucceeded=false`, никаких main/merge/production deployment.

## 2026-11-21 — ФИЗИЧЕСКИЙ PASS MediaStore readback: fileproof329 / 2 MP4 / PASEKA01 (OnePlus NE2213/API36)

- Пользователь выполнил pinned `tools/android-fileproof329-readonly-recovery.ps1` из code SHA `f9f38349584a8a21427a163473dd046dac21696e` на физическом OnePlus **NE2213/API36**. Отчёт: `PACKAGE: EXISTING_FILEPROOF329 | READ_ONLY`; `REPORT_BYTES: 466`; `REPORT_SHA256: 002fbc37d6627e1412f95ad68946388dceeb257fda55b51b8df62b7ba3886ac4`; `REPORT_LINES: 1`; `REPORT_STATUS: PASS`; `STATUS: ISOLATED_FILEPROOF329_MEDIASTORE_PASS`.
- **Полный PASEKA01** `ARCHIVE_BYTES: 3158`, `ARCHIVE_SHA256: 4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186`. Источник MP4 №1 `794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f`, №2 `bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff`. Native bridge записал файл с нативным UUID в **отдельный `Download/PasekaProof329/`**, прочитал тот же MediaStore URI и сверил bytes/SHA; этот факт подтверждён **существующим отчётом приложения**, валидированным read-only recovery, а не самостоятельным извлечением внешнего файла через PC.
- Предыдущий исходный установочный PowerShell вернул `PROOF_JSON_INVALID`; новый скрипт успешно обработал существующую запись **без повторной установки, запуска приложения, нового экспорта или удаления**, восстановил проверенный PASS. Точную байтовую причину первоначального сбоя прежнего JSON parser по одному выводу не установить; факт валидного отчёта подтверждён.
- **Не проверено:** файл из Android Downloads повторно открыт **после перезапуска процесса/телефона** независимо от отчёта; настоящее восстановление `PASEKA01` в свежую IndexedDB через commit; воспроизведение/декодирование двух MP4; анализ/распознавание пчёл; удаление видео. `PERSISTED_FILE_POST_RESTART: NOT_TESTED`, `RESTORE_COMMIT_AND_MP4_PLAYBACK: NOT_TESTED`, `VIDEO_RECOGNITION_AND_CLEANUP: NOT_AUTHORIZED`, `cleanupAuthorized=false`, `recognitionSucceeded=false`.
- Закрытый эксперимент **не трогал** `ru.paseka.journal`, `ru.paseka.journal.archive.test` или `ru.paseka.journal.archive.proof325`; никаких файлов на Android не удалялось. Тестовый пакет `fileproof329` и его external архив **сохранить**. Не повторять одноразовую запись и не применять `pm clear/uninstall`. Следующий этап — спроектировать строго read-only проверку сохранённого PASEKA01 извне через URI/MediaStore с SHA-256 после остановки без удаления и затем отдельный безопасный restore в совершенно новую тестовую БД. Draft [#331](https://github.com/250oisr-eng/Pasekaapp/pull/331), no merge/main/deployment.

## 2026-11-21 — Физический fileproof329: APK установлен, proof JSON BLOCKED; read-only recovery CI PASS

- Пользователь реально запустил pinned `tools/android-two-mp4-fileproof329-device.ps1` с verified APK ZIP SHA `3213b323fbf2c6521c88da93abe172611559377375f4f2a167e9e85f86cb9727` на физическом OnePlus NE2213/API36. Подтверждён вывод `PACKAGE: NEW_ISOLATED_FILEPROOF329_INSTALLED` затем **`STATUS: BLOCKED`, `DETAIL: PROOF_JSON_INVALID`, `NO_ANDROID_FILES_DELETED; NO_PACKAGE_UNINSTALL_OR_CLEAR`**. Успех MediaStore readback, actual existence archive, его SHA и признание двух видео **НЕ подтверждены** этим выводом; сам JSON (байты) ещё не изучен. Нельзя повторно запускать установочный скрипт, `pm clear`, uninstall, force-stop или переэкспорт: существует стойкий marker одноразовой попытки и возможно уже созданный MediaStore URI.
- Создан новый stacked [Draft PR #331](https://github.com/250oisr-eng/Pasekaapp/pull/331) поверх #330 с **только читающим** `tools/android-fileproof329-readonly-recovery.ps1`, binary `adb -d exec-out run-as ru.paseka.journal.archive.fileproof329 cat files/paseka-fileproof329.ndjson`, независимым stdout/stderr, SHA-256 байтов отчёта и безопасной обработкой обычного LF и буквального `\\n`. Валидируются pinned SHA обеих MP4, `FILE_READBACK_PASS`, `cleanupAuthorized=false` и `recognitionSucceeded=false`. При `BLOCKED` печатается только проверенный код ошибки, при повреждении только короткий hex prefix — никаких пользовательских данных.
- [Recovery CI #44938883279](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938883279), точный код SHA `f9f38349584a8a21427a163473dd046dac21696e`: **completed/success**, PowerShell parser и **пять mock сценариев PASS** (LF, literal `\\n`, blocked report, malformed, double report). В тестовом ADB **нет** install, uninstall, force-stop, pm clear, delete. Физическая recovery команда **НЕ запущена** пользователем; нет Android MediaStore PASS до её результата.
- Следующий шаг: однократная команда read-only recovery с pinned SHA на том же ПК с подключённым OnePlus. Если `BLOCKED`, использовать `REPORT_BYTES`, `REPORT_SHA256`, `JSON_PREFIX_HEX` / `APP_PROOF_BLOCKED_<CODE>` для безопасного дальнейшего анализа, не удалять тестовый архив и не трогать приложения. Main/PR merge/deploy запрещены, распознавание и очистка видео выключены.

## 2026-11-21 — Draft #330: активный изолированный Android MediaStore PASEKA01, CI PASS; физический запуск НЕ выполнен

- Создан stacked [Draft PR #330](https://github.com/250oisr-eng/Pasekaapp/pull/330) поверх #329, не main. Добавлены `tests/fixtures/android-two-mp4-fileproof329.js`, `tests/android-two-mp4-fileproof329-runtime.test.mjs`, новые CI/USB-mock и `tools/android-two-mp4-fileproof329-device.ps1`; обновлены тестовый `scripts/prepare-android-two-mp4-fileproof329.mjs`, workflow и протокол `docs/ANDROID-TWO-MP4-FILEPROOF329-RUNTIME-TEST.md`.
- В **новом package** `ru.paseka.journal.archive.fileproof329` активный test-only экран проверяет SHA двух 893 B synthetic MP4 до IndexedDB, пишет только в пустую `paseka_fileproof_329_v1`; атомарно ставит durable **one-shot marker до внешней записи**. Закрывает/повторно открывает IDB, сверяет оба Blob и вызывает реальный PASEKA01 exporter+parse+verify+restore preflight без commit. Test-only Java MediaStore bridge принимает только PASEKA01 <=1 MiB и ожидаемый SHA, создаёт файл под нативным UUID **только `Download/PasekaProof329/`**, читает обратно **тот же URI** и сверяет bytes/SHA. Внутренний native отчёт `files/paseka-fileproof329.ndjson` через `adb exec-out run-as` не требует доступа к пользовательским архивам.
- [Специализированный APK CI #44938075602](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938075602), exact **code SHA `b7e097fff66e02dd6d8a477baff903be474c6187`**: **completed/success, 1233/1233 Node PASS, 0 fail, Gradle BUILD SUCCESSFUL**, AAPT проверил package `ru.paseka.journal.archive.fileproof329`. Артефакт [#14720900563](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938075602/artifacts/14720900563), ZIP 3349848 bytes, pinned GitHub upload SHA256 `3213b323fbf2c6521c88da93abe172611559377375f4f2a167e9e85f86cb9727`.
- Первые USB-mock CI `#44938223744`/ `#44938217611` **FAIL**: PowerShell `AdbText([string[]]$args)` использовал автоматическую переменную. Исправлено на `$argv`. [USB CI #44938285085](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938285085) и [#44938291588](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44938291588), exact **script SHA `f2b7a4290af78835f482214ba64b1038cb5d536b`**: **completed/success**; Windows PowerShell parse, negative missing ZIP/already-installed и позитивная ADB симуляция с двумя pinned MP4 SHA. Это mock, не физический Android.
- **Физическая запись Android MediaStore/Downloads НЕ ПРОВЕРЕНА**. Для единственного физического испытания потребуется USB OnePlus NE2213/API36 и проверенный ZIP, установка только нового `fileproof329` если отсутствует. При BLOCKED **не переустанавливать, не очищать и не удалять**; внешний synthetic файл может остаться. Предыдущие `ru.paseka.journal`, `archive.test`, `proof325` и пользовательские видео/архивы не менялись.
- Restore commit, независимое открытие файла после force-stop, playback, распознавание, cleanup оригиналов **NOT TESTED**. `recognitionSucceeded=false`, `cleanupAuthorized=false`. Никакого merge, production deploy.
 
## 2026-11-21 — физически безопасная Java компиляция fileproof329 подтверждена CI

- [Специализированный run #44937442484](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937442484) на **точном кодовом SHA `77ae44faa1d68b1e8cde17c8fd951e956f4b0457`** завершён **completed/success**, Node **1230/1230 PASS, fail 0**, `BUILD SUCCESSFUL`. AAPT: `ru.paseka.journal.archive.fileproof329`. Artifact ID `14719299636`, name `paseka-fileproof329-inert-compile-apk`, GitHub ZIP SHA-256 `1953605e0deeb1fb8a31c420e24a07e2e6c99c734bd24213c9d10b8f62f57405`.
- Это **инертный APK для проверки Java компиляции**. Он НЕ запускает запись MediaStore, НЕ содержит сценария полноценного PASEKA01-файла с двумя видео в Downloads, НЕ производит restore и НЕ проверен на телефоне. Не просить пользователя его устанавливать; `proof325` не изменён.
- Протокол `docs/ANDROID-TWO-MP4-MEDIASTORE-PROOF329-PLAN.md` обновлён. Для дальнейшей реальной проверки нужно отдельное дополнительное изменение JS test screen, защищённый отчёт, unit/integration tests и новая APK с собственным SHA; текущий compiled artifact для физического test недостаточен.
- Нет изменений main/production, merge, удаления архивов или видео; `cleanupAuthorized=false`.

## 2026-11-21 — Draft #329: изолированный fileproof329 Java bridge + инертная APK сборка

- [Draft #329](https://github.com/250oisr-eng/Pasekaapp/pull/329) содержит только тестовую ветку, не `main`. Создано `scripts/isolated-android-mediastore-proof-bridge.mjs`: нативный Java helper для нового package `ru.paseka.journal.archive.fileproof329`, проверяет PASEKA01, входной SHA, размер <=1 MiB, генерирует уникальный UUID и тестовую `Download/PasekaProof329/`, запрашивает MediaStore filename collision, пишет по полученному URI, публикует, повторно читает тот же URI и проверяет bytes+SHA. Не передаётся пользовательский filename/path. После *любой* попытки включается one-shot, нет API удаления и восстановления.
- `tests/android-two-mp4-mediastore-isolation.test.mjs` содержит 3 проверки изолированного пакета, отсутствия delete/overwrite пользовательских архивов и fail-closed контракта. [Fast quality checks #44937306814](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937306814) на точном SHA `dd80a0f78fb68d898829fc55944fd35cf0ab379e`: **completed/success, 1230/1230 PASS**.
- Дополнительно создан `scripts/prepare-android-two-mp4-fileproof329.mjs` и `.github/workflows/android-two-mp4-fileproof329.yml`. При специальном env генерируется **отдельная** fileproof329 APK и Java bridge, но экран **инертный**, без вызовов записи, restore или чтения пользовательских данных; обычный production package не меняется. [Специализированная сборка #44937442484](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937442484), exact SHA `77ae44faa1d68b1e8cde17c8fd951e956f4b0457`, **in_progress** на шаге Gradle `Build inert fileproof329 isolated debug APK` при последней проверке; окончательный CI статус не утверждать до завершения. Полный protocol: `docs/ANDROID-TWO-MP4-MEDIASTORE-PROOF329-PLAN.md`.
- Это **не** физический MediaStore test: имя/URI файлов на реальном Android, реальные external writes, проверка Downloads, restore commit и безопасность удаления исходных видео `NOT TESTED`. `proof325`, пользовательские архивы, пользовательские данные и production не изменялись. `cleanupAuthorized=false`, `recognitionSucceeded=false`; никакого merge/deployment.
- Следующее действие после завершения compile CI: отдельная web-страница, которая явно формирует только тестовый PASEKA01 из закреплённых MP4 и вызывает bridge, с native readback SHA; предварительно дополнять негативные тесты. Не просить пользователя запускать инертную APK, пока физический сценарий не готов.

## 2026-11-21 — one-shot bridge после изменения: CI 1230/1230 PASS

- [Fast quality checks #44937306814](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937306814) на точном code SHA `dd80a0f78fb68d898829fc55944fd35cf0ab379e` — **completed/success**, **1230/1230 PASS, 0 fail**. Это включает one-shot-after-attempt safety gate и static Java source contract tests.
- [PR Android build #44937310691](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937310691) **cancelled** в ходе последующего обновления документации; [старый isolated archive test APK #44937310695](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937310695) **skipped**. Ни один из них не доказывает сборку нового package fileproof329. Разработанный generator Java еще не включён в Android APK, следовательно реальный javac/Gradle проверки этого bridge и физический MediaStore тест **NOT TESTED**.
- Новые docs коммиты не должны трактоваться как повторный CI исходников. Данные `proof325` на OnePlus, пользовательские архивы и production не изменялись; никаких merge/deploy/delete.
 
## 2026-11-21 — Draft #329: ограниченный Android MediaStore proof bridge, без влияния на существующие архивы

- После физического PASS `proof325` и реального PASEKA01 disk roundtrip Node CI подготовлен stacked [Draft #329](https://github.com/250oisr-eng/Pasekaapp/pull/329) поверх #328, не main. Добавлены `scripts/isolated-android-mediastore-proof-bridge.mjs` и `tests/android-two-mp4-mediastore-isolation.test.mjs`; протокол `docs/ANDROID-TWO-MP4-MEDIASTORE-PROOF329-PLAN.md`.
- Новый Java source generator предназначен **только для ещё не собранного test package** `ru.paseka.journal.archive.fileproof329`, не применяется в production или установленном `proof325`. Нативный мост принимает только PASEKA01 и SHA, ограничение 1 MiB, генерирует собственный UUID в `Download/PasekaProof329/` и проверяет отсутствие записи с тем же именем, пишет только в URI, возвращённый insert, повторно читает **тот же URI**, сверяет bytes и SHA. У API нет удаления пользовательских файлов и метода restore.
- Обнаруженный риск: при ошибке после insert мог остаться собственный pending URI. Чтобы не размножать такие записи при повторных попытках, bridge стал **one-shot по попытке**, даже если первая попытка заблокирована; ошибки не приводят к автоматическому удалению, разрешение на cleanup отсутствует. Даже с `query` полная видимость чужих MediaStore записей не гарантируется: требуются отдельная папка, нативный random filename, дополнительный физический preflight.
- [Fast quality checks #44937232290](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44937232290) на **предыдущем code SHA `fcc49995096409d89e818cec79f9c09c07c632ed`** — **completed/success, 1230/1230 PASS**. Изменение one-shot на `dd80a0f78fb68d898829fc55944fd35cf0ab379e` **требует отдельной проверки CI**; не приписывать прежний PASS последующему коду. Общая Android build/новый fileproof329 APK и физическое MediaStore чтение пока **NOT TESTED**.
- Следующее: получить PASS текущего SHA, проверить Java source compilation в *отдельной* сборке, добавить тестовую страницу и целиком изолированный APK, собрать один сценарий ADB/USB без установки поверх предыдущих пакетов. Затем отдельный restore в новой IDB, без затрагивания production. `recognitionSucceeded=false`, `cleanupAuthorized=false`, auto-delete оригинальных видео запрещён.
 
## 2026-11-21 — завершённый CI и обнаруженный риск collision Android MediaStore

- На точном code SHA `f8951094c36ef788f883f64919d5894cc42ba45e` [Build Android APK #44936845787](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44936845787) **completed/success**, [Fast quality checks #44936845758](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44936845758) **completed/success, 1227/1227 PASS**. Параллельная PR Android #44936858898 `cancelled`, старый isolated APK #44936858853 `skipped` — НЕ считать успешными.
- Адресно прочитан `scripts/prepare-android-archive-download.mjs`: нативный `beginFile` проверяет шаблон и MIME, `MediaStore.Downloads.insert` пишет в `Downloads/Пасека`, но отсутствует доказанная проверка отсутствия существующего файла того же имени и подтверждение отображаемого URI при collision. **Не использовать** его для физического испытания над прежними архивами до реализации отдельного безопасного изолированного сценария. Протокол риска — `docs/ANDROID-TWO-MP4-EXTERNAL-FILE-ROUNDTRIP-2026-11-21.md`.
- Документационные коммиты после code SHA не меняют tests/runtime, однако статус CI приписывается только точному SHA. Никаких физических Android Downloads test или restore commit пока не выполнялось; `cleanupAuthorized=false`.

## 2026-11-21 — Draft #328: PASEKA01 с двумя MP4 → эксклюзивная запись файла → повторное чтение диска (Node CI)

- После физического `ISOLATED_ANDROID_TWO_MP4_EXPORT_PASS` (OnePlus NE2213/API36, in-memory PASEKA01, отдельный `proof325`) создан stacked [Draft PR #328](https://github.com/250oisr-eng/Pasekaapp/pull/328) поверх #327. Изменены только `tests/android-two-mp4-external-file-roundtrip.test.mjs` и документация: `docs/ANDROID-TWO-MP4-EXTERNAL-FILE-ROUNDTRIP-2026-11-21.md`.
- Проверка создаёт отдельную `fake-indexeddb` с двумя закреплёнными синтетическими MP4, вызывает **настоящий** `PasekaArchive.exportArchiveFromDatabase`, записывает реальный бинарный PASEKA01-файл в уникальный временный каталог Node runner через `open('wx')` + `fsync` (без overwrite), закрывает, заново читает с диска, сопоставляет SHA всего файла и двух оригинальных видео и проверяет `validateArchiveForRestore` **без restore commit**.
- Негативные сценарии: запись поверх файла блокируется `EEXIST`; подмена байта видео блокируется `CHECKSUM_MISMATCH`; усечённый файл отклоняется; другая IndexedDB не затронута. Источник — тестовые встроенные bytes, не Android Camera/Gallery, нет реальных пользовательских данных.
- [Fast quality checks #44936845758](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44936845758) на точном test SHA `f8951094c36ef788f883f64919d5894cc42ba45e`: **completed/success, 1227/1227 PASS, 0 fail**. Общую Android сборку проверять отдельно на этом SHA; ранее её завершение не было подтверждено. Старый изолированный APK workflow `skipped` — не успех.
- **Ключевая граница:** файловая система CI ≠ Android MediaStore Downloads. На физическом OnePlus внешняя запись PASEKA01 и реальное восстановление в отдельную IDB ещё **NOT TESTED**; `proof325` и его исходные данные не менялись. `recognitionSucceeded=false`, `cleanupAuthorized=false`, автоматическое удаление видео выключено. Никакого main/merge/production deployment.
- Следующий независимый шаг: оценить Android Downloads bridge/collision и подготовить тест строго в новом изолированном package, безопасном уникальном файле, без перезаписи существующих данных; после этого — реальные результаты физического устройства.

## 2026-11-21 — ФИЗИЧЕСКИЙ PASS на OnePlus: два синтетических MP4 / IndexedDB / PASEKA01 in-memory export / relaunch

- Пользователь выполнил закреплённый `tools/android-two-mp4-proof325-report-recovery.ps1 -Resume` из кода SHA `a9674bef51436bcb860088aba273caf320aa782a` на Windows + физический OnePlus **NE2213/API36**. Отчёт: `DEVICE: NE2213 / API36`, `PACKAGE: EXISTING_PROOF325 | NO INSTALL OR RESET`, `INITIAL_PROOF: VERIFIED; STOP/RELAUNCH ONLY PROOF325`, `REPORT_1_STATUS: INITIAL_PASS`, после `am force-stop` и нового запуска **`REPORT_2_STATUS: RELAUNCH_PASS`**, итог **`STATUS: ISOLATED_ANDROID_TWO_MP4_EXPORT_PASS`**.
- До перезапуска: частный журнал **477 байт**, SHA256 `ce5149c5ac3bc25a3f77d8233573c12818f55fd2fde8fa7c81c38537a1814323`, `REPORT_LINES: 1`. После: **955 байт**, SHA256 `d41c76dbff80239ae0856f071b11c02ce274e4e51d99ccdf2f3aaae2edfdc77b`, `REPORT_LINES: 2`; между остановкой и добавлением второго отчёта первый hash оставался неизменным. Это подтвердил **вывод физического запуска пользователя**, а не независимое чтение USB из CI.
- Диагностический JS в APK `ru.paseka.journal.archive.proof325` до регистрации каждого `*_PASS` самостоятельно сверяет встроенные независимые SHA источников: `794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f` и `bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff`. Проверяет собственную новую IndexedDB (`entrance_media`), закрытие/повторное открытие, сверку Blob, `PasekaArchive.exportArchiveFromDatabase` (контейнер **только в памяти**), chunk SHA и preflight без restore commit. Recovery PS также валидировал оба отчёта, pinned источники и `cleanupAuthorized=false`.
- **Граница PASS:** только тестовый APK и собственная синтетическая БД на физическом OnePlus, in-memory PASEKA01, сохранение после `force-stop`. Ни Android MP4 decoder/playback, ни штатный рабочий пакет и его настоящая база, ни запись/повторное открытие отдельного .paseka из Downloads, ни actual restore, ни Camera/Gallery/MediaStore, ни нейросетевое распознавание **НЕ проверены**. `recognitionSucceeded=false`, `cleanupAuthorized=false`, auto-delete видео **запрещено**.
- Ранее наблюдавшийся `PROOF_REPORT_INVALID_JSON` в первом Windows скрипте устранён обходом ненадёжного парсинга ADB-вывода и корректным чтением приватного отчёта; точная природа первого сбоя байтов из первоначального отчёта не установлена. Специализированный recovery CI [#44936391810](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44936391810) на `a9674bef51436bcb860088aba273caf320aa782a`: **completed/success**, 5 mock cases, плюс подтверждённый теперь физический результат.
- **Следующий этап**: отдельно спроектировать и проверить экспорт в реальный внешний `.paseka` через Android bridge и чтение/сверку SHA без перезаписи имеющихся архивов; подготовить безопасную изолированную проверку restore без влияния на существующий `proof325`. Нельзя удалять пользовательские видео или останавливать их рабочий пакет без отдельного основания. Draft PR #327 остаётся открытым, без merge/main/deploy.

## 2026-11-21 — физический proof325: установка подтверждена, разбор native-отчёта BLOCKED; исправление CI PASS

- Пользователь на Windows/OnePlus NE2213/API36 выполнил pinned `tools/android-two-mp4-proof-device.ps1` (script SHA `ffb723a6033bd87138cd8925c09c497c5a1c5c30`, APK artifact #14719577745). Отчёт:
  `PACKAGE: NEW_ISOLATED_PROOF325_INSTALLED`; `STATUS: BLOCKED`; `DETAIL: PROOF_REPORT_INVALID_JSON`; `NO_ANDROID_FILES_DELETED; NO_PACKAGE_UNINSTALL_OR_CLEAR`. Это подтверждает **установку изолированного пакета**, но **не** `INITIAL_PASS`, не SHA двух MP4 внутри IndexedDB, не force-stop/relaunch. Причина invalid JSON не установлена по одному тексту отчёта; возможны граница Java/ADB/PowerShell или содержимое private journal.
- Создан отдельный stacked Draft [#327](https://github.com/250oisr-eng/Pasekaapp/pull/327) поверх #326. Файл `tools/android-two-mp4-proof325-report-recovery.ps1` читает **только существующий** `ru.paseka.journal.archive.proof325` через binary `adb -d exec-out run-as ... cat files/paseka-two-mp4-proof.ndjson`, stdout без stderr, проверяет точный device, размер, UTF-8, SHA отчёта, поля двух MP4 и флаги `cleanupAuthorized=false`. Различает перевод строки LF и буквальный `\\n` между полными JSON. Если строка невалидна, выводит только ограниченный hex-префикс и BLOCKED, без утечки содержимого или ложного PASS.
- По умолчанию скрипт **только читает**. Флаг `-Resume` позволяет один `am force-stop` только `proof325` и relaunch **лишь после** криптографически сверенного `INITIAL_PASS`; если отчёт уже содержит два валидных результата, повторной остановки нет. Запрещены `adb install`, `pm clear`, `uninstall`, удаление файлов.
- [GitHub CI #44936391810](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44936391810) на **точном SHA `a9674bef51436bcb860088aba273caf320aa782a`** — **completed/success**, PowerShell parse и **5 mock ADB сценариев PASS**: corrupt, initial only, two valid, literal `\\n`, safe resume. Физический Windows recovery **NOT TESTED**. Новый Android APK не собирался/не требуется, production и история ульев не менялись.
- Следующее единственное действие: один запуск pinned recovery PS на Windows с `-Resume` после подключения OnePlus. Если `BLOCKED`, передать только вывод для диагностики; не повторять установку и не чистить тестовый пакет. Автоматическое удаление оригинальных видео остаётся запрещённым.

## 2026-11-21 — специализированная Android APK proof325 успешно собрана на точном SHA

- Код/CI SHA **`a4637a443419c0783672683d83c0809410ee33c6`**: [Build isolated two-MP4 proof APK #44935383924](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44935383924) **completed/success**. Node regressions **1223/1223 PASS, 0 failed**, Gradle `BUILD SUCCESSFUL`; AAPT подтвердил **точный тестовый package `ru.paseka.journal.archive.proof325`**; Upload Artifact success.
- [Артефакт GitHub](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44935383924/artifacts/14719577745): ID **14719577745**, имя `paseka-two-mp4-proof-isolated-apk`, ZIP size **3346013 bytes**, GitHub upload ZIP SHA-256 **`21e8e54d5cfb2c90e5e5c2d55ae8ae099c8d335e6b10ee75ec4d1d0effd33222`**, expires 2026-12-05 UTC (по GitHub). Это **ZIP-архив артефакта**, а не digest находящегося в нём APK; Windows-script независимо сверяет ZIP перед извлечением ровно `app-debug.apk`.
- Отдельно [PowerShell proof mock CI #44935853326](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44935853326) **completed/success** на script SHA `ffb723a6033bd87138cd8925c09c497c5a1c5c30`: три отрицательных и полный положительный сценарий `INITIAL_PASS -> force-stop только proof325 -> RELAUNCH_PASS` с mock ADB. Скрипт закреплять на этом SHA.
- Реальный Windows/OnePlus запуск ещё **NOT TESTED**. При физическом испытании скачивать **только** SHA-verified artifact ZIP, устанавливать `proof325` только если отсутствует, один запуск скрипта из pinned SHA, передать один итоговый отчёт. Изолированная APK не записывает backup в Downloads и не делает restore commit, автоматическую очистку видео не включает.
- Сохранены ограничения: `cleanupAuthorized=false`, `recognitionSucceeded=false`, нет merge/main/production/deploy. Последующий документационный HEAD отдельно от проверенного code SHA; не переносить CI на изменённый код без новой проверки.

## 2026-11-21 — полный положительный mock Windows/ADB proof325 PASS

- Исправлена ошибка PowerShell `Reports()`: `return ,$parsed` возвращал вложенный массив, из-за которого `@(Reports)` мог неверно считать 0/1/2 результата. Используется `return $parsed` с перечислением отдельных отчётов.
- Добавлен `tests/test_android_two_mp4_proof_positive_mock.sh`: самостоятельно создаёт изолированный ZIP/APK test fixture, проверяет SHA ZIP, имитирует `adb install`, первый `INITIAL_PASS`, ровно один `am force-stop` только `ru.paseka.journal.archive.proof325`, второй `RELAUNCH_PASS`, запрет `pm clear/uninstall` и отсутствие пользовательского удаления. Исправлен начальный mock FAIL `ZIP_SIZE_LIMIT`: тестовый ZIP должен быть больше минимальной длины, использовано `ZIP_STORED` вместо сжимаемых нулей.
- [CI PowerShell USB proof #44935853326](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44935853326) **completed/success** на `ffb723a6033bd87138cd8925c09c497c5a1c5c30`: три negative cases PASS и **Positive two-report Windows PowerShell mock: PASS**. Это не физический Android и не подтверждение ZIP артефакта нового APK.
- Отдельный APK workflow [#44935383924](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44935383924) на `a4637a443419c0783672683d83c0809410ee33c6` по последнему наблюдению ещё **in_progress** на `Build proof-only isolated debug APK`; успех и SHA артефакта неизвестны. Не запускать пользовательский физический сценарий до подтверждения CI и SHA.
- Реальные данные, пользовательские файлы, main, merge, production deployment, распознавание и автоматическая очистка не затрагивались. `cleanupAuthorized=false`.

## 2026-11-21 — новый Draft #326: изолированный Android proof325, mock-ADB PASS, APK CI не завершён

- Создан stacked Draft [#326](https://github.com/250oisr-eng/Pasekaapp/pull/326) поверх #325. Только тестовые `tests/fixtures/android-two-mp4-proof.{html,js}`, фикстуры MP4, Node-тесты, CI workflow, сборочный скрипт и инструмент Windows. На runner формируется отдельный пакет `ru.paseka.journal.archive.proof325` со **своей новой IndexedDB**, не заменяющий production/ранее установленный архивный APK.
- Первый запуск: проверить независимые SHA-256 обоих источников до любой записи, сохранить два синтетических MP4 только в пустую отдельную IndexedDB, закрыть/открыть, проверить `PasekaArchive.exportArchiveFromDatabase` и полный архивный SHA; второй запуск — сверить их повторно без overwrite. `INITIAL_PASS/RELAUNCH_PASS` ещё **не подтверждены на телефоне**. Это экспорт **в памяти**, не реальный Downloads/restore.
- Подготовлен `tools/android-two-mp4-proof-device.ps1`: ZIP SHA pin, один NE2213/API36, отказ при уже установленном `proof325`, без `pm clear/uninstall`, сначала `INITIAL_PASS`, затем force-stop **только нового пакета** и `RELAUNCH_PASS`; чтение приватного append-only журнала через `adb shell run-as`. Скрипт на физическом Windows **NOT TESTED**.
- [Mock-ADB CI #44935389806](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44935389806) **completed/success**: PowerShell syntax, 3 negative cases, отсутствие установки/остановки при отказе. Общий CI PR #325 на предыдущем code SHA `1be1200218ad46ac048288a925993bbc650f2159` — 1220/1220 и Android Debug success, **не proof APK**.
- Первые proof CI падали на разрыве YAML `/\\r?\\n/` и конфликте двух нативных `onCreate`. Исправлено: исключён ненужный MediaStore Downloads bridge, workflow запускается только на значимых push в новую ветку. Проверка окончательного **proof APK artifact и SHA ZIP пока ожидается**; нельзя называть её PASS или передавать устройство на тест.
- Документ `docs/ANDROID-TWO-MP4-PROOF325-TEST-PLAN.md` содержит критерии и границы. Никаких user-media deletion, auto cleanup, production database, `main`, merge, публикации или production deployment. `recognitionSucceeded=false`, `cleanupAuthorized=false`.

## 2026-11-21 — итоговый CI code/test HEAD PR #325 пройден

- Проверенный **точный code/test HEAD**: `1be1200218ad46ac048288a925993bbc650f2159`. [GitHub Actions Android #44934193717](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44934193717) **completed/success**: **1220/1220 тестов**, 0 failed; Gradle `BUILD SUCCESSFUL`; `Upload APK` success. Artifact ID `14718559184`, ZIP size 3 532 409 bytes, SHA-256 `7f8a783eec0bf2e7db81992f418ffe0e354a090464767571aea61d75b7d0e7a8`.
- [Изолированная архивная APK #44934193670](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44934193670) **completed/skipped**: не считать успешной проверкой. Промежуточные Android runs отменены после новых commits и не засчитываются.
- Тесты исходных MP4/IndexedDB/PASEKA01 проверены в автоматизированной среде. Это **не** физический Android app-export, не запуск видеодекодера телефона и не доказательство распознавания. `cleanupAuthorized=false`. Комментарий с точными CI данными размещён в Draft #325.
- Следующий этап — подготовить отдельный безопасный физический сценарий для тестового APK без очистки существующей базы/внешних файлов, затем проверить полный app-export и re-open SHA. Документационные изменения после этого CI не переносят success на новый SHA автоматически.

## 2026-11-21 — отдельный Draft #325: реальные синтетические MP4 → IndexedDB → экспорт PASEKA01 (CI ожидается)

- Продолжение #324 поверх коммита `b0cb19f9571406f06f5bbb860e8d0f7ed8834b4b`; создан Draft PR #325, `test/android-two-blob-app-export-gate-2026-11-21`. Рабочий файл `tests/video-archive-two-blob-export.test.mjs` проверяет действительный `PasekaArchive.exportArchiveFromDatabase`, парсинг, chunk SHA и проверку перед восстановлением.
- Две независимо созданные FFmpeg/ffprobe синтетические MP4 по 893 байта (чёрный/белый кадр, 16×16): SHA256 `794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f` и `bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff`. Base64 зафиксирован в тесте. Android-декодирование **не проверено**.
- Добавлены негативные проверки порчи одного байта, отсутствующего Blob и существующего recognition ledger, а также отдельная проверка записи двух файлов через `fake-indexeddb` в **новую изолированную** базу, закрытия/повторного открытия и SHA-равенства app-export.
- Документ `docs/ANDROID-TWO-MP4-APP-EXPORT-REGRESSION-2026-11-21.md` описывает границы и следующий шаг. Изменения только в тестах и документации, **не в runtime APK, main или production**.
- GitHub Actions CI на конечном SHA ещё **не подтверждён**; предыдущие запуски на промежуточных коммитах не переносятся на новый HEAD. Физический Android app-export/restore и распознавание **NOT TESTED**. `cleanupAuthorized=false`; удаление запрещено.

## 2026-11-21 — физический Android: два внешних синтетических Blob SHA PASS после stop/relaunch

- Пользователь выполнил pinned `tools/android_synthetic_two_video_stop.ps1` на OnePlus NE2213 / API 36, isolated `ru.paseka.journal.archive.test`. Создан **новый** внешний PASEKA01 с двумя синтетическими **не playable MP4** Blob. SHA общего контейнера `35ffcaa22e9fd48889a61b124f07110c300ae4a8208b273f773bc81f9b2c4ffb`.
- `ANDROID_COPY_BEFORE_STOP=PASS`, `ANDROID_COPY_AFTER_STOP=PASS`, `ANDROID_COPY_AFTER_RELAUNCH=PASS`; итог `EXTERNAL_TWO_BLOB_SHA_PASS`. Путь сохранённого файла `/sdcard/Download/Пасека/isolated-archive-synthetic-tests/092330b0d99f47ceb577a5082427905f/synthetic-two-video.paseka`. По отчёту скрипта Android файлы **не удалялись**.
- Это **не проверка** IndexedDB, app-export с видео, playable MP4, restore, распознавания или cleanup. `cleanupAuthorized=false`, `recognitionSucceeded=false`.
- Полный протокол фактов и следующего read-only/isolated теста: `docs/ANDROID-SYNTHETIC-TWO-VIDEO-PHYSICAL-RESULT-2026-11-21.md`. Результат также добавлен комментарием к Draft PR #324.
- Следующий приоритет: два независимо захешированных синтетических декодируемых MP4 только в безопасно созданной изолированной базе `entrance_media` → штатный app-export → full SHA до/после stop/relaunch. Не выполнять удаление, uninstall/reset, production deployment или merge.

## 2026-11-21 — физический Windows ADB: BLOCKED при проверке отсутствия уникальной папки; атомарное создание исправлено

- Пользователь на OnePlus NE2213 Android16/API36 запустил закреплённый `tools/android_synthetic_two_video_stop.ps1` и получил **`STATUS: BLOCKED`**, `DETAIL: Test did not finish: Destination exists or cannot be verified absent; no write performed`. Это произошло **до записи синтетического тестового файла** и до `am force-stop`. Из вывода нельзя установить, существовала ли папка или неудачно вернулся `adb shell test -e`; нельзя объявлять данные повреждёнными.
- Исправление: в Windows `tools/android_synthetic_two_video_stop.ps1` теперь один раз создаётся только выделенный фиксированный родитель `Download/Пасека/isolated-archive-synthetic-tests` через `mkdir -p`, затем уникальный GUID-каталог создаётся **атомарным `mkdir` без `-p`**. Если каталог существует или Android возвращает ошибку, `BLOCKED` **до push и stop**; не использовать `test -e`, не перезаписывать файлы. Само уникальное имя каждый раз новое. На Android не удалять прежние архивы или директории.
- Аналогично согласован Python `tools/test_android_synthetic_archive_force_stop.py`. В `tests/test_android_two_video_stop_mock.sh` добавлен сценарий `mkdir_collision` с обязательным запретом `adb push` и `force-stop`. В `tests/test_android_synthetic_archive_force_stop.py` добавлена аналогичная регрессия. **Профильный CI на SHA `53bab2d6a4a96057b5158f1395bf94b7a10aeff9` — SUCCESS** (workflow #44933149670, 9 прежних + 8 новых unittest и mock ADB/PowerShell). Реальный Windows запуск исправленного сценария пока **NOT TESTED**.
- Новый тест сохраняет два **вымышленных, не воспроизводимых MP4** видео-подобных blob в новом внешнем `PASEKA01`. Это **не** сохранение оригиналов приложением в IndexedDB и не проверка восстановления или копий в Gallery/Camera. Auto video deletion **DISABLED**. Приложение для запуска не переустанавливать; требуется один запуск pinned скрипта на ПК, он остановит только **тестовый** пакет после успешной сверки SHA. Физический результат `EXTERNAL_TWO_BLOB_SHA_PASS` пока не получен, merge/main/production/deploy не делать.

## 2026-11-21 — следующий физический Android этап готов: один Windows скрипт для двух синтетических видео-подобных блоков PASEKA01

- После реального `ARCHIVE_STRUCTURE_VERIFIED` для одного архивного `state.json` (видео=0) реализованы `tools/android_synthetic_two_video_stop.ps1` и независимый `tools/test_android_synthetic_archive_force_stop.py` для безопасной проверки **внешнего синтетического** контейнера с **двумя различными тестовыми blob**. Содержание blob искусственное и **не воспроизводимый MP4**; `appExportWithVideosTested=false`, `indexedDbRestoreTested=false`. Не выдавать PASS внешнего контейнера за проверку оригиналов в IndexedDB.
- Windows-скрипт: проверяет одно USB-устройство NE2213/API36 и точный `ru.paseka.journal.archive.test`, изготавливает уникальный PASEKA01 с двумя разными SHA до передачи, создаёт *новую* выделенную подпапку `Download/Пасека/isolated-archive-synthetic-tests/<GUID>` (существующие шесть архивов не трогает), проверяет SHA на Android до/после `am force-stop` и после перезапуска исключительно тестового пакета; временные файлы только на ПК удаляются, тестовый файл на Android **сохраняется** и его путь фиксируется.
- Тесты: `tests/test_android_synthetic_archive_force_stop.py` — 7 Python unittest (мульти-устройства, SHA до/после stop, ошибки повторного запуска, вредные операции), `tests/test_android_two_video_stop_mock.sh` — PowerShell через mock ADB, проверка стоп/перезапуск, двух устройств и изменения файла. CI по `b91d48a3bcada19ee4f275f0154ed20128e1b1e3`: **SUCCESS** профильной проверки (9+7 Python, PowerShell parser + mocks). Промежуточные версии падали на shadowing функции `Adb` и зарезервированной PowerShell `$PID`, исправлено, результаты сохранены в истории. На реальном Windows новый скрипт пока **NOT TESTED**.
- Этап физического теста нового синтетического внешнего файла ещё **NOT TESTED**, требует ровно одного запуска пользователя на ПК. Скрипт **останавливает и перезапускает тестовое приложение**, но не очищает IndexedDB и не меняет старые файлы. Не запускать при незавершённых операциях в тестовом пакете.
- Следующий независимый приоритет после внешнего теста: безопасная возможность заполнить `entrance_media` на *изолированном* Android двумя синтетическими действительно декодируемыми видео, проверить независимый SHA до экспорта и результат app-export/IndexedDB после stop; пока нет подтверждения реализации. Никакого auto-video-cleanup, merge/main/production/publish.

## 2026-11-21 — физический Windows/OnePlus Android 16: PASEKA01 full structural verification PASS (без видео)

- Пользователь успешно повторно выполнил закреплённый `tools/android_paseka02_preflight.ps1 -VerifyContents` на физическом OnePlus NE2213, Android 16/API36 через Windows PowerShell/ADB. **Фактический статус: `ARCHIVE_STRUCTURE_VERIFIED`**. `ARCHIVE_MANIFEST: PASS | entries=1 | schema=15`; `ARCHIVE_CHUNKS_SHA256: PASS | verified entries=1`; `ARCHIVE_STATE_WRAPPER: PASS`; `ARCHIVE_VIDEO_ENTRIES: 0`. `paseka-full-backup-2026-11-21.paseka`, 5124 байта, `PASEKA01`. Двойной SHA-256 Android и локальная сверка: `6541855ff07478159320ea07aab868559f7099ba15606ad8108752637ee281cc`.
- Это **PASS** на целостность контейнера относительно его manifest/hash и на чтение JSON оболочки `state.json`, но **не** на бизнес-валидацию состояния, происхождение записи до экспорта, восстановление IndexedDB, две оригинальные видеозаписи или внешние Android Camera/MediaStore копии. Поскольку в этом архиве **0 видео**, запрещено выдавать его за испытание video retention; auto-delete **DISABLED**.
- Во время теста телефон, установленный APK, IndexedDB, существующие архивы не изменялись, `force-stop`/restore не выполнялись. По отчёту скрипта временная локальная копия удалена; это пользовательский отчёт, не независимый осмотр файловой системы ПК.
- Следующий безопасный автономный этап: отдельно подтвердить provenance **двух синтетических video blob в isolated package**, независимые SHA исходников до экспорта и возможность нового экспорта без вмешательства в существующие файлы; затем выполнить one-command ADB проверку каждого видео и локальной базы после остановки. Не импортировать прежние файлы неизвестного происхождения и не переименовывать PASEKA01 в PASEKA02. Ни один из этих пунктов пока не пройден.
- Текущий Draft PR #324; работа в рабочей ветке, без merge/main/production/deploy. Верификация CI должна относиться к текущему HEAD.

## 2026-11-21 — физический Android 16: WinPS5.1 ошибочно трактовал прогресс adb pull как ошибку

- Пользователь выполнил `-VerifyContents` для `paseka-full-backup-2026-11-21.paseka` (5124 B, SHA `6541855ff07478159320ea07aab868559f7099ba15606ad8108752637ee281cc`). Фактически `DEVICE: NE2213`, `PACKAGE: ...archive.test INSTALLED`, 6 файлов в каталоге, затем `STATUS: BLOCKED`, `DETAIL: Read-only preflight failed: 5 KB/s (5124 bytes in 1.000s)`. Строка прогресса ADB при `pull` выводится через stderr, а Windows PowerShell 5.1 с `ErrorActionPreference=Stop` превращает её в завершающую ошибку; **это не свидетельствует о повреждении архива**. Проверка manifest/chunks не была выполнена.
- В `tools/android_paseka02_preflight.ps1` для единственного вызова `adb -d pull` временно задаётся `ErrorActionPreference=Continue` и подавляется только диагностический вывод; **код выхода ADB проверяется обязательно**, затем проверяются существование, размер, локальный SHA и все внутренние chunk SHA. После вызова прежняя политика PowerShell восстанавливается. Никакой Android файл не удалён/изменён; локальная временная копия очищается скриптом.
- В `tests/test_android_preflight_mock.sh` реальный симптом воспроизведён имитацией прогресса `5 KB/s (5124 bytes in 1.000s)` через stderr при успешном `adb pull`; дополнительно регрессия проверяет, что `pull` с stderr и **exit 17** остаётся `BLOCKED`. Профильный CI на SHA `ffc5414610c1683f7c4cb8077181d5be6a40854b` — **SUCCESS** (run #44931532768), включая предыдущие ADB/PowerShell/видео integrity mocks. GitHub Actions использует PowerShell 7/Linux; отдельный реальный Windows PowerShell 5.1 запуск исправленного сценария **NOT TESTED** до сообщения пользователя.
- Следующий единственный шаг пользователя: закреплённый SHA `-VerifyContents` на Windows, один итоговый отчёт. Независимый исходный digest до экспорта, реальное содержание/происхождение видео, restore и IndexedDB **NOT TESTED**. Приложение не переустанавливать. Нет force-stop, restore, удаления, merge/deploy/production.

## 2026-11-21 — Android 16 новый PASEKA01 5124 B: двойной SHA PASS, углублённая проверка подготовлена

- **Реальный результат пользователя**: на OnePlus NE2213 Android 16/API36 установлен и доступен `ru.paseka.journal.archive.test`; единственный новый архив `paseka-full-backup-2026-11-21.paseka`, `PASEKA01`, 5124 байта, SHA-256 `6541855ff07478159320ea07aab868559f7099ba15606ad8108752637ee281cc`. Два чтения `sha256sum` совпали, `STATUS: EXPORT_CHECK_COMPLETE`. **Этот результат не проверяет manifest, chunk SHA, состояние IndexedDB, оригинальные видео или восстановление**; без изменения исходного файла.
- В `tools/android_paseka02_preflight.ps1` добавлен `-VerifyContents`: read-only preflight, SHA Android дважды, одна однозначная дата/путь, временная копия на **локальный ПК** только для файла до 16 МиБ, совпадение локального SHA с Android, структурная валидация `PASEKA01` manifest/state/всех SHA-256 чанков и count видеовложений. Локальная временная копия удаляется только из самостоятельно созданного scratch; никакие Android файлы/IndexedDB не меняются и никуда не отправляются. Ограничения `NOT TESTED`: реальное Windows выполнение, restore, наличие двух видео и внешние копии; не включать очистку видео.
- `tests/test_android_preflight_mock.sh`: два искусственных video blob, честный manifest/chunk SHA, проверка отказа при намеренной порче байта и неоднозначном выборе нового архива, `pidof` запрещён; профильный CI на `e987bb64fd83f4226cc2b254a0d27cbeb7cc2769` **SUCCESS** (run #44931246664) с 9 Python unittest и PowerShell syntax. Более ранние попытки проваливались из-за `$env:TEMP` в Linux и авто-конвертации JSON времени PowerShell; исправлено, ошибок не маскировать.
- Следующий единственный шаг пользователя: запустить закреплённый SHA `-VerifyContents` на его Windows ПК, прислать один отчёт. Файл/пакет переустанавливать не нужно. Не проводить `force-stop` или restore до более строгой проверки происхождения тестовых данных. `main` не изменён, PR остаётся Draft, нет merge/deploy.

## 2026-11-21 — физический ADB новый экспорт BLOCKED по ненужному pidof

- Пользователь запустил pinned PowerShell `-CheckNewExport` на OnePlus NE2213 Android16/API36. Наблюдение: `PACKAGE ... INSTALLED`, затем `STATUS: BLOCKED`, `DETAIL: Process state could not be determined cleanly`. **Новый архив ещё не проверялся**: сценарий блокировался до чтения каталога из-за `pidof`. Нельзя считать это отказом или повреждением архива.
- Исправлено в `tools/android_paseka02_preflight.ps1`: при `-CheckNewExport` **вообще не выполнять `pidof`**, поскольку read-only проверка существующего файла не требует живого процесса. Остальные режимы сохраняют проверку, дополнительно принимают пустой нормальный результат `pidof` при кодах 0/1 как `STOPPED`. Не запускать приложение, не делать `force-stop`.
- `tests/test_android_preflight_mock.sh` теперь специально выдаёт ошибку 42 на `pidof`; успешное прохождение экспортного теста доказывает, что скрипт не обращался к состоянию процесса. Сохранён негативный тест на два архива с одной датой. Перед передачей команды проверить CI на последнем SHA. Все тесты реального содержимого, manifest/chunk SHA, IndexedDB и двух видео по-прежнему `NOT TESTED`. Архивы и реальные данные не менялись.

## 2026-11-21 — однокомандная физическая read-only проверка нового экспорта PASEKA01

- Пользователь сообщил: на физическом OnePlus NE2213/Android 16 изолированное приложение показало **«архив сохранён»** после выбора полного архива. Это проверка UI, не содержимого файла.
- В `tools/android_paseka02_preflight.ps1` добавлен `-CheckNewExport`: стандартный preflight, строго один кандидат только `paseka-full-backup-2026-11-21[ (N)].paseka`, затем регулярный файл, размер, `PASEKA01` и две read-only проверки SHA-256. Никакого импорта, видео-очистки, `force-stop` или копирования. При нуле/множестве совпадений/ошибке — fail-closed.
- `tests/test_android_preflight_mock.sh` имитирует ADB для позитивного чтения и двух одноимённых новых архивов (обязательная блокировка). Профильный CI на code SHA `939c2e5ab9bccbecfd51425de2ea8e19853d38fb`: **SUCCESS**, включая 9 Python unittest, PowerShell parser, регрессию автоматической `$Matches` и новый mock test. Android-сборки на этом SHA проверяются отдельно. Дополнение протокола: `docs/ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md`.
- Следующая операция требует **одного** запуска пользователем этого скрипта на Windows; без новых разрешений на удаление. `SHA twice PASS` означает только стабильность того же сохранённого файла, **НЕ** независимую проверку исходного Blob, содержимое, два видео или восстановление IndexedDB. Эти проверки по-прежнему `NOT TESTED`.
- Ветки Draft, `main` не изменять, merge/deploy/production и автоудаление видео запрещены.

## 2026-11-21 — обязательная автономность всех испытаний на Android/ПК; экспорт подтверждён пользователем

- Пользователь потребовал закрепить постоянное правило: физические испытания на телефоне/ПК **максимально автономны**, **минимум действий пользователя**, единый предварительно проверенный безопасный сценарий, один запуск и единый итоговый отчёт; отдельное подтверждение только для рискованных действий. Правило добавлено в `AGENTS.md` и `docs/ПРАВИЛА-РАЗРАБОТКИ.md`.
- Пользователь сообщил, что нажал «Скачать полный архив .paseka» в изолированном приложении и получил «архив сохранён». Это **фактическое сообщение об успешном экспорте с экрана телефона**, но SHA, содержимое, число видео, уникальность файла и состояние IndexedDB пока **NOT TESTED**. Экспорт текущей версии использует штатный заголовок `PASEKA01`. Внешние ранее найденные пять файлов не удалять и не модифицировать. Не заявлять `PASEKA02`.
- CI на предыдущем HEAD `bca92efd163ebaf3cb2df9725b9ab77652236ab8`: проверки ADB и две Android-сборки **SUCCESS**. После изменения правил текущий HEAD другой; не переносить результат CI на него автоматически.
- Следующий автономный этап: безопасно выявить **новый экспорт** только по read-only признакам (путь, дата, размер, digest), не считать существующие файлы синтетическими без provenance; подготовить один скрипт контроля без удаления/перезаписи/force-stop до наличия независимого исходного эталона. Обязательная раздельная фиксация `PASS/FAIL/BLOCKED/NOT TESTED`. Main, production, merge/deploy не затрагивать.

## 2026-11-21 — физический Android: 5/5 PASEKA01, ошибка счётчика, невозможность теста PASEKA02

- Пользователь на OnePlus NE2213 (Android 16/API36) реально выполнил `tools/android_paseka02_preflight.ps1 -InspectHeaders`. Пять найденных архивов: `paseka-full-backup-2026-11-18.paseka` (3 186 095 B), `2026-11-19` (3 194 774 B), `2081-09-01` (1256 B), `2087-03-08` (1256 B), `2094-07-13` (1256 B). Все пять `header=PASEKA01`; ни один не имеет `PASEKA02`. Их происхождение, содержимое, видео и целостность **не установлены**. Не изменять ни один файл.
- Строка `PASEKA02_HEADERS: 0 of 1` — подтверждённый баг статистики preflight: PowerShell автоматически присваивает `$Matches` при `-match/-notmatch`, перезаписав массив `$matches` до итогового подсчёта. В `tools/android_paseka02_preflight.ps1` массив переименован в `$archiveFiles`, CI добавлена регрессия против `$matches.Count`.
- Самый важный факт: `js/paseka-archive.js` на рабочей Draft-ветке задаёт `MAGIC_TEXT = 'PASEKA01'` и `VERSION = 1`; функция `downloadFullArchive` в `index.html` использует именно `PasekaArchive.exportArchiveFromDatabase`. Поэтому PASEKA01 — **действительный формат текущей установленной APK**. Текущий `tools/check_android_archive_after_stop.py` требует PASEKA02 и не подходит. Не изменять формат без безопасной миграции/совместимости.
- В `docs/ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md` добавлена явная поправка: старый план PASEKA02 на установленной версии невыполним; нужен отдельный проверенный синтетический PASEKA01 и его независимый исходный SHA перед физическими test A/B/C. Видео, IndexedDB после stop, импорт и автоматическая очистка **NOT TESTED** / **DISABLED**.
- GitHub CI по новым коммитам проверяется на точном HEAD; физический Windows запуск исправленного счётчика ещё НЕ подтверждён. Изолированный APK переустанавливать не нужно только ради новой диагностической утилиты. Merge/deploy не разрешены.

## 2026-11-21 — результат физического Windows ADB preflight: 5 файлов, формат пока не подтверждён

- Пользователь выполнил `tools/android_paseka02_preflight.ps1` на Windows/OnePlus NE2213: `DEVICE: NE2213 | Android 16 | API 36`, `PACKAGE: ru.paseka.journal.archive.test | INSTALLED`, `PROCESS: RUNNING`, `ARCHIVE_DIRECTORY: ACCESSIBLE; matching filenames: 5`, `STATUS: PREFLIGHT_COMPLETE`. По этой проверке **нет доказательств, что какие-либо из пяти файлов являются PASEKA02**; проверка даже не читала заголовки.
- Чтобы не просить пользователя вводить отдельные команды по каждому файлу, PowerShell `tools/android_paseka02_preflight.ps1` дополнен параметром `-InspectHeaders`: после повторной проверки устройства читает только первые 8 байт и размеры файлов из разрешённой папки, строго по whitelist имён и максимум 20. Не читает пользовательские видео/IndexedDB, не останавливает приложение, не удаляет и не восстанавливает архивы; **тест целостности A/B/C не выполнен**.
- Обновлён `docs/ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md`, ожидается CI для PowerShell syntax и Python mocks на актуальном SHA. Перед запуском дать пользователю одно вставляемое выражение PowerShell с **зафиксированным SHA** скрипта и запросить только вывод. Не выполнять `force-stop` или восстановление на неизвестном архиве. Реальные и синтетические исходники не изменены.

## 2026-11-21 — физический Android запущен; одно действие вместо ручной серии ADB

- Пользователь на Windows подтвердил установку изолированного APK (`adb -d install` → `Success`), `adb -d shell pm path ru.paseka.journal.archive.test` → точный пакет обнаружен, `adb -d shell monkey -p ru.paseka.journal.archive.test -c android.intent.category.LAUNCHER 1` → `Events injected: 1`; пользователь наблюдал открытую главную страницу. Это **реальная проверка установки и запуска** на OnePlus NE2213/Android 16, но **НЕ** проверка IndexedDB/видеорезервного архива.
- Для минимизации действий добавлен `tools/android_paseka02_preflight.ps1`: единый read-only Windows preflight, ADB device count / API / package / process / список **имён** возможных архивов. Синтетический PASEKA02 не создаётся и не верифицируется, файл/DB не читаются, приложения не останавливаются, фото/видео не удаляются. В `docs/ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md` размещён однокомандный пример со ссылкой, закрепляемой на SHA.
- Настоящие тесты PASEKA02 A/B/C по-прежнему **NOT TESTED**. Следующие шаги: исполнить read-only preflight одним вводом на ПК пользователя, затем только после проверки исходных synthetic video SHA выполнять физический архивный тест; никакого удаления видео/merge/deploy/production.
- В данном сеансе PowerShell на физическом Windows ПК не доступен агенту, поэтому выполнение `.ps1` на Windows остаётся **NOT TESTED** до отчёта пользователя; наличие ADB и доступность GitHub подтверждены косвенно предыдущими командами пользователя.

## 2026-11-21 — Android 16 физическое устройство подключено; isolated APK CI разблокирован

- Пользователь подтвердил реальное USB ADB соединение: `adb devices -l` возвращает **одно устройство** `model:NE2213`, статус `device`. Android release **16**, SDK **36**. `adb shell pm list packages | findstr /i paseka` не вернул установленных пакетов с именем paseka. Эти команды выполнены **пользователем на своём ПК**; удалённого доступа агента к USB/ADB нет. Идентификатор устройства не публиковать в журналах.
- Последний проверенный общий APK на `f85589fab60a6322b72cc7bde6f24a4a165c347f`: GitHub Actions #44926345429 SUCCESS; профильные Python tests #44926345506 SUCCESS. Изолированный APK #44926345507 был SKIPPED, потому что workflow разрешал только ветку `test/full-archive-android-isolated-2026-11-18`.
- В `.github/workflows/android-archive-test.yml` разрешена ровно текущая Draft-ветка `test/android-archive-external-stop` как дополнительная; генерация изолированного `ru.paseka.journal.archive.test` выполняется временной правкой конфигурации **только на CI runner**, с обязательной проверкой `aapt` package ID до публикации artifact. Старый `scripts/prepare-archive-test-config.mjs` отсутствует в этой ветке, поэтому для неё использована встроенная строго проверенная настройка; `capacitor.config.json` в Git не менялся. Не считать изолированный APK собранным до SUCCESS на точном SHA.
- После получения и проверки изолированного APK потребуется его установка пользователем через локальный ADB в Windows, затем строго синтетический `PASEKA02` и физические тесты A/B/C по `docs/ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md`. **Без удаления видео, изменений production, main, merge, publish**. Реальное физическое испытание ещё NOT TESTED.

## 2026-11-21 — готовность к физическому Android-тесту PASEKA02 (Draft #324)

- На предыдущем SHA `57491336bcbe7ccbb3e7bea50cdf69b1dd92d4c3` GitHub Actions: профильная проверка внешнего архива **SUCCESS** (run 44925388915), обычная сборка Android **SUCCESS** (run 44925388858); изолированный Android archive test APK **SKIPPED** (run 44925388869). Это не означает, что изолированный тестовый APK собран.
- Подготовлен `docs/ANDROID-PASEKA02-PHYSICAL-TEST-PROTOCOL.md`: предварительные условия, тест одного внешнего PASEKA02 до/после `force-stop`, ручная сверка IndexedDB и обоих синтетических оригиналов после перезапуска, отдельный аудит внешних Android копий, критерии PASS/FAIL/NOT TESTED. Нет проверки реального телефона.
- В `tests/test_android_archive_after_stop.py` добавлены ещё 2 негативные/интеграционные проверки: оболочка ADB должна использовать только USB (`adb -d`) и корректно цитировать имя с пробелом и кириллицей; диагностический `stderr` после остановки не является успехом. Всего теперь 9 Python unittest; **CI для этих новых тестов ожидает проверки на конечном SHA**.
- Среда выполнения не имеет утилиты `adb` и USB passthrough (`ADB_NOT_INSTALLED`, `USB_DEVICE_PASSTHROUGH_UNAVAILABLE`); поэтому физический Android тест **BLOCKED**, не запускался. Пользовательские видео и рабочая IndexedDB не изменены. **Никакого автоматического удаления, merge, публикации, production deployment**.
- Следующая контрольная точка: CI новых тестов/обычной Android-сборки на текущем SHA, получение изолированного тестового APK и доступ к физическому Android; только затем выполнение A/B/C по протоколу. Не считать обычный APK заменой изолированному.

## 2026-11-21 — усиление fail-closed проверки внешнего Android-архива (PR #324)

- В существующей Draft-ветке #324 добавлены 3 группы негативных Python unittest: неправильная дата/хеш без обращения к ADB; некорректный pidof или диагностический stderr до остановки; отсутствующий или изменённый SHA после force-stop без ложного успеха.
- `tools/check_android_archive_after_stop.py` теперь отклоняет ненулевой код **или непустой stderr** любой обязательной ADB shell-команды, включая исходный pidof: ошибка не может трактоваться как чистая проверка перед остановкой тестового приложения.
- Изменены только `tools/check_android_archive_after_stop.py`, `tests/test_android_archive_after_stop.py` и проектная документация. На этой контрольной точке новая CI ещё не подтверждена; результаты для предыдущего SHA #324 не распространяются на изменения.
- Сохраняются ограничения: тестовый пакет `ru.paseka.journal.archive.test`, внешний синтетический PASEKA02, без удаления/перезаписи, без доступа к рабочим видео; не проверены физический Android, восстановление IndexedDB, реальный экспорт и все внешние MediaStore-копии. Следующий шаг — проверить CI на точном новом HEAD и затем провести отдельное испытание на физическом устройстве. Merge/deploy не разрешены.

## 2026-11-21 — проверка внешнего PASEKA02 при остановке Android-приложения

На базе архивного Draft #323 добавлен tools/check_android_archive_after_stop.py для проверки одного ранее сохранённого синтетического архива в Download/Пасека. Проверяются заголовок и заранее известный SHA-256 до и после am force-stop только пакета ru.paseka.journal.archive.test. Скрипт сохраняет файл на телефоне и не читает другие архивы. Четыре теста с имитацией ADB и 1215 JS-тестов прошли. Физического телефона и ADB в рабочей среде нет; запуск на устройстве, восстановление IndexedDB после остановки процесса и сохранность реальной загрузки остаются непроверенными.

## 2026-11-21 — повтор финальной записи PASEKA02 после отмены транзакции

Архивная цепочка #309–#317, база cd5167a548a97cf6fc8a22151098264b2744458d. В tests/video-archive-v2-entrance-atomic.test.mjs добавлены пять проверок отмены при успешном запросе записи rollback-снимка, архивной истории, текущего состояния, первого и второго летковых оригиналов. После повторного открытия изолированной IndexedDB журнал, запись распознанного видео с меткой удаления, история подготовки и байты обоих защищённых оригиналов сохранились. Частичных активных видео и снимков отката нет. Повтор записывает оба видео с ожидаемыми SHA-256 и один снимок; повторное применение блокируется. Все 22 профильных и 1215 общих тестов прошли локально. Код приложения, схема и реальные данные не затрагивались. Остаётся проверка на физическом Android при завершении процесса, включая сохранность архива вне IndexedDB. Отдельная исследовательская цепочка #322 ведёт аудит источников Apis mellifera.

## 2026-11-21 — проверка возможных переименованных оригиналов по SHA (stacked после Draft #316)

- В отдельной ветке `test/video-inventory-hash-alias-evidence-2026-11-21` (base Draft #316) усовершенствован строго read-only `js/video-archive-v2-copy-inventory.js`: если уже распознанный источник по достоверно структурированной записи ledger имеет SHA-256 и положительный размер, а другая управляемая копия с **другим source/videoId** указывает ту же пару SHA+bytes, журнал аудита ставит флаги `possible_recognized_original_hash_alias` и для deleted tombstone `possible_deleted_tombstone_hash_alias`.
- Совпадение **хеш-метаданных** не является повторной проверкой видеобайтов и не подтверждает общий источник. `cleanupAuthorized`, `byteIntegrityVerified`, `externalCopiesVerified`, `auditComplete` остаются **false**; пользовательские Blob и PASEKA01/02 protected copies не меняются. Если ledger невалиден, алиас не объявляется достоверно распознанным и отчёт всё равно fail-closed.
- Добавлены 6 новых регрессий в `tests/video-archive-v2-copy-inventory.test.mjs` (renamed entrance, cross-source journal, different size, same ID, invalid ledger, protected backup) и бесплатный CI `test-video-copy-hash-alias.yml`. Следующий шаг: профильный и полный regression CI на точном HEAD, после чего отдельная физическая проверка внешних Android копий; не включать cleanup, не merge/deploy.

## 2026-11-21 — контроль CI Android video external copy disclosure (Draft #316)

- Видео через `<input type=file>` не доказывает исключительное владение приложением и отсутствие оригинала в Gallery/Camera/Downloads. В двух UI путях добавлены предупреждения и 6 статических регрессионных тестов, без доступа к внешним файлам и без включения удаления.
- Первый профильный CI #44914199119: **FAILURE 5/6** — тест неверно ожидал прямое `copyFile("index.html")`, хотя скрипт `prepare-web.mjs` копирует HTML в цикле. Вторая попытка #44914256600: **FAILURE до запуска тестов** — ошибка чрезмерного экранирования регулярного выражения теста. Исправлено проверкой литералов, без изменений runtime. На SHA `fe39afb93e556757b9d481291b493dcc359bd4d2` профильный GitHub Actions #44914314990: **SUCCESS 6/6**. Android workflow #44914315307 выполняется на этом SHA; повторная проверка потребуется на последнем docs SHA.
- Следующая работа: физический Android test matrix с явным согласием владельца на проверку Camera/Gallery/Downloads и без удаления исходников; пока эти проверки недоступны, сохранять fail-closed политику очистки.

## 2026-11-21 — Android video capture/picker: external-copy disclosure (Draft, поверх #315)

- На актуальном коде проверено: `index.html` использует `<input type="file" accept="video/*" capture="environment">` для леткового видео и видео осмотров, плюс `rmedia` для выбора файлов. Видео создаётся/выбирается через системный механизм, но происхождение Camera/Gallery/MediaStore/Downloads **не доказано**. `capacitor.config.json` содержит WebView wrapper, `scripts/prepare-web.mjs` копирует HTML в Android bundle; нативный Android manifest не хранится в этой ветке и генерируется при CI.
- Безопасная минимальная правка только UI: предупреждение рядом с двумя путями видео, что штатная камера может оставить внешнюю копию, а выбранный из Галереи/Downloads оригинал не является собственностью приложения; очистка внешних копий не поддержана и автоматическое удаление всё ещё отключено.
- Новый `tests/video-external-copy-boundary.test.mjs`: 6 синтетических/static guard tests на оба file inputs, связь с Android web prepare, обязательные предупреждения, и блокировку `deleteEntranceVideoBlob`. Добавлен бесплатный профильный workflow `test-android-video-external-copy-boundary.yml`.
- Не добавлялись `MediaStore` permissions, native bridge, удаление, IndexedDB migrations, Android публикация. Не утверждать, что удалён файл из Gallery/Camera/Downloads, пока не подтверждены физическая трассировка и безопасный протокол.
- Следующий шаг: проверить CI на итоговом SHA, затем подготовить контролируемую физическую Android матрицу: capture без сохранения в системную галерею; capture с копией; pick существующего файла; reboot/crash/offline; проверка внешних копий только с разрешением владельца и без их удаления.

## 2026-11-21 — дополнительная гонка V2 в финальной транзакции PASEKA01

- В Draft #315 добавлен тест `legacy final writer aborts if V2 staging appears inside same atomic transaction`: V2 marker появляется в `archive_staging` прямо под PASEKA01 final `readwrite` lock. Операция обязана получить `VIDEO_LEGACY_RESTORE_V2_PROTECTED`, полностью откатить саму конкурентную запись и не менять `main`, оригинальные видео, full_backup и архивную историю. На code/test SHA `38168ff9655682b8a0c4259fed030dcb38152720` специализированный workflow #44911233954 **SUCCESS 65/65**, включая этот тест. Нужна отдельная проверка на текущем конечном документационном SHA и Android; физический Android и реальные видео не испытывались. Следующая задача: проверка прерывания и сохранности на физическом устройстве, после стабильной CI; не включать автоматическую очистку.

## 2026-11-21 — PASEKA01: final atomic commit и rollback защищены от позднего PASEKA02

- Продолжена stacked цепочка Draft #314 новым Draft #315: обнаружен пропуск в `commitStagedArchive` — ранее V2 protected records проверялись на этапе PASEKA01 staging, но **не** перед финальным commit. Новый `tests/archive-staging.test.mjs` воспроизводит PASEKA01 ready, затем protected V2 full_backup/staging/history, после чего commit обязан abort. В `js/paseka-archive-restore.js` final readwrite-транзакция в составе пяти stores теперь читает все protected markers и fail-closed с `VIDEO_LEGACY_RESTORE_V2_PROTECTED`; без асинхронного I/O в write lock.
- Аналогичный порядок проверяется для `rollbackCommittedArchive`: старый PASEKA01 уже импортирован, после него появляется защищённый V2 quarantine, затем попытка rollback. Добавлена предварительная проверка через `assertLegacyArchiveStageAllowed` и повторная проверка в его финальном writer-lock; никакие видеобайты, журнал и full_backup не переписываются при отказе.
- Новые тесты: один late protected snapshot commit, 3 отдельных варианта staged/history/rollback marker после ready stage и один legacy rollback против V2 backup. Новый бесплатный CI `.github/workflows/test-legacy-commit-v2-guard.yml` с `node --test tests/archive-staging.test.mjs`.
- На кодовом SHA `4d8c00be51073a3d46be03711595b07e06aad8ec` специализированный CI #44911031263 SUCCESS: 63/63 теста — **до** последней rollback-правки. На финальном SHA требуется повторное подтверждение тестов и Android. Нет миграций, физического Android, удаления пользовательских видео, merge/deploy. Следующий шаг: проверить CI итогового SHA, расширить гонки recognition-ledger при final writer lock только при выявлении конкретного пробела.

## 2026-11-21 — устранён реальный обход PASEKA01 при утраченном ledger и защищённом PASEKA02

- После двух успешных binary PASEKA01↔PASEKA02 tests (28/28) добавлен негативный тест: quarantine PASEKA02 сохраняет исходный Blob в `full_backup`, затем локальный `video_recognition_ledger_v1` пропадает, и старый PASEKA01 не должен подготовить оригинал к восстановлению. Тест на SHA `053a9b089237954d221d45681b4c7dab8d91013d` **выявил реальный обход**: workflow #44910308782 FAILURE (28 pass, 1 fail — ожидаемого отказа нет). Не объявлять этот SHA безопасным.
- Исправлен `js/paseka-archive-restore.js`: `assertLegacyArchiveStageAllowed` теперь в одном согласованном read-only snapshot читает ledger, ключи `archive_staging`, v2 history и ключи protected `full_backup`. Если есть `v2pending:`, history.kind `v2_*` или `v2entrance:`, PASEKA01 возвращает `VIDEO_LEGACY_RESTORE_V2_PROTECTED`, в том числе при отсутствующем ledger. На старой **нетронутой** базе без защищённых V2 данных совместимость сохраняется.
- Чтобы не было гонки между async preflight и первой записью, непосредственно в финальной readwrite-транзакции подготовки PASEKA01 повторяются все эти чтения под общей блокировкой `main/entrance_media/archive_staging/archive_history/full_backup`. Это не меняет формат PASEKA01 и не включает реальный restore/delete.
- Добавлены 3 теста одиночных защищённых V2 stores и writer-lock race test в `tests/archive-staging.test.mjs`; один cross-version regression в `tests/video-archive-v2-entrance-quarantine-rollback.test.mjs`. Исправленный code/test SHA `979d781a0249518fc18076a4b0b09d2f71aaed44`: [CI legacy #44910485663](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44910485663) **29/29 SUCCESS** и [quarantine #44910485640](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44910485640) **46/46 SUCCESS**. Полная regression и Android на этом SHA проверяются отдельно.
- Нет миграций, удаления оригинальных видео, изменения main, merge или production. Обязательная пользовательская политика: удаление только после доказанного распознавания и сохранения результата, с сохранением защищённого восстановления и проверкой внешних Android копий.
- Следующий шаг: CI полного приложения/Android на итоговом SHA документации, review итогового diff и дальнейшие независимые тесты гонок между old archive и durable ledger без активации реальной очистки.

## 2026-11-21 — PASEKA01 binary после карантинного отката PASEKA02 (новый изолированный блок)

- В отдельной ветке `test/paseka01-after-v2-quarantine-e2e-2026-11-21` поверх Draft #313 добавлено два сквозных теста на **настоящем синтетическом бинарном PASEKA01** (формат `PasekaArchive.buildArchiveBlob` + `verifyArchive`), а не на имитации списка pending IDs. После PASEKA02 stage→atomic commit→quarantine rollback записывается durable tombstone успешного распознавания; после закрытия и повторного открытия fake-indexeddb PASEKA01 restore вызывает реальный `stageArchiveForRestore` и должен получить `VIDEO_LEDGER_NOT_PRESERVED`. Второй тест переименовывает старый оригинал при тех же байтах.
- Сохраняются SHA оригинала в `full_backup.quarantinedMedia`, ledger, `main`, `archive_staging`, `archive_history`; live `entrance_media` остаётся пустым. Это проверка **запрета** импорта старого архива, не доказательство безопасного восстановления совместимого архива и не разрешение cleanup. Реальный Android/MediaStore/Downloads пока не проверен.
- Изменён только `tests/video-archive-v2-entrance-quarantine-rollback.test.mjs` и контрольные документы; runtime и IndexedDB schema не менялись. Требуется CI на актуальном SHA, затем отдельная полная регрессия/Android Debug APK без merge/deploy.

## 2026-11-21 — итог цепочки PASEKA02 #312→#313 (проверенные SHA)

- Изолированный abort/reopen/retry сценарий quarantine и проверка old archive tombstone/alias оформлены в Draft #312. На code SHA `ea2242b6169bdfe7bfa3e3974ada36afeccecd58` профильный CI #44909522235: **37/37 SUCCESS**.
- В Draft #313 read-only `inspectQuarantine` усилен сверкой защищённых staged header/child против rollback snapshot; при повреждении report требует ручного разбора. На code/docs SHA `e8522d14318b0087545d87f8a16ca7d0d1dff717`: профильный CI #44909690616 **43/43 SUCCESS**, Android workflow #44909690601 **SUCCESS**, вся regression suite **1185/1185 SUCCESS**, Android Debug APK build/upload SUCCESS. Изолированная архивная APK-сборка #44909690602 **SKIPPED**; физический Android/power-loss, PASEKA01 сквозное восстановление и реальное удаление **не проверены**.
- Изменения только в stacked Draft-ветках, без merge/main/production; оригиналы и пользовательская IndexedDB не затронуты, автоматическое удаление видео не включено. Следующая задача: отдельная независимая PASEKA01↔PASEKA02 интеграционная проверка попытки восстановления старого видео после durable распознавания и защищённого карантина; затем реальный Android ручной сценарий после согласованной процедуры. Автоматический контроль писем авторам остаётся активен; отсутствие ответа не даёт прав на использование датасета.

## 2026-11-21 — PASEKA02 quarantine: read-only recovery must audit staging metadata

- После Draft #312 создана ветка `test/paseka02-quarantine-recovery-structural-audit-2026-11-21`. Выявлен неполный `inspectQuarantine`: после успешного изолированного quarantine rollback статус `reverted_quarantine_unverified` не проверял структуру ещё сохраняемого `archive_staging`, поэтому повреждение header/child могло оставаться неотмеченным. Теперь инспектор **только читает** и сопоставляет `backupId`, `archiveSha256`, `sessionId`, `entryIds`, `source`, `videoId`, `sourceSha256`, размеры и MIME с snapshot.importedVideos. Несоответствие → `manual_review_required`, никогда не cleanup/restore.
- Добавлены шесть регрессионных тестов: 4 варианта повреждения child, пропавшая запись и повреждение header. Существующий protected Blob в `full_backup`, ledger, current state и пройденный rollback сохраняются. SHA содержимого Blob не подтверждается этим readonly инспектором. Требуется CI на точном SHA, отдельная полная регрессия и Android сборка. Не активирована функция удаления, нет migration и production.

## 2026-11-21 — PASEKA02: old backup resurrection guards after quarantine

- В stacked Draft #312 после проверенного 4-point IndexedDB abort/reopen/retry добавлены три синтетических сквозных проверки существующего `checkRestoreLedgerCandidate` **после успешного карантинного отката**: (1) старый архив без нового tombstone получает `V2_RESTORE_LEDGER_HISTORY_LOST`; (2) архив с корректным durable ledger, но исходным pending payload получает `V2_RECOGNIZED_ORIGINAL_INCLUDED`; (3) переименованный Blob того же SHA получает `V2_RESTORE_RECOGNIZED_ORIGINAL`. Во всех случаях защищённый `full_backup` и digest оригинала сохраняются, live `entrance_media` пуст, пользовательские записи не изменяются.
- GitHub Actions специализированный workflow на code SHA `ea2242b6169bdfe7bfa3e3974ada36afeccecd58` SUCCESS 37/37 tests (run 44909522235); физический Android и PASEKA01-restore не проверяются этими тремя тестами. Следующий приоритет — stricter read-only `inspectQuarantine` для обнаружения повреждённого staging/header/history (без авто-delete) и полная regression/Android сборка на итоговом SHA.

## 2026-11-21 — PASEKA02: отмена quarantine rollback и повтор после перезапуска

- Продолжена цепочка Draft #311 в отдельной ветке `test/paseka02-quarantine-abort-reopen-2026-11-21`. Уже существующая `quarantineRollbackIsolated` (Draft #237) дополнена **только четырьмя регрессионными сценариями**, без нового runtime: прерывание IndexedDB после успешного `full_backup.put`, `archive_history.put`, `main.put` и `entrance_media.delete`; затем закрытие/reopen fake-indexeddb и проверка полной отмены изменений. Повторная попытка должна единожды перенести оригинал в защищённый quarantine, сохранив SHA и ledger; третья попытка запрещена.
- Добавлен CI `.github/workflows/test-paseka02-quarantine-abort.yml`, запускающий rollback и atomic-commit tests. Нужно сверить итоговый статус на точном SHA. Нет изменения схемы IndexedDB, рабочего интерфейса, пользовательских исходников, автоматического cleanup и production.
- Следующий шаг: интеграционный аудит возвращения старых видео из `PASEKA01` и tombstones после успешной quarantine, с проверками восстановления через реальный gate, не имитируя разрешения на cleanup.

## 2026-11-21 — ужесточён статус готовности SHA-аудита PASEKA02

При аудите найден риск ошибочного использования промежуточного `byteIntegrityVerified=true`: два последовательных read-only хеширования не удерживают writer-lock и не могут быть доказательством стабильности исходника к моменту commit. В новом API результат успешных повторных хешей выражается **только** `snapshotHashesMatched=true`, а `byteIntegrityVerified=false`, `restoreAuthorized=false`, `cleanupAuthorized=false` остаются неизменно. Два интеграционных теста и позитивный профильный тест обновлены. Требуется повторный CI на точном новом HEAD; прежний успешный 47/47 относится к более раннему SHA и не подтверждает эту правку. Схема/production/пользовательские оригиналы не изменены.

## 2026-11-21 — PASEKA02 staged SHA + независимый atomic commit gate

- Draft #311 обновлён: `verifyPendingStagingBlobs` повторно хеширует скопированный после первой проверки Blob и сопоставляет immutable metadata, чтобы обнаруживать конкурентную замену байт при том же размере/SHA-поле и изменения MIME. Диагностический результат не является разрешением на commit/delete.
- Добавлены ещё 2 теста в `tests/video-archive-v2-pending-stage.test.mjs` и 2 интеграционных сценария в `tests/video-archive-v2-entrance-atomic.test.mjs`: позитивная SHA-диагностика не обходит самостоятельную проверку при финальной атомарной записи; подмена staged Blob после диагностического успеха не достигает live `entrance_media` или backup. Ранее существующие isolated atomic commit/rollback из #236/#237 переиспользуются, не дублируются.
- Специализированный workflow `test-paseka02-pending-sha-integrity.yml` сначала завершился FAILURE **до запуска тестов** из-за неверного `setup-node` cache/отсутствующего lockfile; исправлен на `npm install --no-save --package-lock=false`. На SHA `053f6bcc1748163b4e76d20fce5d059f0629d062` специализированный CI SUCCESS, в логе 30/30 профильных тестов. Новые интеграционные тесты и изменения документации требуют отдельной повторной проверки на их SHA. Android build на предшествующем SHA ещё выполнялся на момент фиксации.
- Схема IndexedDB, UI, оригиналы, ledger, PWA, production не менялись; автоудаление не включено. Следующий шаг: убедиться в прохождении новых интеграционных тестов и полном npm regression suite на актуальном SHA, затем аудит итогового diff, без merge/deployment.

## 2026-11-21 — PASEKA02: read-only SHA-256 подготовленных оригиналов

- Продолжение Draft #310 в ветке `test/paseka02-pending-blob-full-sha-2026-11-21`: добавлена `verifyPendingStagingBlobs(db, backupId, shaTool)`. Только после успешной структурной диагностики читает защищённые копии из `archive_staging`, потоково пересчитывает полный SHA-256 каждого Blob через существующий бесплатный `PasekaSha256`, отклоняет байтовую подмену при том же размере и проверяет метаданные/статус повторным read-only снимком. Результат диагностики **не является разрешением на восстановление**, потому что во время асинхронного хеширования возможны конкурирующие изменения. Перед финальным commit требуется отдельная повторная проверка в сериализованном writer-протоколе.
- В `tests/video-archive-v2-pending-stage.test.mjs` добавлены семь негативных/позитивных сценариев: корректный Blob, повреждение при том же размере, повреждение метаданных, конкурирующая запись, нечитаемый Blob, отсутствие сессии и отсутствие hash-зависимости. Предусмотрено только read-only чтение; ни исходный летковый Blob, ни ledger, ни full_backup не изменяются. Новых данных пользователей, удаления и миграций нет.
- Новый PR остаётся Draft; CI и Android на точном SHA проверять отдельно. Следующий шаг — проверить существующий commit-путь и добавить изолированную атомарную финальную транзакцию с прерываниями/откатом, но **не включать** runtime восстановление без самостоятельных доказательств.

## 2026-11-21 — PASEKA02: сверка полей дочерних записей перед финальной записью

Продолжение Draft #309 в отдельной ветке `test/paseka02-staged-child-metadata-integrity`. В `js/video-archive-v2-pending-stage.js` read-only инспектор подготовленной PASEKA02-сессии дополнительно получает строки через индекс `sessionId` и сопоставляет ключ каждой записи с её `source` и `videoId`, а также проверяет `kind`, формат SHA-256, положительный размер, соответствие Blob.size и MIME. Раньше проверялись лишь количество и ключи, поэтому повреждённые метаданные могли ошибочно классифицироваться как `protected_unverified`. Любое противоречие теперь ведёт к `manual_review_required`; проверка настоящего содержимого Blob по SHA остаётся отдельной обязательной операцией.

Добавлено 6 отрицательных регрессионных тестов в `tests/video-archive-v2-pending-stage.test.mjs`. Проверки GitHub CI требуют проверки на актуальном SHA; физический Android и восстановление пользовательского видео не проверялись. Изменение обратимо, без миграции, удаления видео, изменения runtime рабочего приложения, merge и production. Следующий шаг после CI: отдельная атомарная финальная запись PASEKA02 с прерыванием/повтором и тестами rollback, только после анализа существующего модуля commit.

## 2026-11-21 — PASEKA02 после прерывания подготовки восстановления

На базе Draft #308 проверена отмена общей транзакции после успешного add заголовка, оригинала и истории по отдельности. После повторного открытия изолированной IndexedDB частичных записей нет. Повтор сохраняет единственный комплект с проверяемым SHA; третья попытка блокируется. Журнал, реестр результатов и посторонний оригинал сохраняются. Исправлена диагностика повреждённого заголовка: ссылка на сам заголовок или видео другой сессии требует ручной проверки. Прежняя версия ошибочно возвращала protected_unverified в воспроизведённом тесте. Схема базы и формат архива прежние. На локальном дереве прошли 15 профильных проверок и весь набор из 1155 тестов. Следующая задача — проверить отмену и повтор финальной атомарной записи при восстановлении летковых видео с сохранением rollback, отдельно от подготовки. Эксперимент использует fake-indexeddb, физическое отключение питания Android не моделировалось.

## 2026-11-21 — совместная проверка архива и истории распознавания

На базе #307 в `tests/archive-staging.test.mjs` добавлен регрессионный сценарий с изолированной IndexedDB. До распознавания экспортирован и проверен по SHA-256 оригинал. После записи синтетического результата через модуль ledger проверена блокировка очистки. Для состояния с меткой удаления после повторного открытия базы инвентаризация различила четыре копии и две идентичности (леток и журнал с одинаковым ID). Старый архив отклонён до записи как при сохранившихся копиях, так и в отдельной базе без оригинала. Проверены журнал, защищённая резервная копия и rollback Blob. Локально прошли 1150 тестов. Следующий этап — проверить прерывание и повтор восстановления PASEKA02 на этой границе. Реальный Android, распознавание и физическое удаление не проверялись.

## 2026-11-21 — автоматический контроль ответа авторов и следующий безопасный аудит видео

- Создана активная ежедневная условная автоматизация ChatGPT для проверки Gmail-переписки от 21.11.2026 по Nieves-Rivera et al.; сообщает только при содержательном ответе. В AGENTS.md закреплена обязательная фиксация ответа и запрет считать молчание разрешением. Ответ пока не подтверждён.
- Следующий независимый этап выполнен как документационный аудит уже имеющихся Draft #168/#205/#213/#238/#241/#246/#249/#250: граница исходного видео, результатов распознавания, полной резервной копии, восстановления и Android-копий. Новый документ `docs/VIDEO-RETENTION-ARCHIVE-INTEGRATION-AUDIT-2026-11-21.md` фиксирует реальные зависимости и критерии будущих интеграционных тестов; runtime, схемы, оригиналы, main и production не изменялись.
- Следующий технический шаг — read-only межмодульный регрессионный аудит на объединённой тестовой базе без delete, предварительно проверить ancestry/archive-vs-ledger. CI на новом docs HEAD отдельно сверить; не заявлять о функциональной готовности.

## 2026-11-21 — сравнение явного списка событий между двумя авторскими CSV

- В PR #306 добавлена `audit_two_versions()` для явного списка 1194 `group_id`: отдельно анализирует оба варианта меток, проверяет совпадение `eventid` и `video`, считает расхождения отдельных меток и сохраняет все разрешающие флаги false. Совпадающие 1194/374 без совпадения индивидуальных классов не считаются воспроизведённой выборкой.
- Добавлено 7 синтетических тестов (итого 19), локально 19/19 passed. CI проверять на точном актуальном HEAD. Новых авторских файлов/прав не получено; исходные данные, пользовательские видео и runtime не менялись. Письмо авторам отправлено, ответа на момент проверки нет.
- Следующий шаг: дождаться авторского codebook, лицензии и проверяемого списка событий; затем применить новый аудит к оригинальным SHA-verified CSV. Никакого обучения, automatic cleanup или merge.

## 2026-11-21 — запрос подтверждения у авторов и CI

- Через Gmail отправлен адресный запрос двум контактным авторам публикации: лицензия CSV/кода/видео, codebook D/U/DU/UD, точный состав 1194 событий/374 compound, исходные видео и идентификаторы. Исходящий Gmail message id `1a1fe1f8adcaecba`; ответ на момент фиксации не подтверждён. Ни лицензия, ни состав эталона не объявляются установленными.
- Для исходного HEAD PR #306 `c827c2ccfc6630baca3485294ed1d903e81781b4` GitHub PR workflows: `Test explicit bee-event manifest guard` SUCCESS; `Build Android APK` SUCCESS; `Build isolated archive test APK` SKIPPED. Документационное обновление ниже создаёт новый HEAD: проверять CI на нём отдельно.
- Предельное условие: исходное видео не удалять автоматически до доказанного успешного распознавания и безопасного завершения записи результата; текущий исследовательский тест этого разрешения не даёт. Merge/deploy не выполнены.

## 2026-11-21 — fail-closed проверка явного списка событий (ветка поверх Draft #305)

- Добавлен `tools/audit_manual_event_manifest.py`: принимает только явный список 1194 уникальных `group_id` из уже проверенной таблицы, проверяет допустимость кодов D/U/DU/UD и сообщает число составных событий в сравнении с 374. Список **не изобретён и не включён в репозиторий**. Совпадение 1194/374 само по себе НЕ подтверждает подлинность авторского списка, лицензию, видео или физический вход/выход. Все разрешающие флаги строго false, включая `videoCleanupAuthorized`.
- 12 локальных синтетических unittest прошли, GitHub CI необходимо сверить на текущем HEAD. Новые файлы: `tools/audit_manual_event_manifest.py`, `tests/test_audit_manual_event_manifest.py`, `.github/workflows/test-bee-event-manifest-guard.yml`. Runtime, пользовательские файлы, IndexedDB, резервные копии и production не изменены.
- Следующий шаг: получить подтверждённый авторский список ID / критерий отбора, codebook, лицензию и источник видеобайтов; только затем выполнять независимую оценку. Ни merge, ни deployment не разрешены.

## 2026-11-21 — проверка выборки для независимой оценки входов и выходов

Статья (DOI 10.3390/informatics13050065, §3.5.2 и §4.2) задаёт две контрольные величины: 1194 события, из них 374 составных. Для двух SHA-проверенных таблиц ни исключение помеченных ошибок и неоднозначностей, ни согласие обеих версий не воспроизводит эти величины. Совпадают 1245 четырёхклассовых меток, включая 397 составных. Проверены 12 модульных тестов и обе оригинальные CSV. Исторический авторский notebook использует другую таблицу. Требуются авторский список идентификаторов, привязка к оригинальным видео и условия использования. Счётчик на устройстве и удаление видео не активированы. Подробности в `docs/VIDEO-EXTERNAL-MANUAL-BEE-EVENT-LABELS-RESEARCH.md`.

## 2026-11-21 — настоящий независимый источник ручных классов пчелиных событий: аудит двух CSV (Draft #303)

- От Draft #302 создана ветка `test/video-external-manual-event-source-audit-2026-11-21`; `main` не изменена. Найдена публикация Nieves-Rivera, Lluberes-Contreras, Mégret, *The Relevance of Compound Events in Bee Traffic Monitoring* (Informatics 2026, 13(5), 65, DOI `10.3390/informatics13050065`) и авторский публичный репозиторий `lablluberes/beeClassificationMethods` at immutable commit `295948bb398054684b7b92c18b7bb44ba37566af`. Исследователи пишут о 1194 вручную отобранных событиях (из 1421 кластеризованного), включая составные развороты; в фактических CSV **по 1422 строки**, и авторского правила отбора 1194 пока нет.
- Новый изолированный `tools/audit_public_bee_manual_event_tables.py`: только два внешних pinned CSV (159902 и 170808 байт), каждый проверен по Git blob identity и **фактическому SHA256** `8d5ef1db7e742849d018c79ab8ad27cf3828518750e68aacac22ee1bf2b70d07`, `51cbd31c6638dac8ebbc2b0069b441aec64bb5355edd52351ea70a45cecea059`; строгие 1422 уникальных ID, schema 17 колонок, 12 видеоимён. Старые события: D=552, U=339, DU=241, UD=200, x=90; в альтернативной таблице D=536, U=333, DU=248, UD=220, 85 пустых. **177 разных `event`** при тех же eventid/video по одинаковым group_id. Считать один CSV «финальной истиной» нельзя без авторского подтверждения.
- В этом внешнем репозитории **нет файла LICENSE**, GitHub API `license=null`; настоящие MP4 отсутствуют. Достоверность event codebook, права на перераспространение и исходные видеобайты **не подтверждены**. Поэтому обучение, выпуск модели, верификация счётчика и автоматическое удаление видео **не разрешены**. Только aggregate stats; авторские CSV и пользовательское видео в Git проекта не копируются.
- Код и тесты на SHA `0dc3ad6fb16f64ff3cdcbb6bd38c2c9b1eb5af50`: [специализированный CI #44889968741](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44889968741) **SUCCESS** (10 unit tests + настоящие два SHA-verified CSV и pinned aggregate checks), [Fast quality #44889968727](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44889968727) **SUCCESS**. Android Debug APK [#44889968711](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44889968711) на момент записи выполняется; не считать проверенным до окончательного состояния. Предыдущий specialized CI #44889922415 FAILURE из-за тестовой фикстуры с ненадёжным порядком полей; исправлено в #44889968741. Изолированное приложение/UI/IndexedDB/SW и source cleanup не менялись.
- Документ: `docs/VIDEO-EXTERNAL-MANUAL-BEE-EVENT-LABELS-RESEARCH.md`. **Следующий этап:** найти подтверждённый авторский codebook (`D/U/DU/UD`) и формальное правило отбора 1194, статус использования аннотаций, исходные MP4 с SHA; только затем real independent compound-event benchmark, впоследствии offline Android inference. Без этих доказательств статус blocked; не выдумывать разрешения/метрики.

---

## 2026-11-21 — опубликованный polygon ROI против реальных tracking ID: запрет ложного in/out (Draft #302)

- Стековая ветка `test/video-fan-zone-transition-ambiguity-2026-11-21` поверх Draft #301. Новый read-only модуль `tools/audit_public_fan_polygon_transitions.py` работает **только с SHA-проверенными оригинальными TXT** Mendeley v6 `tracks_20230711a-fan.txt` и `entrance_zone_20230711a-fan.txt`; MP4, пользовательские видео и модель не загружаются. Авторская зона **не** является подтверждённой физической линией входа.
- **Реальные результаты:** 6000 frame-id, 1674 GT track ID, 127452 bbox, 493 центра вне polygon, 124945 смежных сравнимых переходов; по GT track ID наблюдается **237 изменений принадлежности полигону** — 100 outside→inside, 137 inside→outside, у 128 ID. **43** быстрых обратных пересечения в ≤2 кадрах; **833** reappearance после пропуска кадров не считаются crossing. **Ни одно число НЕ является in/out пчелиным потоком**.
- На **workflow/code/test SHA `b7802e95b9b8dc83f21f19e947ce7c5945f0e329`** [GitHub Actions #44889290182](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44889290182) **SUCCESS**: 9 unit tests, реальные оригинальные TXT, pin истинных метрик, все safety flags false. Fast quality [#44889183425](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44889183425) и Android Debug APK [#44889183471](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44889183471) — SUCCESS на неизменённом code/test SHA `e0caae1b550542669f8d979d5a135b5ec89665df`. Изначальный workflow #44889193838 failure (invalid YAML, не было jobs) исправлен.
- Полное описание: `docs/VIDEO-PUBLIC-FAN-POLYGON-BOUNDARY-DIAGNOSTIC.md`; новые файлы script/test/workflow, существующая app runtime логика не тронута. `actualBeeTrafficCountValidated=false`, `beeRecognitionSucceeded=false`, `videoCleanupAuthorized=false`. Ни IndexedDB/backup/архивы, ни production не изменены. PR Draft, не merge.
- **Следующая задача:** найти доказанную физическую линию летка и independent in/out event labels, лицензированную специализированную detection model и реальный offline Android benchmark; только затем возможно безопасное доведение счётчика до продукта. Действие пользователя пока не требуется.

---

## 2026-11-21 — независимая перекрёстная сверка реальных разметок одного fan-клипа (следующий Draft PR)

- **Точный code/test SHA:** `4ad088cb462ab70fedbe93a848d884aea4804535`. Специализированный source-image/frame/YOLO аудит [GitHub Actions #44888737943](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44888737943) **SUCCESS**: 11 unit tests; оригинальный `20230711a-fan.mp4` (6000 кадров), tracking TXT и **12 оригинальных detection JPEG + 12 YOLO TXT**, каждый публичный исходник проверен по publisher SHA-256 и размеру. Fast quality [#44888737940](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44888737940) **SUCCESS**; Android Debug APK [#44888737962](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44888737962) **SUCCESS**. Сборка APK НЕ означает работающий Android inference на телефоне.
- Реальное наблюдение: из 12 пар **11 YOLO меток прошли строгую геометрию**, одна пара `20230711a10140.jpg/.txt` имеет опубликованную рамку вне изображения. **Файл и SHA издателя не исправлены**; ошибка отчётливо помечена, эта YOLO-пара исключена только из сравнения геометрии, все 12 JPEG остались в аудите сходства изображения. Изначальный CI #44888392743 корректно отклонил дефект источника, последующий скрипт ведёт раздельный отчёт без молчаливой порчи.
- Кандидаты видеокадров выбираются **только по яркости полного изображения, независимо от GT меток**, затем отдельно сопоставляются опубликованные detection YOLO bbox с tracking bbox при IoU>=0.5. `20230711a0.jpg` ↔ индекс MP4 **0**: **20 из 21** tracking bbox совпадают с YOLO, средний IoU совпавших ≈**0.886724**; `20230711a1020.jpg` ↔ индекс **1700**: **20 из 20**, mean IoU ≈**0.890072**. В остальных допустимых девяти JPEG на первом яркостном кандидате **суммарно 4 совпадения** (всего 44 в 11 проверенных парах). Это сильный **риск утечки train/test** при попытке использовать detection JPG той же серии как обучение, а fan MP4 как независимый тест; физическая запись и временная привязка **не доказаны**.
- Новые файлы: `tools/audit_mendeley_v6_cross_annotation_frame_alignment.py`, `tests/test_audit_mendeley_v6_cross_annotation_frame_alignment.py`, `.github/workflows/test-v6-cross-annotation-frame-alignment.yml`, `docs/VIDEO-MENDELEY-V6-CROSS-ANNOTATION-ALIGNMENT.md`. Автоматический `screen_training_group_overlap` блокирует обучение на одноимённой серии и **не разрешает** обучение на других сериях лишь по различию названий папок.
- НЕТ обучения модели, реального bee inference, независимой валидации, Android camera inference или оценки пересечения летка. `modelTrainingAuthorized=false`, `beeRecognitionSucceeded=false`, `videoCleanupAuthorized=false`. Пользовательские оригиналы и IndexedDB/backup/Service Worker/production не затронуты. **Следующий шаг:** найти подтверждённый законный детектор/обучающий pipeline с независимыми исходными sessions, получить реальное воспроизводимое inference и валидировать его до использования или автоочистки видео.

---

## 2026-11-21 — оригинальный MP4: реальное pixel-motion измерение, НЕ распознавание пчёл (Draft #300)

- Отдельная ветка `test/video-public-motion-baseline-2026-11-21` поверх Draft #299; main не изменена. В `tools/evaluate_public_fan_motion_baseline.py` реализован **классический детектор движения** из декодированных реальных пикселей, без передачи GT bbox алгоритму. Он не является нейросетью или пчелиным детектором. Исходные **оригинальные** `20230711a-fan.mp4` (128747654 байт, SHA `e0f3a7b1bd2b70ddc333f8caa17c7f029687dab2ea911ac7aff3902e4d5ad3cc`) и `tracks_20230711a-fan.txt` (4817427 байт, SHA `8446fe874e2cf89041542e8740ef8c1d85086605987e5740e763b0edd20cec12`) загружаются только во временный CI каталог и строго проверяются до обработки.
- Первый CI #44887599064 был **failure** после 8 успешных unit tests, потому что на runner отсутствовал `ffmpeg` (`command not found`). Исправлена установка свободного FFmpeg внутри эфемерного runner в `.github/workflows/test-public-fan-motion-baseline.yml`. На точном code/test SHA **`ab40b85be047e8f642a6961b34ff2954ca99ea36`** второй [CI #44887651278](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44887651278) — **SUCCESS**: 8 тестов, оригинальный MP4, реальная пиксельная обработка всех **6000 кадров**, сравнение с GT.
- Условия: 320×180 серый, разница соседних кадров ≥25 уровней, компоненты 3–600 пикселей, ограничение до 128 компонентов/кадр (cap-hit кадров **0**). Реальных движущихся компонент **183150**. Среди **127452** GT наблюдений совпало IoU≥0.5 только **729**; **126723 missed**, **182421 extra**, mean IoU совпадений ≈0.596466. На 17 соседних переходах оценщика трекер имел 5 ID switches; этот низкий знаменатель не даёт осмысленной оценки полноты слежения.
- **Инженерное решение:** motion-only вариант при текущих порогах непригоден для распознавания пчёл и не может активироваться в приложении. Даже при лучшем ROI следовало бы отдельно доказать реальную точность. Отсутствуют подтверждённые лицензированные веса, независимая train/test разбивка, настоящая нейросетевая детекция, Android offline inference и подсчёт входа/выхода.
- Дополнительно исследована permissive DETR модель Intel: Apache-2.0 вариант обучен на 80 классах COCO, где bee отсутствует; без дополнительного обучения этот checkpoint не решает задачу. Не подменять отсутствие пчелиного класса легально доступной детекторной архитектурой.
- Пользовательские видео/IndexedDB/backup/Service Worker и production **не тронуты**. `beeRecognitionSucceeded=false`, `videoCleanupAuthorized=false`. Исходные видео пользователя сохраняются до подтверждённого распознавания, удаление не активировано.
- **Следующая задача:** проверяемая лицензионно совместимая специализированная модель bee detection или безопасное собственное обучение на source-independent оригинальных данных; воспроизводимые настоящие bbox по пикселям, независимый benchmark и мобильная оценка. Действие пользователя не требуется.

---

## Финальная сверка CI для Draft #299 — 2026-11-21

- На **code/test SHA `a7baf5e7547081597724288e55ec2e25ca877ebc`**: специализированный Python CI [#44887190574](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44887190574) и [#44887193388](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44887193388) — SUCCESS; Fast quality checks [#44887190539](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44887190539) — SUCCESS; Android Debug APK [#44887190576](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44887190576) — **SUCCESS**; другой Android run #44887193480 — CANCELLED; isolated archive APK #44887193433 — SKIPPED. Различать эти статусы.
- Все файлы после `a7baf5e...` до предыдущего doc SHA `14c7d56...` — **только документация**, код и тесты не менялись. Реальная модель, реальный inference и испытание на физическом телефоне **не выполнялись**. Разрешения на удаление исходных видео нет.
- Draft PR #299 поверх Draft #298, base main не изменена. Следующая задача: юридически и технически проверить веса/зависимости, получить настоящие предсказания с доказательствами независимости источника, прогнать новый строгий оценщик и выполнить Android офлайн испытания.

---

## 2026-11-21 — дополнительная проверка воспроизводимости detector evidence (Draft #299)

- Код/тесты на SHA `a7baf5e7547081597724288e55ec2e25ca877ebc`: специализированный CI #44887190574 и #44887193388 — SUCCESS, Fast quality #44887190539 — SUCCESS. Android Debug APK #44887193480 / #44887190576 на момент последней проверки были IN_PROGRESS, **не** считать успехом до завершения. Archive APK #44887193433 — SKIPPED. Последующие коммиты только документационные.
- Сквозной синтетический unit test проходит полный путь `assess()` на 6000 кадрах и явно проверяет, что `realDetectorValidated=false` и `videoCleanupAuthorized=false`. Новый потоковый валидатор JSONL фиксирует фактический SHA-256 и размер входного файла в `predictionFileIdentity`, проверяет неизменность размера и идентичность файла при открытии. Отдельно проверяется confidence threshold.
- Независимый реальный inference на оригинальном MP4 **не выполнялся**, поэтому нет ни фактических кадровых предсказаний, ни подтверждённой точности, ни права удаления видео. Кандидаты на веса остаются заблокированными до проверки полной лицензии и независимых данных.
- Продолжать только после независимой проверки прав на веса и получения реальных reproducible predictions, не делать вывода о качестве модели по синтетическим тестам.

---

## 2026-11-21 — итог блока: проверка входных данных и публичных весов детектора (Draft #299)

- Проверенный code/test SHA `8ab3d8c1c117f28d22356fecd1fea3ad572e92ad`: [external fan detector evidence #44886964302](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44886964302) **SUCCESS**, [Fast quality #44886964309](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44886964309) **SUCCESS**, [Android Debug APK #44886964305](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44886964305) **SUCCESS**. Это CI кода/формата, а НЕ работоспособность нейросети на физическом Android. Последующие коммиты содержат только документы.
- В `docs/VIDEO-DETECTOR-WEIGHTS-CANDIDATE-REVIEW.md` сверены два открытых кандидата. Matt Nudi YOLOv5 `best.pt`: опубликован файл и карточка CC BY 4.0 **датасета**, но точная лицензия **весов** не подтверждена. Apiarist YOLOv8s: модельная карточка указывает Apache-2.0 и фокус на **соторамках**, а не летке; необходимо проверить транзитивные условия использования базовых весов и библиотеки, и качество в другом домене. Ни один кандидат не принят.
- Нет независимого доказательства причинной связи заявленных bbox с конкретной моделью; нет проверенной независимости исходных записей train/test, фактического inference, линии входа/выхода и полевого offline Android тестирования. `modelLicenseVerified=false`, `independentTestSplitVerified=false`, `realDetectorValidated=false`, `videoCleanupAuthorized=false`.
- Следующая задача: получить законно лицензированный checkpoint с SHA и полной модельной спецификацией, независимо воспроизводимо получить реальные предсказания и проверить их на исходном MP4+TXT, **после** подтверждения независимости source/session. Запрещены запуск платных API и удаление личных исходных видео.

---

## 2026-11-21 — независимые предсказания детектора: безопасный входной шлюз (Draft #299)

- После Draft PR #298 создана стековая ветка `test/video-detector-prediction-evidence-2026-11-21`. Исходная main не изменена. Код/тесты SHA `8ab3d8c1c117f28d22356fecd1fea3ad572e92ad`; GitHub Actions [#44886964302](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44886964302) **SUCCESS** — синтетические unit/negative tests для независимых предсказаний и CLI. Общий quality run #44886964309 **SUCCESS** на этом SHA. Android build #44886964305 проверять отдельно: на момент записи он выполнялся.
- Новый `tools/evaluate_external_fan_detections.py` требует фактический оригинальный Mendeley MP4 и tracking TXT (издательские SHA), фактические локальные веса с проверкой размера и SHA и полный файл независимых bbox JSONL из **6000 кадров**, включая пустые. Заранее выбранный confidence threshold 0.5 можно изменить. Отвергаются отсутствие кадра, дубли, track_id/GT, ложные готовые метрики, некорректные bbox/confidence/NaN, небезопасный файл и неправильный SHA.
- Имеются только **синтетические** тесты `tests/test_evaluate_external_fan_detections.py`; CLI не запускает модель, не извлекает видео, не скачивает веса и не производит действительные предсказания. Проверка байтов не доказывает соответствие файла предсказаний конкретному inference. Поля `predictionsGeneratedByModelVerified`, `modelLicenseVerified`, `independentTestSplitVerified`, `realDetectorValidated`, `entranceLineCrossingsValidated`, `androidOfflineInferenceVerified`, `videoCleanupAuthorized` всегда false. Описание и пример входного формата — `docs/VIDEO-EXTERNAL-DETECTOR-EVIDENCE-GATE.md`.
- Ни IndexedDB, ни журнал пасеки, ни архивы, ни оригинальные видео не изменены. Автоудаление видео не активировано.
- **Следующий шаг:** найти/подтвердить лицензионно допустимые реальные веса + независимый source-recording split, выполнить **реальный воспроизводимый inference**, передать его bbox в этот шлюз и сравнить качество и ошибки ID; только затем обсуждать Android offline и подсчёт пересечений.

---

## 2026-11-21 — заключительная контрольная точка: проверка конкретных ложных связей в PR #298

- Финальный code/test SHA `ccecf4b1c9d88de9bfb4e51e696109b4ae4d8e4f` (после документальной точки `ff72ad56...` добавлены защищённые исследования; PR #298 остаётся Draft). На точном SHA специализированные [GitHub Actions #44886515130](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44886515130) — **SUCCESS**: новые unit tests и три реальных запуска по исходному SHA-verified `tracks_20230711a-fan.txt`. Fast quality checks #44886510917 — **SUCCESS** на этом SHA. Проверку Android необходимо отдельно сверить по её статусу; успешный тестовый workflow не является Android-сборкой.
- Предыдущий критерий сравнивал только `crossReferenceIdentityReuses` целиком. Теперь `cross_reference_reuse_events()` строит реальные пары (старый/новый кадр, исходная GT-пчела, ошибочно привязанная GT-пчела). `safety_gate` запрещает **даже одно новое ошибочное соединение относительно baseline**, несмотря на равенство суммарных ошибок. Unit tests проверяют ложную новую связь и запрет выдавать её за улучшение.
- На одном реальном оригинальном наборе (6000 кадров, 127452 GT bbox) все три прогона имеют **0 new wrong links / 0 resolved wrong links** относительно baseline: (1) исходный без искажений, IoU=0.90: 25 против 12 корректных восстановлений ID в 201 однокадровом разрыве, 113 против 113 ошибочных reuse; (2) GT bbox с искусственным пропуском каждого 20-го и jitter 2px, IoU=0.90: 551 против 10 корректных восстановлений в 5622 разрывах, 125 против 125 ошибочных reuse; (3) тот же стресс, IoU=0.98: 36 против 10, 125 против 125. По сравнению с baseline улучшение при IoU=0.90 — **+541 правильное восстановление ID**, новых ошибочных связей на этих кадрах **0**.
- **Вывод ограничен:** эта безопасность измерена только на указанной последовательности с готовыми эталонными bbox и искусственными пропусками. Не проверены реальные детекции, самостоятельные исходные записи, пользовательский ракурс, реальные перепутывания/окклюзии, вход/выход через леток, Android offline model inference и автоматическое удаление оригинального видео. Не переносить вывод на продукт без независимых испытаний и фактических данных.
- Изменённые модули: `tools/fan_occlusion_memory.py`, `tools/fan_memory_diagnostics.py`, `tools/compare_public_fan_memory.py`, `tests/test_fan_occlusion_memory.py`, `.github/workflows/test-fan-occlusion-memory.yml` + документы. `main`, пользовательские данные, IndexedDB/backup/PWA/Service Worker, production и оригинальные записи не изменены.
- Следующий приоритет: реальная модель детекции и независимая оценка при разных камерах/времени/ульях; повторить gate на полноценных предсказаниях модели и отдельно измерить ошибочные пересечения летка. Не активировать реальную очистку видео или автоматическое изменение данных пасеки.

---

## 2026-11-21 — эксперимент: консервативная память трека на один пропущенный кадр

- **Цепочка:** Draft PR #297 → отдельная ветка `test/video-fan-occlusion-memory-2026-11-21` (не main). Алгоритм в `tools/fan_occlusion_memory.py` связывает объект по нормированным bbox, не используя эталонный track ID. При временной потере на ровно один кадр допускает возврат прежнего ID только если есть одно взаимно-однозначное геометрическое совпадение. Активные треки имеют приоритет; более длинный пропуск либо неоднозначность создают новый ID. Это исследовательский метод, не реальное распознавание на Android.
- Отдельная диагностика `tools/fan_memory_diagnostics.py` измеряет возврат верного ID через разрыв и повторное использование одного предсказанного ID для **разных** GT пчёл. Тесты проверяют две похожие пчелы, отсутствие две рамки подряд, высокое смещение, перестановки GT ID и отказ небезопасной конфигурации.
- На исходном публичном Mendeley v6 `tracks_20230711a-fan.txt` (6000 кадров, 127452 GT bbox; SHA-256 `8446fe874e2cf89041542e8740e763b0edd20cec12`) исследовательский CI [#44886304870](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44886304870), SHA `67a31ee63d32138d6fbc9609f8c37f69d02dbbbf`, **SUCCESS**. Без синтетического шума: GT с однокадровым пропуском 201; baseline вернул тот же ID 12 раз, при IoU восстановления 0.90 — 25 раз; cross-reference ID reuses 113 у обоих.
- На тех же bbox с **искусственными** пропусками каждого 20-го наблюдения и jitter 2 px: 5622 сопоставимых разрыва; baseline вернул тот же ID 10 раз (ошибочных переиспользований ID 125); консервативная память IoU=0.90 — 551 раз (ошибочных переиспользований также 125); IoU=0.98 — 36 раз (125). Для сравнения предшествующий слабый порог 0.50 дал 5377 возвратов, но **150 ошибочных переиспользований** — не принят как безопасный вариант. При таком выборе выигрыш меньше, но измеримый риск не растёт в этой оценке.
- Дополнительный `safety_gate` в `tools/compare_public_fan_memory.py` отклоняет вариант, если ошибок чужой идентичности больше baseline либо число корректных возвратов не выросло. В CI используется `--require-benchmark-gate`. **Это ограниченный экспериментальный критерий на одной опубликованной серии, не абсолютная гарантия безопасности на другой пасеке**. Код/тесты финального safety-gate SHA `22cbb0d1b443d404a9eb9cdaf5cd98f2c5bad671` — CI необходимо подтвердить после изменения.
- Источник оригинального файла проверяется по размеру/SHA; transient TXT удаляется по выходу из `TemporaryDirectory`. Видео MP4 не загружается, исходные пользовательские записи не читаются и не удаляются. `realDetectorEvaluated=false`, `entranceLineCrossingsEvaluated=false`, `androidOfflineInferenceVerified=false`, `videoCleanupAuthorized=false`.
- **Следующий приоритет:** выяснить устойчивость на независимых источниках/реальных предсказаниях детектора и оценить ошибки неверного совпадения у входа в леток. До этого ни модель, ни удаление оригиналов не активировать.

---

## Итог проверки текущего этапа — 2026-11-21

- **Код/тесты:** SHA `8b988633c117164f6bfb50da5d8429cddce97e8c`. Специализированный fan benchmark [#44885920213](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44885920213) SUCCESS; evaluator [#44885920275](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44885920275) SUCCESS; Android Debug APK [#44885920191](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44885920191) **SUCCESS**. Изолированный archive APK [#44885920221](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44885920221) SKIPPED — это не успешная проверка архива.
- Код после этого SHA не менялся, обновлялись только документы. Реальный Android-телефон, camera inference и очистка исходных видео не тестировались; PR #297 остаётся Draft, main не изменена.
- Единственный следующий технический этап — безопасная кратковременная память трекера и доказательный тест ложных привязок при окклюзии, используя контрольный оригинальный Mendeley TXT. Не объявлять этап распознавания завершённым.

---

## Проверенный этап — 2026-11-21: стресс-тест реальных fan bbox с искусственными пропусками

- Code/test SHA `8b988633c117164f6bfb50da5d8429cddce97e8c`; CI [#44885920213](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44885920213) **success**: все новые Python unit tests, исходный и стрессовый прогоны оригинального `tracks_20230711a-fan.txt` после SHA-256 проверки. Независимый evaluator CI #44885920275 — **success**.
- Исходный геометрический baseline: 6000 кадров, 127452 matched, 0 missed, mean IoU=1, 124945 adjacent matched transitions, **1263 adjacent ID switches**.
- Управляемое ухудшение тех же реальных bbox: каждый 20-й объект по каноническому геометрическому порядку удалён (**ровно 6372 synthetic misses ≈ 5%**), оставшиеся рамки сдвинуты по детерминированному правилу на 2 пикселя, ограничены границами кадра. Получено 121080 matched, 6372 missed, 0 extra, mean IoU≈0.8802361, 112975 adjacent matched transitions, **1476 adjacent ID switches**.
- Эти числа **не доказывают качество реального детектора**: исходные боксы являются готовой разметкой; пропуски и сдвиги искусственные. Показатели сопоставимы в рамках конкретного детерминированного эксперимента; 1263/124945 и 1476/112975 имеют разные знаменатели. Отсутствуют проверка линии пересечения, offline Android inference и право удаления видеозаписей.
- Новые файлы: `tools/perturb_mendeley_v6_fan_boxes.py`, `tests/test_perturb_mendeley_v6_fan_boxes.py`; публичный runner расширен опциями `--drop-every 20 --jitter-pixels 2`, source hash проверяется перед каждой оценкой. Исходное пользовательское видео не используется.
- Следующая задача: отдельный более устойчивый tracking-метод с сохранением ID после кратковременных пропусков; сравнение на том же SHA-pinned клипе, с отдельными метриками ложных ассоциаций, прежде чем переходить к реальному детектору. Merge / production / публикация не выполнены.

---

## Проверенный результат — 2026-11-21: первый реальный IoU-only fan baseline

- На **точном code/test SHA `68557a741fe5dccca8abd0eddb1fa0862c18bb17`** специализированный workflow [#44885787016](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44885787016) завершился `success`. В нём прошли восемь unit-тестов синтетического baseline, три unit-теста источника/хеша и загрузка/анализ оригинального публичного TXT с SHA-проверкой. Workflow второго evaluator [#44885787072](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44885787072) завершился `success` на том же SHA.
- Реальный результат на `tracks_20230711a-fan.txt`: **6000 кадров, 127452 опубликованных наблюдения, 127452 геометрических совпадения, missed=0, extra=0, meanMatchedIoU=1, 124945 сравнимых соседних переходов, 1263 смены ID**. Примерно 1,01% — доля *смен ID среди соседних сравнимых переходов*, **НЕ** precision, recall, IDF1, HOTA или accuracy детектора. Рамки во входе самого трекера взяты из эталона, поэтому 100% геометрических совпадений — свойство эксперимента, не качество распознавания.
- В stdout явно: `realDetectorEvaluated=false`, `entranceLineCrossingsEvaluated=false`, `androidOfflineInferenceVerified=false`, `videoCleanupAuthorized=false`. Пользовательские оригинальные видео не тронуты; публичный TXT временный.
- Следующий конкретный шаг: измерить устойчивость ассоциации при шуме bbox, пропусках и появлении новых объектов, сохраняя строгую границу между синтетическими и реальными результатами. После этого отдельно исследовать реальный детектор. Merge, production и публикация не выполнялись.

---

## Контрольная точка — 2026-11-21: подготовлен SHA-pinned запуск baseline на оригинальном tracking TXT

- Draft PR #297, рабочая ветка `test/video-fan-iou-association-baseline-2026-11-21`, code/test HEAD `68557a741fe5dccca8abd0eddb1fa0862c18bb17`. Добавлены `tools/run_public_mendeley_v6_fan_baseline.py`, `tests/test_run_public_mendeley_v6_fan_baseline.py` и отдельный этап существующего fan-baseline workflow.
- Публичный файл `tracks_20230711a-fan.txt`, UUID `3291d9bc-bdb3-4bff-94d6-fe24f17ae2a5` скачивается с ограничением 4 817 427 байт через существующий строгий HTTPS downloader. До анализа проверяются размер и SHA-256 `8446fe874e2cf89041542e8740ef8c1d85086605987e5740e763b0edd20cec12`. Затем запускаются 6000-frame geometry-only baseline и независимый evaluator. Временный TXT удаляется после выхода из TemporaryDirectory, оригинальное видео, личные данные и storage приложения не затрагиваются.
- Отдельные unit tests проверяют неверную длину, SHA, тип и отказ до ассоциации. Workflow может завершиться failure при недоступности публичного сервиса: такой результат не следует подменять успешной оценкой. В случае успеха численные показатели брать только из лога успешного run на этом SHA.
- До получения реальной модели не разрешаются Android offline inference, подсчёт входящих/выходящих и удаление исходных видео.

---

## Контрольная точка — 2026-11-21: устранён отказ CI и расширены контроли fan-трекинга

- Основная цепочка эксперимента: PR #296 → [Draft #297](https://github.com/250oisr-eng/Pasekaapp/pull/297), ветка `test/video-fan-iou-association-baseline-2026-11-21`; основная ветка main не изменена. Последний изменённый код/тесты на этой точке — `5afa0d913db75170fc66f9b240d562a1f1f2cde2`.
- **Причина специализированных `failure` с нулём jobs:** некавыченная YAML scalar с командой `pip install --only-binary=:all: ...` интерпретируется как ошибка синтаксиса из-за `: ` внутри строки. В обоих workflow команда оформлена многострочным `run: |`; запуски #44885604855 (baseline) и #44885604827 (evaluator) на SHA `7388dfac01768499f5dc3b3bed3132fa858f6b8f` прошли `success`. Потом ограничены пути запуска, сохранены `push` и `pull_request`.
- Эксперимент расширен двумя тестами: 6000 кадров × 12 искусственных объектов со стабильными исходными ID и изменяющимся порядком вставки; три кадра с перемещением между несоприкасающимися позициями. Первый вариант теста ошибочно изменял GT ID и дал 0 вместо 71988 сравнимых переходов (run #44885651641). Исправлено отдельным коммитом `5afa0d913...`; актуальные проверки на этом SHA должны быть сверены отдельно перед заявлением успеха.
- Выход CLI теперь явно содержит `realDetectorEvaluated=false`, `entranceLineCrossingsEvaluated=false`, `androidOfflineInferenceVerified=false`, `videoCleanupAuthorized=false`. Никаких операций с пользовательскими файлами, backup, storage или production нет.
- **Следующий шаг:** подтвердить все тесты и Android build на code/test SHA; запустить baseline на оригинальном `tracks_20230711a-fan.txt` с SHA `8446fe874e2cf89041542e8740ef8c1d85086605987e5740e763b0edd20cec12`, получить численные показатели и отдельно проверить качество реальных предсказаний детектора. Пока оригинальные видео защищены от удаления.

---

## Контрольная точка — 2026-11-21: геометрический baseline ассоциации у летка

- После PR #296 создана отдельная рабочая ветка `test/video-fan-iou-association-baseline-2026-11-21` поверх SHA `1d56971e920a979f04443af0abbc24d7f789d944`. Этот этап НЕ интегрирован в main.
- Добавлены `tools/baseline_mendeley_v6_fan_association.py`, `tests/test_baseline_mendeley_v6_fan_association.py` и отдельный CI workflow. Вход — проверенные авторские bbox серии `20230711a-fan`; исходные track ID используются исключительно как метки при оценке, но не для назначения ID. Фреймы сортируются по геометрии; сопоставление соседних кадров происходит через IoU.
- Проверяются неизменность входных данных, пропуск кадра, смена ID, перестановка исходных ID и отказ на неправильном пороге. Исходное видео не удаляется и пользовательские записи не изменяются.
- Важно: тестовые сценарии — синтетические; реальный результат baseline на 6000 кадрах ещё не опубликован. Отдельный workflow CI требуется проверить на точном новом HEAD; ранее на PR #296 были успешные общие проверки, но специализированный workflow #44876378052 завершился `failure` без jobs, поэтому его нельзя считать пройденным.
- Следующий шаг: проверить workflow на актуальном SHA, прогнать baseline на оригинальном TXT с проверенным SHA, записать численные ID-switch / пропуски, затем перейти к независимому детектору. Offline Android recognition и разрешение на удаление оригиналов по-прежнему отсутствуют.

---

## 2026-11-21 — независимые ошибки локализации и ассоциации треков

Офлайн-измеритель сверяет SHA авторского TXT и сопоставляет нормированные рамки один к одному в каждом кадре. На 6000 кадрах и 127452 наблюдениях контрольная копия дала 0 ошибок; удаление одной рамки дало 1 пропуск без смены ID; переименование одного трека со второго кадра дало 1 смену ID без потери совпадений. Все совпавшие рамки во всех трёх контролях имеют IoU 1. Следующий этап — получить первый воспроизводимый baseline ассоциации на этом клипе: передать трекеру авторские рамки без track-id, затем сравнить созданные им ID с эталоном. Такой опыт изолирует ассоциацию; оценка детектора требует отдельных реальных предсказаний. [Метод и контрольные числа](docs/VIDEO-MENDELEY-DATA-V6-TRACKING-AUDIT.md). База — [Draft #295](https://github.com/250oisr-eng/Pasekaapp/pull/295), 4c18dc2. Локально прошли 138 тестов Mendeley и 1149 тестов приложения.

## 2026-11-21 — проверенная покадровая разметка клипа 20230711a-fan

Проверены байты MP4, tracks TXT и entrance_zone TXT по издательским SHA-256. В 120-секундном клипе при 50 кадрах/с присутствуют все frame-id 1…6000, соответствующие индексам отображения 0…5999 (индекс = frame-id − 1). Всего 127452 строки, 1674 уникальных track-id, от 9 до 38 строк на кадр. Дубликатов (frame-id, track-id) нет. У 470 ID есть внутренние пропуски. Все рамки внутри изображения, но центры 493 рамок вне авторского полигона (граница включена). Следующий этап — реализовать офлайн-проверку сопоставления предсказанных треков с авторскими рамками для одного клипа. Проверить на контрольных сценариях идентичной копии, пропуска и смены ID; вывести ошибки позиционирования и ассоциации раздельно. Только после проверки измерителя подавать реальные предсказания. [Технический отчёт](docs/VIDEO-MENDELEY-DATA-V6-TRACKING-AUDIT.md). Основа — [Draft #294](https://github.com/250oisr-eng/Pasekaapp/pull/294), 80069c8. Локально прошли 132 теста Mendeley и 1149 тестов приложения.

## 2026-11-21 — одна серия detection против всех кадров fan-клипа

Проверены по издательским SHA-256 все 12 JPG серии 20230711a и MP4. Видео декодировано один раз в порядке отображения. По MAE яркости на 160×90 для суффикса 0 ближайший индекс 0, для 1020 — 1700 (0,84111) и 1699 (0,84917). Среди остальных десяти файлов шесть получили один и тот же ближайший индекс 745. При сортировке по числовому суффиксу лучшие индексы не монотонны. Доказательства единой временной привязки нет. Следующая задача — проверить опубликованную покадровую разметку tracks_20230711a-fan.txt для самого клипа: сверить SHA-256 и диапазон frame-id с 6000 кадрами, установить систему нумерации по источнику и границы разметки зоны летка. Это отдельная проверка пригодности видео для тестирования треков; она не присваивает detection JPG номера кадров. [Полная таблица](docs/VIDEO-MENDELEY-V6-PUBLISHER-CHECKSUMS.md). Основа — [Draft #293](https://github.com/250oisr-eng/Pasekaapp/pull/293), 279ff3e. Локальные проверки: 129 тестов Mendeley и 1149 тестов приложения прошли.

## 2026-11-21 — первый кадр публичного клипа 20230711a-fan

Для 20230711a0.jpg проверены все 6000 кадров публичного 20230711a-fan.mp4. Оба файла совпали с размером и SHA-256 издателя. Ближайший по средней абсолютной разности яркости на сетке 160×90 — кадр 0 (0,95875 уровня из 255), следующий — кадр 2 (3,19014). В полном RGB совпали 9845 из 2073600 пикселей, средняя абсолютная разность каналов 6,59083. Кадр 0 — измеренный кандидат. Историческая цепочка экспорта и независимость записей остаются неподтверждёнными. Следующая задача — одним проходом сравнить оставшиеся JPG серии 20230711a из реестра с этим же проверенным MP4 и установить, сохраняется ли однозначное временное соответствие для нескольких кадров. До этого обучение и удаление видео остаются заблокированы. [Метод и исходные хеши](docs/VIDEO-MENDELEY-V6-PUBLISHER-CHECKSUMS.md). База — [Draft #292](https://github.com/250oisr-eng/Pasekaapp/pull/292), 39c47b3.

## 2026-11-21 — метаданные трёх исходных JPEG

Проверены по одному JPG из трёх серий detection с префиксами имён опубликованных MP4. Размеры и SHA-256 совпали с каталогом v6; все три JPEG полностью декодировались в 1920×1080. В заголовках, прочитанных Pillow, только APP0/JFIF. EXIF, XMP, комментария, имени записи и номера исходного кадра не обнаружено. Вывод ограничен тремя файлами. Следующая точечная проверка — сравнить 20230711a0.jpg с декодированным первым кадром опубликованного 20230711a-fan.mp4, зафиксировав идентификатор и SHA файла MP4, индекс кадра и метод сравнения. Совпадение префикса и суффикс 0 задают гипотезу. При несовпадении кандидата вопрос происхождения остаётся открытым. [Доказательства](docs/VIDEO-MENDELEY-V6-PUBLISHER-CHECKSUMS.md). Основа — [Draft #291](https://github.com/250oisr-eng/Pasekaapp/pull/291), dbd07d3.

## 2026-11-21 — эталонные контрольные суммы издателя

Все 192 первоначальных SHA-256 для 96 пар сверены по UUID и именам в 16 версионных папках Mendeley v6. В первичной разметке 93 пары прошли проверку, у трёх рамки вышли за границу. Повторные чтения из #290 дали 47/48/1; из 47 совпадений у 42 пар сохранены оба хеша. Все 31 JPEG-ответа с расхождением также не прошли декодирование.

Следующая задача — подтвердить соответствие JPG конкретному MP4 и номеру кадра. В опубликованном каталоге tracking_and_behavior пять MP4 и 15 TXT; связь с кадрами detection пока не установлена. Обучение и Android inference остаются заблокированы.

[Документ и команды проверки](docs/VIDEO-MENDELEY-V6-PUBLISHER-CHECKSUMS.md). [Родительский Draft #290](https://github.com/250oisr-eng/Pasekaapp/pull/290), SHA `96f222ee8f078f798dcba8fe33023ac86afcc6f1`. Ветка [work/mendeley-v6-publisher-checksums](https://github.com/250oisr-eng/Pasekaapp/tree/work/mendeley-v6-publisher-checksums). Проверены побайтовое воспроизведение CSV из ответов издателя и 124 теста Mendeley; прошли 1149 тестов приложения. Состояние CI на итоговом SHA указано в Draft PR.

---

## 2026-11-20 — восстановление Work и проверка 96 пар Mendeley v6

Первичная сверка дала 93 строки с допустимой разметкой (557 рамок). При повторном чтении 96 публичных пар оба SHA подтвердились для 47 пар с допустимой разметкой: 12 прежних и 35 новых. Для 48 пар из всех 96 зафиксировано расхождение SHA, ещё для одной пары результат не подтверждён. Три исходных геометрических отказа учтены в общем числе 96. Первая выборка из 93 является снимком первого прохода; её воспроизводимость целиком не подтверждена. Причина различий в ответах источника не установлена. Пофайловая сверка сохранена в `tests/fixtures/mendeley-v6-work-replay.csv`. Поля observed содержат SHA при первом повторном чтении, retry — результат сравнения при дополнительной попытке. Старые и новые SHA сохранены раздельно. Следующий приоритет — установить причину разных байтов по одному UUID и проверить авторитетные контрольные суммы источника, затем связать кадры с исходными записями.

На первом SHA [Draft #290](https://github.com/250oisr-eng/Pasekaapp/pull/290) `2d4d7ecac7b7d94d41e087e7c082ec407b9210c5` прошли Fast quality и обе сборки Android; архив пропущен. Проверка 16 прежних JPEG завершилась ошибкой и после повтора. Локально один запуск вернул `original_jpeg_sha256_changed`; при отдельном чтении все 16 JPEG совпали с прежними пинами. Причина расхождения ответов пока неизвестна. Сохраняем исходные SHA, при ошибке печатаем диагностический JSON в журнал CI. Итог на актуальном SHA см. в PR.

[Рабочая ветка и изменения](https://github.com/250oisr-eng/Pasekaapp/compare/feat/video-mendeley-v6-temporal-leakage-gates-2026-11-20...work/recovery-mendeley-provenance). База рабочей ветки — [Draft #289](https://github.com/250oisr-eng/Pasekaapp/pull/289), SHA `b8866965f20879f238a75ee1a9ae3f29952829e0`. На нём успешны Android #44773808577 и проверка исходников #44773808608, архив #44773808629 пропущен. При восстановлении: 219 открытых Draft PR. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`, PR #154, успешны Fast quality #44232695339, Android #44232695515 и ранее выполненный Pages #44232694911.

В реестре Work из 96 строк 16 совпали с зафиксированными в #287. Для остальных 80 пар загружены оригинальные публичные байты, полностью декодированы JPEG 1920×1080, вычислены SHA-256 всех 160 файлов. Строгую проверку YOLO прошли 77 пар (444 размеченных объектов). Для 3 пар граница рамки выходит за изображение; исходные координаты сохранены у автора, причины, SHA и номера строк зафиксированы в `tests/fixtures/mendeley-v6-work-rejected.csv`. Эти пары исключены из рабочего реестра. Пять новых CSV, до 16 строк каждый, в `tests/fixtures/mendeley-v6-work-96/` дополняют прежний список. Совокупно 93 строки первичного реестра кадров из восьми коллекций, 557 объектов с учётом 113 из #287. До опубликованных 7200 кадров остаётся 7107.

Локально прошли 1149 тестов приложения. Для повторной проверки принятых кадров использовать инструкции в docs/VIDEO-MENDELEY-V6-SCENE-SIMILARITY-AND-SPLIT-GATE.md.

Следующая задача — проверить связь конкретного detection JPG с исходным видео, его SHA-256 и номером кадра. В описании v6 указаны отдельные MP4 в tracking/behavior с покадровой разметкой; соответствие этим JPG пока неизвестно. Обучение, независимая контрольная выборка, Android-распознавание и разрешение на удаление видео остаются заблокированы.

---

## 2026-11-20 — крупный этап Mendeley v6: real scene similarity + 7200-frame metadata inventory + fail-closed split-gate (Draft #289)

- Продолжено от Draft #288 final `8475c7fb536717cc99fa5c2ffb760d028890d6ba` (реальная геометрия 113 bbox из 16 original TXT, Android #44771297589 success, оригинальные метки #44771297562 success, isolated archive #44771297591 skipped). Новый Draft [#289](https://github.com/250oisr-eng/Pasekaapp/pull/289), ветка `feat/video-mendeley-v6-temporal-leakage-gates-2026-11-20` поверх #288, только research tooling, без runtime.
- **1/3 Реальная visual scene SHA + dHash проверка**: `tools/audit_mendeley_v6_original_scene_similarity.py` считал **16 original SHA-pinned JPEG** из Mendeley v6, все полностью декодированы 1920×1080. Всего 8 внутригрупповых и 112 межгрупповых сравнений; **0** межгрупповых dHash расстояний `<=6`, ближайшее **19 бит**. Результат на live [CI #44772676835](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44772676835) **completed/success**; dHash порог — непроверенная эвристика, это **не** source video recording independence, не split и не детектор.
- **2/3 Масштабирование исходного списка до 7200 без медиа**: `tools/merge_mendeley_v6_pinned_manifests.py` сливает 1–500 ограниченных CSV порций (до 16/CSV) со строгими public v6 URL и двумя исходными SHA на каждую пару, отвергает межпакетные дубли filename/SHA/UUID/переполнение восьми опубликованных коллекций. Режим metadata-only, исходные байты **не** скачиваются и SHA не перевычисляются. Для подтверждённых 16 оригиналов: **16/7200**, недостаёт **7184**; без train/test и без runtime.
- **3/3 Предварительный непересекающийся по имени папок split строго НЕ разрешает обучение**: `tools/audit_mendeley_v6_grouped_split_proposal.py` структурно проверяет предложенные group-disjoint `train/validation/test`, но указывает `sourceVideoRecordingHashesVerified=false`, `frameToRecordingProvenanceVerified=false`, `independentHoldoutVerified=false`, `splitReadyForTraining=false`, `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. Пример `tests/fixtures/mendeley-v6-group-disjoint-NOT-TRAINING.json` не создаёт реальных split folders; 16 кадров 10/2/4 только демонстрируют блокировку, **не утверждённый train/val/test план**.
- Добавлены **38 synthetic negative/security regression tests** (11 scene, 14 manifest, 13 split) и один no-artifacts isolated workflow `.github/workflows/audit-mendeley-v6-scene-and-inventory.yml`; промежуточный GitHub job #44773061801 **completed/success** проверил все три real/metadata шага и их тесты. **Обязательно сверить exact FINAL SHA CI** после документационного commit, а не переносить прежний статус на новый SHA; Android success vs pending vs skipped раздельно.
- Уточнён первичный источник: [Sledevič & Matuzevičius, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10831503/) описывает оригинальные video frames при **50 fps**, bee labels **на стенке, прилётной доске и траве**; detection положительной пчелы не является `in/out` пересечением. Нет подтверждённых original recording SHA / frame extraction provenance. Документ `docs/VIDEO-MENDELEY-V6-SCENE-SIMILARITY-AND-SPLIT-GATE.md`.
- Следующий приоритет: получить больше оригинальных JPEG/TXT public UUID в новых порциях и законный исходный video recording/frame provenance, затем независимый holdout, **реальное** обучение licensed compact bee detector, 640/960/1280 и offline Android in/out test. Никакого удаления оригинальных видео пользователя без подтверждённого результата и контроля копий. **Main/production/данные пользователя не изменены**, PR Draft, merge нет.

---

## 2026-11-20 — реальная геометрия 113 пчёл при входах 640/960/1280 (Draft #288)

- Родительский Draft #287 final HEAD `b0d39ec04f8410f597d341c8461cdeec835fb0f6`: 16 original JPG+16 YOLO TXT SHA-pinned source CI #44770020180 **completed/success** и Android #44770020236 **completed/success**; isolated archive #44770020092 **completed/skipped**. Эти проверки не включают обученную модель.
- Новый Draft #288 `test/video-mendeley-v6-real-bbox-scale-audit-2026-11-20`: `tools/audit_mendeley_v6_real_box_scale.py` считывает только **16** оригинальных public YOLO TXT с SHA pins из `tests/fixtures/mendeley-v6-user-16-pairs-pinned.csv`, не скачивает повторно JPG и не трогает видео пользователя. Подсчитаны размеры **113** валидных bee bbox. 11 synthetic tests + real label geometry job #44771000596 на code SHA `ca9c6de7bcbaaaff04acaab594f06b983be6b2a9` прошли необходимые steps; финальный CI на новом docs HEAD проверить отдельно.
- Исходный 1920×1080 min bbox shorter side **20.001 px**, p10 **33 px**, медиана **49 px**. При aspect-preserving letterbox 640/960/1280 median shorter side **16.333 / 24.5 / 32.667 px**; min side менее 16px — **53/113**, **10/113**, **3/113** соответственно. Этот риск потери пространственной детализации требует реального сравнения режимов 640 и 960 (1280 по производительности); НЕ является precision/recall, FPS, удачным training run или выбором production веса.
- В статье о наборе исходные видео 50 fps и кадры извлечены из этих записей; source recording IDs/SHA каждой группы всё ещё неизвестны, random train/test split по соседним кадрам недопустим. Детально `docs/VIDEO-MENDELEY-V6-REAL-BOX-GEOMETRY.md`.
- Следующий практический этап: получить расширенную исходную выборку и source-session mapping; обучить лицензированную compact модель на независимом holdout, измерить accuracy и offline Android. `trainingAuthorized=false`, `detectorQualityMeasured=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. Main, production, пользовательские видео не изменять и PR не объединять.

---

## 2026-11-20 — повторный SHA-pinned real v6 sample и обнаруженный дисбаланс аннотаций

- На SHA `e22ba60dc6672d76c3fec03f47998cf37547ba7f`: [live 16/8 pinned CI #44769784227](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44769784227) **completed/success**; 13 synthetic тестов, повторно скачаны 16 original JPEG + 16 TXT и полностью декодированы, все **32** original SHA совпали с опубликованным внутри Draft #287 pinned manifest, `sourceHashesPinnedByManifest=true` для всех 16. COCO `unassigned` содержит 16 images, 113 bee bbox. Изображения и временный COCO очищены с runner, без binary artifacts.
- Распределение bbox по восьми группам [`20230609a`…`20230711c`]: **12, 11, 13, 5, 5, 58, 7, 2**. Неравномерность (58 в `_bee_20230711a`) подтверждает, что 16 кадров нельзя использовать для честного quality benchmark. См. `docs/VIDEO-MENDELEY-V6-16-REAL-PAIR-AUDIT.md`.
- После этой документационной фиксации требуется отдельная проверка exact final HEAD CI/Android. Разрешение обучать/распознавать/удалять частное видео **не выдано**; `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.

---

## 2026-11-20 — подтверждённые реальные 16 JPEG+YOLO пар Mendeley v6 по файлу пользователя

- Получен user upload `mendeley_v6_detection_links.csv` (4639 B, SHA256 `c90630a59a2eef13cdd4210ba1a4d7b48ff9642e487b2bbac27ce4554c95e8d0`), **16** пар JPG/TXT, по **2** для каждой из 8 исходных групп `_bee_...`. Никаких паролей/токенов. CSV передан в новый Draft #287 branch `test/video-mendeley-v6-user-16-pairs-2026-11-20` поверх #286. Source CSV metadata-only сохранён как `tests/fixtures/mendeley-v6-user-16-pairs.csv`.
- Точная контрольная сумма CSV подтверждена реальным [GitHub Actions #44769285838](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44769285838), code SHA `8caa641a1e6c6196f2c5a199b67541ddaa076cc1`, **completed/success**. 13 synthetic tests, реальные 32 публичные файла Mendeley v6 успешно скачаны и обработаны в ограниченном isolated runner: **16 JPEG**, все полностью декодируются Pillow, 16 matching YOLO TXT, **113 bee class 0 bbox**, все 16 JPEG SHA256 уникальны. Получен проверенный временный `unassigned` COCO (16 images, 113 annotations) с CC BY 4.0 attribution, temporary files удалены, binary artifacts не публиковались.
- После фактического чтения создан `tests/fixtures/mendeley-v6-user-16-pairs-pinned.csv` с полученными **16 SHA256 JPG и 16 SHA256 TXT**, программа CI переключена на полный sha-pinned повтор; его успех **ещё нужно подтвердить на final HEAD**, не приравнивать к раннему успеху без пинов.
- Документ `docs/VIDEO-MENDELEY-V6-16-REAL-PAIR-AUDIT.md` содержит точное состояние, ограничения исходных видео и provenance. Source recording/session independence неизвестна; нет полного датасета 7200, unbiased holdout, real training, детектора, трекера и Android physical benchmark. `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. Main/production/частные видео не изменялись; PR Draft.
- Следующая задача: проверить финальный exact SHA/CI и отчет по группам, затем расширить реальные original JPEG/YOLO ссылки и установить связь с исходными video recordings для юридически и научно корректного независимого train/test.

---

## 2026-11-20 — добавлена обязательная атрибуция оригинального Mendeley v6 в COCO

- В `tools/prepare_mendeley_v6_yolo_unassigned.py` расширено только исследовательское поле `info`: `sourceCreator=Tomyslav Sledevic`, DOI, source URL, CC BY 4.0 URL и `modificationNotice` о YOLO→COCO преобразовании. Не меняет group/box logic, train/test, app runtime, storage или video retention. Добавлены проверки полей в существующие COCO regression tests и в новые 13 CSV tests. Результат проверить на exact final SHA, включая Android regression CI и real JPG/TXT stage.

---

## 2026-11-20 — проверен пакетный оригинальный Mendeley v6 CSV→COCO без архива 7,21 ГБ

- Родительский Draft #285 SHA `bd4d4592f2973503130ba1bef9719c140aca8eb3`: real JPG+YOLO #44750045961 **completed/success**, Android APK #44750045958 **completed/success**, isolated archive #44750045874 **skipped**.
- Новый Draft #286 branch `feat/video-mendeley-v6-bounded-csv-staging-2026-11-20`: `tools/stage_mendeley_v6_public_csv.py` безопасно обрабатывает **до 16** JPG+YOLO TXT пар из переданного Work CSV (8 допустимых оригинальных ulейных групп, UUID v6 public-files URLs, 64 KiB CSV, 8 MiB JPG/256 KiB TXT/96 MiB aggregate, ограниченные HTTPS redirects, Pillow full decode 1920×1080, опциональные SHA pins, запрет duplicate JPEG, no overwrite JSON).
- 13 synthetic security/regression tests; [isolated CI #44756273493](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44756273493) **completed/success** на code SHA `2406506f583a4f8116496da0b80371f6e8eb25de`: настоящий SHA-pinned файл `20230609a1002.jpg` + TXT получены, полная JPEG декомпрессия прошла, создан и проверен временный COCO `unassigned` (1 изображение, 7 пчёл bbox), затем удалён с runner. Binary не сохранялись в GitHub artifacts.
- Добавлены CSV fixture с оригинальными URL+SHA (только metadata) и workflow `.github/workflows/stage-mendeley-v6-public-csv.yml`; детали `docs/VIDEO-MENDELEY-V6-BOUNDED-CSV-STAGING.md`. После документационных коммитов проверить CI именно на итоговом SHA.
- **Следующий вход:** получить через Work CSV оригинальных JPG/TXT с нескольких разных `_bee_...` серий. Без дополнительных ссылок новая реальная CI проверила только **одну** пару; 2-group проверка synthetic, не independent holdout. После проверки реальных групп/source sessions перейти к достаточно полному датасету, лицензированному компактному detector, реальному Android offline in/out benchmark.
- Нет обученной модели, реального подсчёта направлений, Android physical validation или разрешения удалять original видео. `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. Main, production, IndexedDB и приватные файлы пользователя не изменялись. Draft PR не merge.

---

## 2026-11-20 — первый Mendeley v6 original JPG полностью декодирован без ошибок

- Отдельная **live** job [#44749817855](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44749817855) на SHA `c10c5d6f9d0eac4b780326644c2aa2774af15338`: **completed/success**; 11 Python negative/security tests, SHA-pinned real JPEG+TXT, full Pillow 12.0.0 image decode success `verifiedJpegDecode=true`. Реальные размеры/хеши остались неизменными (940530B/266B, 1920×1080, 7 class=0 рамок). Pillow свободный MIT-CMU, только временный isolated CI, не runtime/Android.
- Исправлено документирование пределов проверки в `docs/VIDEO-MENDELEY-V6-REAL-PAIR-VERIFICATION.md`: полная JPEG декомпрессия **не** доказывает точность bbox, независимость исходных видео, модель или локальное распознавание. Для обучения и unbiased holdout всё ещё требуется больше оригинальных source groups/session information.
- Текущий Draft #285 содержит код, тесты и документы; final CI на актуальном документационном SHA нужно проверить отдельно. `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. Пользовательские медиатека/БД/main/production не менялись.

---

## 2026-11-20 — оригинальные Mendeley v6 JPEG/TXT реально получены и импортированы (первая пара)

- После Draft #284 (публичный metadata API 6×401), пользователь через Work передал **публичные прямые ссылки** на `detection/_bee_20230609a/images/20230609a1002.jpg` и matching `labels/20230609a1002.txt`; пароль не нужен. Это не архив `Download All` и не доступ к пользовательским данным.
- В отдельном Draft #285 код `tools/verify_mendeley_v6_public_pair.py` и isolated GitHub job [#44749236895](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44749236895) реально скачали лишь JPG=940530 байт SHA256=`dcccf2db87e3f964870cfd84a65ad0ba9e81e992194b8f2fa18c16107fea41f3`, TXT=266 байт SHA256=`ab25e4c0d29898983b78cc8241271ca4a66095332c32c8f0d29aab68d32f68d5`. JPEG header 1920×1080; **7** bee YOLO bbox; существующий `build_unassigned` успешно преобразовал 1 реальную пару в COCO с group `_bee_20230609a`. Это не семь прилётов/вылетов.
- Добавлено SHA pinning обоих реальных файлов, 11 synthetic negative/security tests, Node CI bridge, отдельный workflow real pair; повторная live pinned job [#44749468016](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44749468016) **completed/success**. Нет полного JPEG-decode и визуальной проверки bbox, source recording/video session mapping, всей выборки или обучения. Изображения не сохраняются в репозитории/артефактах; `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`.
- Новый документ `docs/VIDEO-MENDELEY-V6-REAL-PAIR-VERIFICATION.md`; следующий шаг: получить реальные image+YOLO ссылки других **улейных групп**, определить исходные session IDs, законный полный train/validation/test и обучить действительно работающую модель. После документационных коммитов проверить exact final SHA/CI. Main/production/IndexedDB/private Android media, merge не менялись.

---

## 2026-11-20 — основной этап Mendeley v6: проверены реальные ответы API, требуется исходный образец

- Родительский Draft #283 final HEAD `a256f63af289864f4dc3924eb9d805b29c58d66f`: Android #44744928807 **completed/success** (регрессии и Debug APK), isolated #44744928737 **skipped**. Ни обучение, ни физический Android inference ещё не выполнены.
- В новом Draft #284 на code SHA `16440cb7587830d59e9788261e5ee67372926c9e`: бесплатный metadata-only GitHub workflow [#44745796484](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44745796484) **completed/success** по 11 mocked regression tests и 6 HTTP GET; все 6 публичных metadata API Mendeley v6 реально ответили **401**. Этот `success` НЕ означает успешного доступа к данным. ZIP, JPEG, TXT, MP4 не скачаны; защищённые или платные механизмы не обходились.
- Документирован `docs/VIDEO-MENDELEY-V6-ACCESS-AUDIT.md`: официальный original v6 и CC BY 4.0 отделены от Roboflow зеркала v5 с переработкой/аугментациями и потенциальным train/test leakage. Следующий необходимый вход: пользователь скачивает через браузер исходный `detection` и присылает минимальный ZIP с 2–3 image+YOLO TXT парами вместе с именами каталогов, либо screenshot ошибки доступа. Без настоящих байтов нельзя утверждать, что importer проверен на v6 или что можно приступать к настоящему обучению.
- Дальше: сверить фактический layout/имена, настроить importer, проверить права/атрибуцию и video session independence, затем grouped holdout, лицензированное обучение, ONNX offline Android и реальное отслеживание crossing. `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`; main/production/пользовательские видео не изменены.

---

## 2026-11-20 — CI нового Mendeley v6 importer: exact code HEAD success

- Draft PR #283 code/test+docs SHA `b19a22346420975e5fe6c07ccb9f616b07d0e9aa`: Android workflow [#44744618460](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44744618460) **completed/success** (Python Mendeley YOLO synthetic cases через Node, общая регрессия, Debug APK build/upload); isolated #44744618463 **skipped**, не success. После обновления оперативного журнала HEAD меняется, его CI нужно проверять отдельно.
- Исходный Mendeley v6 dataset `10.17632/8gb9r2yhfc.6` — публичная карточка CC BY 4.0, но API требует авторизацию (401), а альтернативный автоматизированный браузер оказался платным/недоступным: **платные лимиты не использовались и не подключались**. Реальные файлы / labels / исходные video SHA не скачаны и не проверены. Ни обучение, ни ONNX, ни физическое Android распознавание не состоялись.
- Главный следующий шаг: бесплатно и законно получить проверяемый реальный data archive/list, скорректировать локальные пути только по реальным байтам, затем независимый split по подтверждённым улейным видеосессиям и benchmark. Разрешение на удаление originals остаётся false.

---

## 2026-11-20 — переход к основному detector dataset: Mendeley v6, восемь ульев

- Родительский Draft #282 exact SHA `543b22a7e8b304ac4f517ef1d618a3b486363639`: Android #44743618873 **completed/success** (регрессии, debug APK, upload); isolated #44743618926 **skipped**. Проверка не подтверждает реальный inference.
- Публичный Mendeley dataset v6 DOI `10.17632/8gb9r2yhfc.6` на карточке имеет **CC BY 4.0** для данных (отличать от CC BY-NC-ND 4.0 на отдельной статье). Реальная задача **Apis mellifera у летка**: 7200 размеченных кадров 8 групп, tracking/behavior 17162 tracks/21946 frames, pose 400, segmentation 2300. Сверено по официальным карточке Mendeley и публикациям. API Mendeley v6 без auth возвращает 401; реальные архивы/images/labels/source video SHA **не проверены и не скачаны**.
- В отдельной ветке `feat/video-mendeley-v6-yolo-staging-2026-11-20` добавлены offline `tools/prepare_mendeley_v6_yolo_unassigned.py`, 11 Python synthetic tests, Node CI bridge и `docs/VIDEO-MENDELEY-V6-DETECTION-TRAINING-PATH.md`. Проверяет YOLO single-class пары, геометрию bbox, фактические SHA image, sourceCollectionGroups из опубликованной таблицы. Результат только `unassigned`, не обучает и не назначает независимый split.
- Следующий приоритет: подтвердить фактическую структуру/байты/атрибуцию Mendeley v6 и принадлежность исходным видеосессиям; затем grouped train/val/test, обучение лицензированного detector (рассмотреть YOLOX Apache 2 с нуля), ONNX/WASM offline Android и независимый test направления in/out. Оригиналы пользователя не тронуты, cleanup blocked; main/production/merge без изменений. Для новой ветки проверить CI exact SHA.

---

## 2026-11-20 — аудит ссылок и замены файлов staging source video

- Родительский Draft #281 на SHA `e6ee7022b504fe85cdefee621d3c2c5da95da65b`: Android workflow #44742584138 **completed/success** (регрессия, Debug APK, upload); isolated #44742584105 skipped. Это не тест реальной модели и не подтверждение происхождения кадров.
- На отдельной ветке `fix/video-source-file-links-race-2026-11-20` усилен `tools/verify-local-source-recordings.mjs`: запрет symlink-корня, hardlink-видеофайлов, NUL в пути, повторная сверка dev/inode/mtime/ctime/link-count/path после read-only хеширования. Добавлено 4 synthetic regression tests.
- Это защита controlled staging, а не атомарный файловый snapshot. Права на исходные видео и достоверная связь кадр→исходная запись не подтверждены. Флаги train/model/recognition/cleanup всё ещё false. Нет доступа к пользовательской медиатеке, изменений IndexedDB, production, main или слияния.
- До завершения задачи: CI на точном SHA нового Draft. Затем независимое происхождение кадров, лицензии, реальное обучение и физическая проверка Android.

---

## 2026-11-20 — составной read-only provenance gate без обхода COCO/manifest

- Родительский Draft #280, итоговый SHA `53f8b83fa3c9b6c53e0b8b564e3c69eb3b4414e0`: Android #44742087683 **completed/success** (regressions, Debug APK build/upload); isolated #44742087281 skipped.
- Отдельная ветка `test/video-joined-provenance-gate-2026-11-20` поверх #280: `tools/inspect-local-source-bundle.mjs` обязательно объединяет сначала COCO/manifest SHA/group consistency, затем реальное read-only хеширование staging-видео. Добавлены `tests/inspect-local-source-bundle.test.mjs` (8 синтетических случаев), `docs/VIDEO-JOINED-LOCAL-PROVENANCE-GATE.md`.
- Все `unassigned` возвращают заблокированный результат без чтения файлов. Для корректного structure+file hash результаты не подтверждают ни реальные frame→recording происхождение, ни лицензию, ни independence, ни обучение/Android inference/cleanup: все authorized/verified флаги false. Main/production/IndexedDB/private media не изменены.
- Требуется exact HEAD CI нового PR; далее — аудит прав и независимое документальное подтверждение связи реальных кадров с исходным видео, прежде чем train/validate/test.

---

## 2026-11-20 — PR #280: реальные source SHA проверены тестами, исправлена фикстура

- Начальный HEAD `8e1ed24b17600f76aeb6d839b7870f1e6773dc45`: Android workflow #44741716932 **failure** — 1132/1133 tests, единственное падение: тест ожидал mismatch size, но `original` и `modified` имели одинаковую длину и корректно давали `source_hash_mismatch`. APK в этом запуске не собирался.
- Изменена только синтетическая фикстура `tests/verify-local-source-recordings.test.mjs` (подмена теперь действительно меняет размер). Исправленный code/test SHA `ae7e01b9812ecac8148057481ce1b6d88826e856`: [Android #44741869337](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44741869337) **completed/success**: regression tests, Debug APK build и Upload APK успешно; isolated #44741869430 skipped.
- Текущий инструмент остаётся локальным staging read-only хешированием; юридическое подтверждение источника/права на кадры, модель и реальный Android inference отсутствуют; удаление оригиналов запрещено. После этого docs-only обновления CI итогового HEAD требует отдельной сверки.
- Главная следующая задача: независимое подтверждение соответствия image→source video/session и прав конкретных файлов, затем лицензированное обучение и физическая проверка. Не сливать Draft PR, main и production не изменены.

---

## 2026-11-20 — staging-only проверка реальных байтов исходных видеозаписей

- Проверен родительский Draft PR #279: `e9013c1a67650720c605c0a503afdc85cc4eb4db` Android #44740891761 **completed/success** (регрессионные тесты, debug APK build и upload); архивный #44740892010 skipped. Новая независимая ветка поверх #279: `test/video-physical-source-sha-verification-2026-11-20`.
- Добавлены `tools/verify-local-source-recordings.mjs`, `tests/verify-local-source-recordings.test.mjs` (14 синтетических offline regression cases) и `docs/VIDEO-LOCAL-SOURCE-RECORDING-HASH-AUDIT.md`. Явно предоставленные staging-файлы открываются только read-only, ограниченный потоковый SHA256, запрет symlink/path escape/дублей. Файлы камеры/пользовательской пасеки не используются.
- `localBytesMatchDeclarations` **не** удостоверяет связь кадров с исходной видеосессией или лицензию. `sourceIdentityVerified`, `licenseVerified`, `trainingAuthorized`, `modelApproved`, `recognitionSucceeded`, `cleanupAuthorized` остаются false. Никакого удаления оригиналов.
- Требуется CI на точном HEAD нового Draft и аудит подлинного frame→recording mapping, прежде чем разрешать обучение. `main`, production, IndexedDB, реальные видео не изменены.

---

## 2026-11-20 — SHA исходной записи обязателен для назначения train/test

- На основе Draft #278 создана независимая ветка `test/video-source-recording-sha-holdout-2026-11-20`. Изменены `tools/inspect-source-session-manifest.mjs` и `tests/source-session-manifest.test.mjs` (добавлено 6 негативных/позитивных случаев, всего 20).
- Для assigned кадра теперь требуется заявленный `sourceRecordingSha256`; одна запись под разными именами/в разных splits отвергается; одна session ID не может менять recording hash. `unassigned` требует `null`. Это проверка внутренней согласованности **заявлений**, не реальное хеширование видеобайтов, не доказательство лицензии/распознавания/очистки.
- Дополнена документация и исследование статьи 2026 года про Apis mellifera у летка (11 исходных семей, 1003 изображений, 22529 bbox). Первичные файлы/права/manifest пока не проверены.
- На кодовом HEAD проверить CI regression + Android Debug APK. Следующий шаг: установить реальное video SHA и право использования, провести независимую оценку; не обучать/не удалять оригинал до разрешённых испытаний. Main/production не менялись.

---

## 2026-11-20 — новые открытые альтернативы для видеодетекции: права и species gate

- Родительский Draft #277 tested final head `d4ce6d2147f8c03dd7bd558b1588f10bfcaa53fe`: Android #44740273262 **completed/success** (регрессионные тесты, сборка Debug APK); isolated #44740273459 **skipped**. Сборка — не доказательство ML/Android inference.
- Документальная ветка поверх #277: `docs/VIDEO-OPEN-BEE-DATASET-CANDIDATES-2026-11-20.md`. Researchdata.edu.au описывает Monash Australian Native Bee dataset с CC BY 4.0 (3277 детекционных кадров, 16 видеоклипов; Tetragonula carbonaria, не Apis mellifera) и Honeybee video tracking data с CC BY 4.0 (медоносные пчёлы на цветах, не вход в улей). Права на конкретные файлы/веса и source-session SHA манифесты не проверены; ни один набор не утверждён для обучения.
- Следующий шаг: первичные DOI страницы/actual license и исходная связь каждого кадра с видеозаписью. До подтверждения целевого Apis mellifera летка и Android offline оценки `modelApproved=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. No main, user media, production, merge.

---

## Проверка CI точного SHA #277 и права BEE24 (2026-11-20)

- Проверен code+docs SHA `f779b7fc93d7a5b11e6ce92114bd1f8dde224d1a`: Android workflow #44739831967 **completed/success** — регрессионный тестовый шаг, сборка Debug APK успешно; isolated #44739831958 **skipped**. Это доказательство сборки, не Android inference или подтверждение лицензии; после нового документального коммита требуется отдельная сверка нового HEAD.
- Аудит BEE24: 36 видео и 446908 annotations подтверждены официальным сайтом; лицензия на сам набор на странице не указана. MIT в GitHub TOPICTrack относится к коду репозитория и не доказывает лицензию dataset/weights. VnBeeTracking ограничен academic/non-commercial; LILA не имеет доказанного image→source-session mapping. Ни один вариант ещё не разрешает переход к реальному обучению и удалению пользовательских оригиналов.
- Следующий приоритет — подтверждение прав и происхождения первичных видеосессий; все флаги модели/cleanup остаются false, `main`/production/IndexedDB без изменений.

---

## 2026-11-20 — большой этап: офлайн-проверка source-session манифеста (staging)

- Ветка `test/video-source-session-manifest-gate-2026-11-20` основана на Draft #276, не меняет `main`. Добавлены `tools/inspect-source-session-manifest.mjs` и `tests/source-session-manifest.test.mjs` (14 случаев), документ `docs/VIDEO-SOURCE-SESSION-MANIFEST-INSPECTOR.md`.
- Валидатор проверяет полное соответствие SHA изображений из unassigned COCO, отсутствие дублей и протечки одной заявленной видеосессии между выборками. Заявление provenance **не считается доказанным**: все флаги независимого holdout, лицензии, обучения, модели, распознавания и очистки всегда false. Продукт/IndexedDB/MediaStore/Service Worker не затронуты.
- Внешняя сверка: LILA подтверждает тип/лицензию набора, но не source-session mapping; VnBeeTracking содержит 5 видео и ground truth, однако ограничен academic noncommercial; BEE24 содержит 36 видео, лицензию конкретного архива предстоит проверить. Эти источники не утверждены для обучения.
- Тесты на точном SHA и PR CI подтвердить после push. Следующий этап — независимое подтверждение прав и видеосессий реального набора либо законно лицензированный альтернативный источник; не активировать модель/удаление видео до реального Android распознавания.

---

## Контрольная точка — provenance кадров LILA, 2026-11-20

- #275 exact HEAD `5f12439cd21bc9d8c98b2b2c06c76e8ffdbfb3b9`: Android run #44738340971 completed/success; isolated #44738340889 skipped. Реальная Android inference и обучение не проверялись.
- В отдельной документационной ветке поверх #275 добавлен `docs/VIDEO-LILA-SOURCE-PROVENANCE-GATE.md`: подтверждённый публичный формат/лицензия LILA отделены от неподтверждённого image→source-video/session provenance. Без реального mapping все кадры остаются `unassigned`; нельзя создавать фиктивный independent split.
- Следующее действие: найти первичные метаданные BeeLivingSensor с доказуемым соответствием image SHA исходным видеосессиям либо выбрать альтернативный набор с проверяемыми source groups. Программный код, физические пользовательские видео, cleanup, main и production не затронуты. Документальный PR Draft, никаких новых тестов поведения; CI на итоговом SHA проверить отдельно.

---

## Итог: Draft #275 PNG-aware COCO, проверенный кодовый SHA (2026-11-20)

- Draft #275 `fix/video-voc-png-unassigned-coco-2026-11-20`: код/тесты/документация SHA `d56b0fe48eb531da3a0d0615dd903d1ed002092c`, Android workflow [#44738077642](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44738077642) **completed/success** (Node + Python regression suite, debug APK build/upload); isolated #44738077741 **skipped**. Отдельного теста на реальном физическом Android не было.
- Исправлена обработка `tools/convert_bee_voc_unassigned.py` для PNG+JPEG изображений с XML, PNG signature/IHDR/CRC, dimensions и SHA исходных image bytes; добавлены негативные tests (12 тестов конвертера). На действительном LILA каталоге `4993 XML = 3752 JPEG +1241 PNG`, но **полный архив и все изображения не скачаны**, реальные метки не проверены независимо.
- Всё остаётся `unassigned`, source-video/hive group IDs и законный независимый train/test не подтверждены. Сохранена блокировка `trainingAuthorized`, распознавания/cleanup. Нет реальной обученной модели, ONNX и Android hardware inference.
- После этой записи новый docs-only HEAD требует самостоятельной CI сверки; не переносить success прежнего SHA автоматически. Следующая главная задача: найти подтверждённый provenance для исходных видео и прав/атрибуций, затем воспроизводимое легальное обучение детектора и реальную оценку. Все PR Draft, main/production/user video originals без изменений.

---

## Контрольная точка — исправлен VOC→COCO для 1241 реальных PNG LILA (2026-11-20)

- Parent Draft #274 code SHA `211264fa58ff808a94150def4150bea2f42d845e`: public 5-pair workflow #44737529123 **completed/success** (8/8 Python tests, реальная 5-парная sample включая PNG 200x200), Android #44737529117 **completed/success**, isolated #44737529155 **skipped**. После документальных коммитов HEAD #274 изменился, новые CI сверять самостоятельно. Real ZIP catalog: 4993 XML, 3752 JPG и 1241 PNG, все без-JPEG XML соответствуют PNG.
- Новая отдельная ветка `fix/video-voc-png-unassigned-coco-2026-11-20` поверх #274: исправлен `tools/convert_bee_voc_unassigned.py` (строго один JPG/JPEG/PNG на VOC, JPEG SOF или PNG signature+IHDR+CRC, размеры XML, реальный SHA256). XML без bbox сохраняется как отрицательный unassigned COCO кадр; никакого sourceVideoId/train/test не выдумывается. Добавлено 4 Python regression cases (всего 12) и Node bridge обновлён, `docs/VIDEO-LILA-VOC-UNASSIGNED-COCO.md` обновлён.
- Новый PR требуется оформить и проверить на exact SHA (npm regressions + Android debug build). Никакой реализации real YOLOX train, ONNX/hardware inference, all-copy cleanup или доступа к пользовательским видео/production. Главный следующий шаг после CI — документально установить независимые source-group кадры для честного train/validation/test или оставить набор unassigned.

---

## Контрольная точка — LILA: все 4993 XML имеют JPEG или PNG, пять реальных пар проверены (2026-11-20)

- Research run #44737529123 на code/test SHA `211264fa58ff808a94150def4150bea2f42d845e` **completed/success**, 8/8 Python тестов, 5 реальных JPG/PNG+VOC пар, Range только 3579721 bytes. GitHub ZIP catalog run #44737260472 подтвердил 9986 entries: **4993 XML, 3752 JPG, 1241 PNG**. Ранее 1241 «missing JPEG» оказались одноимёнными PNG. Недопустимо автоматически считать этот набор только JPEG.
- Реальные пять пар: JPEG 2560×1920 bee 6; JPEG 80×168 без bbox; JPEG 2560×1440 bee 4; PNG 200×200 без bbox; JPEG 180×300 pollen 2. Поддержка PNG added via signature/IHDR/CRC; JPEG SOF validation. Это **не** full-image decode и не подтверждение независимости съёмок, не случайная статистически репрезентативная выборка.
- Модуль `tools/sample_lila_five_pairs.py`, `tools/audit_lila_zip_filenames.py`, Python+Node tests, bounded 24MiB research CI, документ `docs/VIDEO-LILA-FIVE-PAIR-SAMPLING.md`. Initial research run #44736918356 failure выявил filetype mismatch; следующий #44737443932 failure выявил устаревший ключ теста, исправленный без ослабления runtime; #44737529123 success.
- Следующая функциональная задача: **PNG-aware локальный Pascal VOC→unassigned COCO** с отрицательными тестами PNG signature/CRC, JPEG и PNG парой, unknown classes, no train/test/cleanup; отдельная Draft после этого PR. Нельзя делать naive split по именам или использовать crop как full entrance frame без ground truth.
- Android CI на точном кодовом SHA и итоговом документальном HEAD сверить отдельно; не переносить успех research на Android. Никакого ML training/ONNX/hardware inference, original video deletion или main/production изменений.

---

## Контрольная точка — выборочная проверка пяти настоящих LILA ZIP JPEG/VOC пар (2026-11-20)

- Parent Draft #273 SHA `79d652d5c15f659a64e236330d8e12c08d2697b5`: Android workflow #44734275672 **completed/success**, isolated #44734275645 **skipped**. Родительский `tools/convert_bee_voc_unassigned.py` остаётся тестируемой офлайн-подготовкой одного COCO `unassigned`, без недостоверных train/test.
- Текущая отдельная ветка `test/video-lila-stratified-sample-2026-11-20` поверх #273: `tools/sample_lila_five_pairs.py`, расширен `BoundedRanges` в `tools/sample_lila_voc_range.py` для строгого явного byte budget <=24MiB; шесть Python fixture tests и Node bridge; отдельный GitHub research workflow `.github/workflows/bee-public-lila-five-pairs.yml`. Выбор 5 разнесённых в отсортированном ZIP каталоге реальных XML/JPG пар, валидация CRC, SHA, имен, размеров, классов. Источниковые видео, даты, ульи этим не удостоверяются; `trainingAuthorized=false`, `cleanupAuthorized=false`.
- `docs/VIDEO-LILA-FIVE-PAIR-SAMPLING.md` фиксирует ограничения доказательств. Новые CI и фактическую доступность этих пяти пар проверить только на точном HEAD нового Draft, не переносить успех #273.
- Full dataset и модели нет, обучение YOLOX/ONNX/Android hardware inference не выполнялись; live user originals, main и production не затрагивались. Следующий шаг: сверить actual CI + sampled labels, затем искать достоверный группирующий provenance исходной съёмки; без него независимый split не создавать.

---

## Итог кода VOC→COCO #273 и точный Android CI (2026-11-20)

- Draft PR #273 code/test/docs SHA `96943c6174cac472868a51ec0acafafe50619227`: Android workflow [#44734022815](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44734022815) **completed/success**, включая общие Node/Python регрессионные тесты, debug APK сборку и загрузку; isolated #44734022821 **skipped**. Это проверка тестового конвертера, не реального обучения модели и не физического Android inference.
- `tools/convert_bee_voc_unassigned.py` + 8 Python тестов/Node bridge завершены. Выход COCO специально помечен `unassigned`: нельзя утверждать train/validation/test без реальных исходных видео/hive/session identities. Никакие JPG пользователей или production данные не использованы, удаление запрещено.
- После этого документационного коммита HEAD изменится; нельзя переносить CI success кодового SHA на новый docs HEAD без отдельной проверки. Следующая задача: подтверждение final HEAD CI, затем фактическое происхождение/атрибуция полного LILA архива и независимое разделение данных, только затем YOLOX from-scratch/ONNX/Android.

---

## Контрольная точка — локальный VOC→COCO без фиктивных train/test splits (2026-11-20)

- Parent Draft #272 final docs HEAD `b974d10c7baef9da91d8ff7a9c60a7872ebdf966`: public VOC+JPEG sample #44733560807 **completed/success** (действительная пара `ML-Data/Chueried_HempBox_1.xml`/jpg, 5 bee, 1920x1080), Android build #44733560908 **completed/success**, isolated #44733561124 **skipped**.
- Создана последовательная ветка `feat/video-voc-to-unassigned-coco-2026-11-20` поверх #272. Новый `tools/convert_bee_voc_unassigned.py` и восемь Python unit tests + Node bridge: read-only локальные Pascal VOC/JPEG пары, JPEG SOF размеры, sha256 настоящих JPEG, строгие bbox/known labels bee/pollen, запрет symlink и частичных/повторных данных. Результат один `COCO unassigned` JSON с `trainingAuthorized=false`, без неизвестных source video ID, train/validation/test не создаются. Нет скачивания 2GB ZIP, модели, сети или записей пасеки. Документ `docs/VIDEO-LILA-VOC-UNASSIGNED-COCO.md`.
- Ознакомились с официальным текстом CDLA-Permissive-1.0 (https://cdla.dev/permissive-1-0/): computational use разрешён, публикация данных требует сохранения attribution, указания лицензии, notices of modification. Источник LILA заявляет эту лицензию, но права всех исходных файлов/достоверность атрибуции ещё не прошли индивидуальный аудит; обучение/redistribution не одобрять автоматически.
- Новый exact HEAD требует CI. Следующее — unit/Android CI, затем фактическое source video/hive provenance для независимых splits и только после этого обучение. `cleanupAuthorized=false`, main/production/user video untouched.

---

## Контрольная точка — настоящая парная LILA JPEG/VOC проверена (2026-11-20)

- PR #272 code/test SHA `d708583c01c99d0979caaa9c530d1dbefe3cd72e`: отдельный research workflow #44733392890 **completed/success**, в нём **10/10 Python tests passed**, GCP Range sample real JPEG/XML: ZIP 9986 entries, 4993 XML, `ML-Data/Chueried_HempBox_1.xml` с 5 размеченными пчёлами, парный `ML-Data/Chueried_HempBox_1.jpg` 1158291 bytes, размеры совпадают 1920×1080 по JPEG SOF и XML. Общий Range-трафик 2126445 bytes, никакого full 2GB архива. SHA XML `eb405f671bc546d8d1cc16f9e97a108896a7984570dd11f01c71f42d30601879`, SHA JPEG `f5e80e1d95d230de30efe6b2fd4a0eaa9338f4c248f1c8d0baa55c028803cb6d`.
- Прежний #272 SHA `ba3b85fc865b533bffe69dd124d2e383037f75d5` получил #44733171812 **success** после исправления fixture и показал настоящий XML. CI Android для текущего code/test SHA необходимо сверить отдельно. После добавления docs изменения не наследуют CI автоматически.
- Лицензионные документы по именам не обнаружены внутри central dir; CDLA Permissive заявлена на LILA website, `licenseVerified=false` до независимого изучения actual rights and attribution. Полный ZIP/все 4993 фото не проверены, JPEG пиксели не декодированы; модель YOLOX не обучена, ONNX/Android physical inference не выполнялись.
- Следующее действие: перейти от проверенного VOC формата к безопасному конвертеру в COCO **без выдуманных идентификаторов исходных видеосеансов**; реальное train/test split только с фактическим источником. Main/user originals/production и deletion не трогать.

---

## Контрольная точка — read-only ZIP central directory + Pascal VOC sample (2026-11-20)

- Parent Draft #271 SHA `ea2c690d16d02bf6376991cfcc8cca13e554c32b`: public LILA header #44732672991 **completed/success** (реальные 64 bytes, HTTP 206, ZIP magic, 2 076 021 293 bytes reported), Android #44732672760 **completed/success**, isolated #44732672727 **skipped**. Образец заголовка не доказывает целостность архива или условия лицензии.
- Новая последовательная Draft ветка `test/video-lila-voc-range-sample-2026-11-20` добавила `tools/sample_lila_voc_range.py`, 7 Python unit tests, Node bridge в регрессионный suite, исследовательский `.github/workflows/bee-public-lila-voc-sample.yml` и `docs/VIDEO-LILA-VOC-RANGE-SAMPLE.md`. Читает хвост ZIP, центральный каталог и максимум одну небольшую VOC XML, сеть ≤4 MiB; при HTTP 200 тело не читается, общий ZIP/JPG не скачивается. Требует exact CI SHA.
- При реальном успехе появится подтверждённый образец структуры Pascal VOC; это не обучение, не проверка лицензии archive files и не модель. Все `licenseVerified/trainingAuthorized/modelApproved/recognitionSucceeded/cleanupAuthorized=false`.
- Следующая задача: CI GitHub на exact HEAD; оценить фактические VOC dimensions/categories, затем отдельный безопасный VOC→COCO импорт для лицензированных реальных изображений. Сохранять original video до доказанного распознавания и all-copy safety. main/production/user data не трогать.

---

## Контрольная точка — альтернатива Mendeley: прямой public LILA ZIP Range (2026-11-20)

- Parent Draft #270 code/test SHA `17e37c5c5febe70d175ed2310746803c7ca989f0`: Android workflow #44732273370 **completed/success** (регрессионные тесты и debug APK), separate isolated #44732273395 **skipped**. Отдельный research CI #44732273439 **completed/failure**: offline tests **8/8 passed**, запрос к Mendeley public REST без OAuth вернул **HTTP 401**. Не считать research CI успешным и не использовать токен/обход контроля доступа.
- Найден другой открытый источник `Boxes on Bees and Pollen`: https://lila.science/datasets/boxes-on-bees-and-pollen — 4993 изображений и ~50000 bbox, архив Pascal VOC XML, карточка с лицензией CDLA Permissive и прямыми публичными ZIP ссылками (GCP/AWS/Azure), размер ориентировочно 2 GB. Это независимый кандидат данных, не готовая модель или проверенная лицензия конкретного ZIP.
- В новой отдельной Draft-ветке `test/video-lila-public-byte-range-2026-11-20` на базе #270 подготовлены `tools/probe_lila_bee_zip_range.py`, 7 Python regression cases, Node bridge, отдельный ограниченный workflow `.github/workflows/bee-public-lila-zip-header.yml` и `docs/VIDEO-LILA-PUBLIC-BEE-DATA-REVIEW.md`. Проверяет реальные первые 64 байта ZIP только если сервер поддерживает HTTP 206 Range; 200 OK **не читает**. Никаких ZIP downloads, данных пользователей или платных API.
- Следующая точка: сверить CI на точном HEAD нового PR и доступность публичного ZIP. Если Range доступен — малый образец настоящих VOC-аннотаций и прав, затем data conversion/train-from-scratch. Если нет — зафиксировать отказ без выдуманных результатов. `licenseVerified=false`, `trainingAuthorized=false`, `cleanupAuthorized=false` во всех ветках.
- Main SHA `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` остаётся неизменённым; все PR Draft, production/user originals untouched.

---

## Контрольная точка — попытка получить Mendeley v6 metadata через отдельный CI (2026-11-20)

- Main подтверждён через GitHub search commits: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`, напрямую не изменялся. Draft #269 SHA `7048610673f882901b364eaafacf7d96ad3f83b4`: Android workflow #44731361433 **completed/success**, isolated #44731361453 **skipped**.
- Попытки получить `https://api.data.mendeley.com/datasets/8gb9r2yhfc?version=6` / zip metadata из локального контейнера вновь завершились DNS-ошибкой, web JSON также недоступен. Реальный архив/веса/лицензии файлов по-прежнему **не получены**.
- В новой Draft-ветке `test/video-public-mendeley-metadata-2026-11-20` добавлены `tools/probe_public_mendeley.py`, 6 Python unit tests, Node bridge `tests/public-mendeley-metadata.test.mjs`, и изолированный public-read-only workflow `.github/workflows/bee-public-dataset-metadata.yml`. Строго фиксированные API, dataset ID/version 6, запрет редиректов, лимит JSON и никогда не скачивать архив. Цель — установить доступность реальных метаданных с GitHub runner, не подменять ими фактический ZIP.
- `docs/VIDEO-PUBLIC-MENDELEY-METADATA-CI.md` документирует проверку и ограничения. CI нового SHA нужно проверить отдельно; возможный недоступный API отразить как failure, не как успех.
- Все результаты сохраняют `archiveDownloaded=false`, `licenseVerified=false`, `trainingAuthorized=false`, `recognitionSucceeded=false`, `cleanupAuthorized=false`. Нет обучения, Android physical inference, user video, merge или production.
- Следующая задача: оценить exact SHA workflow; при успешном metadata query — получить actual public archive и изучить notices/лицензии, только затем датасет и обучение с нуля. При HTTP/DNS failure фиксировать блокер, не выдумывать проверку.

---

## Контрольная точка — публичный ZIP-архив: реальная integrity проверка (2026-11-20)

- PR #268 docs-only head `9aabaeb35892cd042bfe5a88cdde68f155a879b1` оставался Draft, workflow runs на точном SHA не обнаружены. Следующая отдельная ветка `test/video-public-archive-integrity-2026-11-20` поверх #268.
- Прямой доступ к public Mendeley Data API из текущей среды не сработал (DNS/недоступность веб-JSON); фактические архивы v5/v6 не скачаны и реальные LICENSE/README в них не изучены. API официально поддерживает metadata/files/zip endpoints, но это ещё не доказательство получения архива.
- Реализован read-only offline ZIP inspector `tools/inspect_bee_archive.py`: SHA-256 архива и каждого файла, поиск имён лицензий, отклонение traversal/symlink/duplicate/zip bomb/large/corrupt без извлечения. `tests/test_inspect_bee_archive.py` — локальные 6/6 пройдены; `tests/public-archive-inspection.test.mjs` включает Python suite в общее `npm test`. `docs/VIDEO-PUBLIC-ARCHIVE-INTEGRITY.md` задаёт ограничения и порядок проверки.
- Инструмент не подтверждает лицензии автоматически, не предоставляет весов, не обучает модель и не запускает Android inference. CI нового Draft должен быть подтверждён на exact SHA. Нет изменений main/production/пользовательских видео/cleanup.

---

## Проверка итогов Draft #267–#268 (2026-11-20)

- Draft #267 exact SHA `29b4eef274431e4931b212cb70b026cc1da2ba6e`: Android workflow #44730598362 **completed/success** (регрессии, debug APK build/upload); isolated #44730598371 **skipped**. Это относится к новому self-contained COCO export и не доказывает качества датасета/модели.
- Draft #268 docs-only SHA `d1f417d94f64c8f8b49c852b13b354f05eee8925`: на момент сверки **нет workflow runs**; не считать это успешным CI. Дальнейшие docs commits требуют отдельной сверки SHA.
- Практический блокер: до сих пор нет скачанного и проверенного в рабочей среде Mendeley v5/v6 архива и фактической лицензии файлов; обученная модель, ONNX и Android physical inference не существуют. Следующее — secure offline import фактических публичных файлов и обучение без непроверенных base weights.
- Все PR Draft, main/production/user videos нетронуты, cleanup заблокирован.

---

## Контрольная точка — v6 tracking data для леткового распознавания (2026-11-20)

- Исследована публичная карточка https://data.mendeley.com/datasets/compare/8gb9r2yhfc. Версия v6 (DOI 10.17632/8gb9r2yhfc.6) помимо bbox detection/pose имеет 17 162 размеченных треков на 21 946 кадрах и behavior labels, заявлена CC BY 4.0. В отдельной Draft docs-ветке после #267 добавлен `docs/VIDEO-MENDELEY-DATA-V6-TRACKING-AUDIT.md` с задачами detection/tracking, версиями, схемами и ограничениями.
- Не смешивать dataset license CC BY 4.0 и article CC BY-NC-ND, не считать YOLOv8 checkpoint доступным. Оригиналы архивов и разрешения на файлы требуют проверки. Нет реальных файлов датасета, модели, physical Android inference или cleanup.
- #267 исправляет упаковку самодостаточного COCO набора; его Android CI проверять на точном SHA. Документальный этап не даёт права на исполнение модели.
- `main`/production/live видео остаются нетронутыми.

---

## Контрольная точка — исправление критичного COCO export (2026-11-20)

- На базе Draft #266 (`87122acc0974232d71fc30d2620edd222ffc5fe0`, Android #44728661206 **success**, isolated #44728661247 **skipped**) создана отдельная ветка `fix/video-coco-self-contained-2026-11-20`.
- Найден дефект: инструмент выдавал COCO JSON с `images/...`, но сами файлы изображений в output не размещал. Исправлено: сначала SHA-проверка реальных source bytes, затем подготовка staging package, копирование изображений с SHA-повторной сверкой после копирования, запись train/validation/test JSON, публикация целой папки, а при неуспехе очистка исключительно временной генерируемой staging папки. Существующий output не перезаписывается, оригиналы не модифицируются.
- Добавлены регрессионные тесты на self-contained package, incomplete staging, запрет перезаписи, path overlap и duplicate paths. Полный CI нового SHA необходим; предыдущий успех #266 не переносить автоматически.
- Датасет Mendeley v5 имеет публичную карточку CC BY 4.0 / 7200 кадров и отдельную статью CC BY-NC-ND; права именно archive files перед training требуют независимого просмотра. Ни один dataset не скачан, обучение YOLOX, ONNX, Android physical inference/recognition/cleanup не проводились.
- Main, production и пользовательские оригиналы не изменялись.

---

## Контрольная точка — локальный YOLO-to-COCO tool (2026-11-20)

- PR #265 остаётся Draft; на его точном SHA `eaa667452da762fcc0c96dc1b68e0cc3348dda38` workflow runs при проверке не найдены (это не успех). На основе #265 создана отдельная ветка `feat/video-offline-coco-preparation-2026-11-20`.
- Реальный инструмент `tools/prepare-bee-coco.mjs` конвертирует normalized YOLO bbox в COCO train/validation/test JSON из вручную помещённых разрешённых images. Проверяет manifest, изоляцию source video ID/SHA, координаты bbox, реальные SHA-256 байтов изображения и выходы без перезаписи. Добавлены `tests/prepare-bee-coco.test.mjs` и `docs/VIDEO-OFFLINE-COCO-DATA-PREPARATION.md`. Изолированное локальное испытание синтетических данных: **6/6 passed**, общий репозиторный CI нового PR ещё не подтверждён.
- Сверка источников: YOLOX source Apache-2.0; права pretrained checkpoint отдельно неясны (upstream issue #1915). Mendeley Data v5 dataset card CC BY 4.0, статья PMC10831503 CC BY-NC-ND; реальные архивные notices/авторство перед обучением обязательны. Не считать наличие CLI реальным обучением или физическим Android inference.
- Нет скачивания данных, весов, использования видео пользователя, network, production, merge или cleanup. Следующая задача — CI на точном SHA и фактический разрешённый датасет + обучение с нуля / ONNX / измерения.

---

## Контрольная точка — путь к бесплатному детектору без Ultralytics checkpoint (2026-11-20)

- Создан отдельный docs-only этап поверх PR #264: `docs/VIDEO-PERMISSIVE-DETECTOR-TRAINING-PATH.md`. Проанализирован вариант обучения YOLOX (код Apache-2.0, поддержка ONNX) на наборах с заявленной CC BY 4.0 и бесплатном ограниченном Kaggle GPU. Это **не утверждённая модель**, не доказательство лицензии любых весов и не выполненное обучение.
- Условие: сначала реальные права на исходные данные/base checkpoint, затем фактический dataset holdout и ONNX/Android benchmark. Частные пользовательские видео не отправлять на внешнее обучение без отдельного решения.
- DOI 10.1016/j.dib.2024.110060 — пометка CC BY-NC-ND; автоматически не использовать как разрешённый training source.
- Следующая задача: проверить точный CI SHA #264 и завершить gate юридически чистых данных и source provenance, затем практический эксперимент модели на бесплатной инфраструктуре. Нет merge, production, live data, model activation и video deletion.

---

## Дополнение — усиление PR #264, source-video isolation (2026-11-20)

- В той же Draft ветке #264 добавлены обязательные `sourceVideoId` и `sourceVideoSha256` для каждого элемента dataset manifest. Один source video ID или SHA-256 оригинального видео в разных train/validation/test splits блокируется. Дополнены регрессионные тесты на перекрёстный ролик, переименование исходника и отсутствие доказательств.
- Хеш оригинального видео пока декларативен: чтение и повторное хеширование медиа не выполняются, визуальные near-duplicates не обнаруживаются. `independentEvaluationVerified=false`, никаких реальных метрик/признания модели.
- Дальше проверить итоговый SHA #264 в CI, затем изучить лицензированную модель и сформировать настоящее разбиение по роликам. Никакого изменения main, удаления пользовательских видео или production.

---

## Контрольная точка — защита независимости тестового датасета (2026-11-20)

- Проверен Draft #263 exact SHA `201585cb6d90b0916d5862c463142d09fede1b73`: Android #44718074995 **completed/success** (тесты, debug APK, upload), isolated #44718074969 **skipped**.
- Отдельная ветка `test/video-dataset-split-isolation-2026-11-20` создана поверх #263. Новый staging-only `js/video-dataset-isolation.js`, 5 тестов `tests/video-dataset-isolation.test.mjs` и `docs/VIDEO-DATASET-SPLIT-ISOLATION.md` предотвращают exact-SHA cross-split leakage train/validation/test, проверяют ID и наличие наборов. Локальные изолированные 5/5 тестов прошли; общий Android CI нового SHA проверять отдельно.
- Ограничение: близкие кадры и исходные ролики не идентифицируются по одному SHA, поэтому независимость evaluation не подтверждается. Настоящий детектор, лицензия весов, Android physical inference, ledger recognition и cleanup остаются не выполнены. Следующее: сопоставить лицензированный detector и реальные размеченные данные; Android тест без удаления original.
- Нет merge, production, изменения `main` или пользовательских данных.

---

## Результат CI для Draft #262–263 — 2026-11-20

- PR #262 code/test/docs SHA `1ca916dde3268d56408c2430963f9f6462ebb7e9`, workflow [#44717764727](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44717764727) — **completed/success** (regression, Android debug APK build/upload). Isolated #44717764700 — **skipped**.
- PR #263 code/test/docs SHA `a1572a89eda53671059cc7d681e327a821007b85`, workflow [#44717871041](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44717871041) — **completed/success** (regression, Android debug APK build/upload). Isolated #44717871044 — **skipped**.
- Следующий docs-only commit меняет журнал, а не проверенный код. Не утверждать, что новый docs HEAD уже имеет собственный успешный CI. Веса и реальные Android hardware inference не внедрены; delete остаётся заблокированным.

---

## Контрольная точка — модель отчёта Android inference (2026-11-20)

- Поверх Draft #262 подготовлен изолированный модуль `js/android-inference-evidence.js`, тесты `tests/android-inference-evidence.test.mjs` и протокол `docs/VIDEO-ANDROID-PHYSICAL-TEST-PROTOCOL.md`. Требуются модель SHA/версия, Android/System WebView, офлайн-испытание и независимый dataset SHA, latency, TP/FP/FN; отчёт остаётся `physicalTestVerified=false` при любых пользовательских полях.
- Синтетические/облачные отчёты отвергаются, отсутствие детекций не становится успешным распознаванием. Никаких весов/видео/внешних копий не загружено. Дальше — CI этой ветки, подтверждение лицензии реального checkpoint и физический Android эксперимент.
- Все изменения Draft, main/production/данные не затронуты; originals delete заблокирован.

---

## Контрольная точка — screening рисков лицензий (2026-11-20)

- Draft #261 code/test HEAD `5e498e7768515ebc969d8a254602c17d54d78c1f` Android workflow #44716991985 **completed/success**, isolated #44716991947 skipped.
- Поверх него новая изолированная ветка `test/video-license-risk-screen-2026-11-20`: `js/video-license-risk-screen.js`, `tests/video-license-risk-screen.test.mjs`. Screen учитывает риск AGPL/GPL/NC/ND/неопределённых лицензий и Ultralytics YOLOv5/YOLOv8 upstream, не осуществляет юридического допуска даже при Apache-2.0. Требует предварительный provenance completeness gate; не подключён к UI/SW.
- Источники: официальные docs.ultralytics.com/models/yolov5 и /models/yolov8 (AGPL-3.0/Enterprise); карточка maryammeda на Hugging Face декларирует Apache-2.0 и base weights yolov8s.pt. Юридическая совместимость конкретных производных весов не установлена.
- Следующая стадия: CI точного SHA нового Draft; независимая проверка разрешений конкретных весов/датасета и реального Android inference. Нет модели в приложении, удаления видео, main/production изменений.

---

## Контрольная точка — безопасный provenance gate весов (2026-11-20)

- Сверено: PR #260 SHA `8b1ad6906e02e923fe11072c648844c02f07182c` workflow #44715065889 **completed/success**, isolated #44715065942 **skipped**. Сборка/тесты относятся только к этому SHA.
- Новая ветка `test/video-model-license-provenance-gate-2026-11-20` поверх Draft #260: `js/video-model-provenance-gate.js`, отрицательные тесты и `docs/VIDEO-MODEL-PROVENANCE-REVIEW.md`. Gate проверяет только полноту декларации источников весов, upstream, датасета, SHA, задач и ссылок на лицензии; любой результат остаётся `provenance_review_required` с `licenseVerified=false`, `canRunInference=false` и `cleanupAuthorized=false`.
- Кандидат maryammeda/Apiarist содержит Apache-2.0 card, но обучен от yolov8s.pt и стороннего Roboflow dataset; отдельно проверить лицензирование базовых весов, датасета и derivative checkpoint. Кандидат mattnudi пока не имеет подтверждённого права распространения весов. Ни один не одобрен и не импортирован.
- Следующий шаг: CI на точном SHA новой Draft ветки; затем независимая проверка source/license конкретного checkpoint, реальная Android ONNX/WASM performance и quality. Никаких изменений main, production или оригиналов.

---

## Контрольная точка — проверка #260 и аудит весов (2026-11-20)

- PR #259 exact SHA `9f9124c3c0e48e042c74ef3c23f7673018bb25e0`: Android workflow #44714109608 **completed/success** (regression, debug APK build/upload), isolated #44714109686 **skipped**.
- PR #260 первый SHA `2b8aebb612bcb20c54abb62bbff4d5aa723eb0a3`: workflow #44714701652 **failure** — один тест aborted-case не передавал injected clock, поэтому получал `invalid_benchmark_options` вместо `aborted`; Android build/upload skipped.
- Тестовая фикстура исправлена (без изменения runtime) в SHA `0a2ecdfb97cf325f9abf85c3721b1fd29fdcaab3`. Workflow #44714941257 был **cancelled** после дополнительного документационного изменения, это не успех и не failure тестов.
- Дополнен `docs/VIDEO-ANDROID-INFERENCE-EVIDENCE-GATES.md`: реальные опубликованные detector weights `mattnudi/bee-detection` и `maryammeda/apiarist-honey-bee-detector` остаются кандидатами; их веса/обязательства лицензий, ONNX Android экспорт и точность tracking не проверены.
- Финальные CI на текущем HEAD надо сверить отдельно; нельзя объявлять проверку по прежним SHA. Нет активного model inference, ledger-recognition или cleanup. Следующее — licence provenance audit конкретного weight artifact, затем Android benchmark, только после доказанного успеха source-bound recognition.
- `main`, production и пользовательские исходники не изменены.

---

## Контрольная точка — offline inference evidence и synthetic benchmark (2026-11-20)

- Stacked ветка `test/video-offline-inference-benchmark-2026-11-20` после Draft #259. Новый изолированный `js/offline-inference-benchmark.js` и `tests/offline-inference-benchmark.test.mjs` измеряют лишь время выполнения внедрённого synthetic on-device adapter и проверяют fail-closed; ни реального Android inference, ни modelReady/recognitionSucceeded/cleanupAuthorized.
- `docs/VIDEO-ANDROID-INFERENCE-EVIDENCE-GATES.md` фиксирует юридические gates весов, отдельные измерения performance/accuracy и ограничения существующих кандидатов. Honey-Bee-Society/honeybee_ml_v1 — image-level classifier с заявленной Apache-2.0, **не** detector/tracker летка; в приложение не добавляется.
- Следующий шаг: CI нового Draft на точном SHA, затем лицензионно проверенный весовой detector и физическая Android inference-проверка; без реальной модели ledger и deletion остаются fail-closed.
- Никаких production/merge/пользовательских видео изменений.

---

## Контрольная точка — Android WASM prerequisites (2026-11-20)

- Поверх Draft #258 создана отдельная тестовая ветка `test/video-android-wasm-capability-2026-11-20`. Добавлен изолированный `js/android-wasm-capability-probe.js` и отрицательные тесты `tests/android-wasm-capability-probe.test.mjs`: read-only WASM validation, опциональные параметры CPU/RAM/worker; отказ при отсутствии WASM. Любой результат **не означает** модель, разрешение лицензии, успешное распознавание или право удаления оригинала.
- Probe не подключён к `index.html`/SW, не открывает камеру, не читает видео, не выполняет inference, не использует сеть или IndexedDB. Источник/веса honeybee detector пока не подтверждены, физический Android benchmark не проведён.
- Следующий шаг: выполнить CI на точном SHA этого Draft PR, затем проверить licensed weights и реальные Android inference latency/memory/accuracy; до доказательства результата никакой ledger-completed или cleanup.
- `main`, production и пользовательские видео не изменены. Merge/deployment не разрешены.

---

## Итог автономной серии #253–#258, точные проверки (2026-11-20)

| Draft | Code/test SHA, подтверждённый CI | Main Android workflow | Статус |
|---|---|---|---|
| #253 model artifact SHA | 9c87ff1bb188554e819f9f42609aff7451b7256d | #44711962772 | completed/success |
| #254 detection precision/recall | 75204645625eccff236a2d46577e0c0bd82f25a6 | #44712204688 | completed/success |
| #255 calibrated crossing | 3153f5defc073d077ce7fb1d1c7d7f5f2e4828b8 | #44712378396 | completed/success |
| #256 temporal coverage | c326890df2be126b6acb468f2d19bdd6e7926bb4 | #44712876838 | completed/success |
| #257 private camera stage | af39162ca8b7d61af245fd0c733fb351e84d1b75 | #44712840871 | completed/success |
| #258 camera lifecycle errors | 7ec1eb3aa9962548e7471042e6063961e8766ec2 | #44713156358 | completed/success |

- Все перечисленные main Android CI выполнили regression tests, Debug APK build и Upload APK. Все соответствующие isolated archive APK workflows **skipped**, не являются тестом. Некоторые последующие docs-only SHA не имели отдельного workflow: не переносить проверку на них автоматически.
- Первый CI #256 (#44712554823) failure 1035/1036 test-only float assertion; исправлено в #256 и #257 без изменения runtime.
- **Границы:** все шесть PR Draft, у них зависимые base branches; no merge, production, user data changes. Ни одна новая модель не активирована, in-app camera staging не подключена к UI/SW, физический Android тест не выполнялся, старые и новые видео не удалены. Вынесенный в GitHub `best.pt` honeybee model candidate имеет неустановленную лицензию весов; датасетная лицензия не достаточна. Реальная accuracy/tracking не подтверждены, поэтому нельзя подключать `completed`, source-bound ledger и cleanup.
- Следующая безопасная задача: подтвердить веса/лицензию подходящего honeybee detector и Android ONNX inference на реальном видео; затем проверка provenance и всех копий, durable recognition, отдельное контролируемое удаление. Перед **следующим физическим Android тестом** напомнить пользователю заменить тестовый файл на компьютере.

---
## Этап — fail-closed окончание MediaRecorder при ошибке и потере onstop (2026-11-20)

- Зависимая ветка `fix/video-private-camera-lifecycle-2026-11-20` поверх Draft #257. В неактивном модуле камеры исправлены зависания `completed`: при ошибке, invalid chunks, capture timeout или отсутствии `onstop` процесс теперь возвращает явную ошибку, закрывает camera tracks и очищает таймеры. Watchdog явного stop 5 секунд.
- `tests/video-private-camera.test.mjs` дополнен отказом при не приходящем событии остановки, `onerror` и inactive recorder. Документ `docs/VIDEO-PRIVATE-CAMERA-LIFECYCLE.md`. Code/test SHA `7b40d89c1a4a32f312694e5ae12f94a5687597a8`, `2c1bf34a9f4aaad36a44f72e7f692dbd6196b443`; CI нового HEAD ещё не подтверждён.
- UI не загружает модуль; камера на реальном Android не запускалась; нет удаления/модели/production.

---
## Исправление тестового floating-point ожидания PR #257 (2026-11-20)

- Первый CI #256 Android #44712554823 failure: 1035/1036 тестов прошли; единственный test-only дефект был в строгом сравнении `0.3-0.2>0.1`. Изменено ожидание на `Math.abs(gap-0.1)<1e-9`, без изменения production runtime, source identity и delete guard.
- Исправление теста внесено как в #256, так и в зависимую ветку #257 для независимой CI проверки. Результат нового SHA ещё требует проверки.

---
## Этап — закрытая in-app camera recording вместо неконтролируемого picker (2026-11-20)

- На базе Draft #256 создана `feat/video-private-camera-staging-2026-11-20`: неактивный `js/video-private-camera.js`, тесты и документ `docs/VIDEO-PRIVATE-CAMERA-STAGING.md`. По явному вызову API запрашивает getUserMedia без аудио, использует MediaRecorder, возвращает Blob **только в памяти**. UI не подключён, поэтому реальные права камеры и съёмка не запрашиваются.
- В тестах: release stream tracks, empty/permission denial/unsupported MIME, отсутствие Gallery/MediaStore/сети/IDB. Даже successful Blob имеет `externalCopiesVerified:false`, `recognitionSucceeded:false`, `cleanupAuthorized:false`. Никаких источников оригиналов и пользовательских записей не меняет.
- Следующее: Draft PR и exact CI; затем физический тест camera Android и связывание с source SHA/ledger через отдельный согласованный UI и без автоудаления.

---
## Этап — временная полнота tracking evidence (2026-11-20)

- На базе #255 добавлен test-only `js/video-temporal-coverage.js`: без явно заданной policy `maxGapSec/minObservations`, достаточной частоты наблюдений и стабильных track IDs нельзя формально оценить даже временную полноту. Разрозненные кадры в 15/30/45 секунде из минутного видео не подтверждают одной и той же пчелы.
- `tests/video-temporal-coverage.test.mjs`: sparse gap, missing policy, смена ID, timestamps, no UI/network. Даже успешный temporal check возвращает `identityVerified:false`, `recognitionSucceeded:false`, `cleanupAuthorized:false`. Контракт `docs/VIDEO-TEMPORAL-TRACK-COVERAGE.md`.
- Отдельный CI exact SHA требуется. Нет модели/inference, видео пользователя, миграций, удаления/production.

---
## Этап — геометрическая оценка пересечения летка без ложного recognition (2026-11-20)

- Поверх #254 создана ветка `feat/video-entrance-crossing-evidence-2026-11-20`: `js/video-crossing-evidence.js` и unit tests. Без явной калибровки линии, её стороны inside/outside и временно монотонных наблюдений направление не определяется. При неоднозначности (несколько пересечений, точка на границе) — unknown/fail-closed.
- Даже строгое одиночное пересечение на фикстуре — `untrusted_calibrated_crossing`, `directionVerified:false`, `recognitionSucceeded:false`, `cleanupAuthorized:false`. Реальный bee tracker и пользовательская калибровка не подключены. `docs/VIDEO-ENTRANCE-CROSSING-EVIDENCE.md`.
- Новый CI exact SHA требуется. Никаких user files, UI, IDB или production changes.

---
## Этап — offline измеритель precision/recall по размеченным кадрам (2026-11-20)

- На базе Draft #253 создана рабочая ветка `feat/video-detector-benchmark-metrics-2026-11-20`: `js/video-detector-benchmark.js`, `tests/video-detector-benchmark.test.mjs`, `docs/VIDEO-DETECTOR-BENCHMARK.md`.
- Изолированная one-to-one IoU оценка TP/FP/FN, precision и recall per class. Не подменяет `null` на точность 100%, не вычисляет mAP, не оценивает tracking или направление, не активирует модель и выдаёт `modelValidated:false` и `cleanupAuthorized:false` даже на perfect synthetic fixture.
- Требуются GitHub CI и реальный independent holdout licensed dataset для meaningful benchmark. Нет AI model, network, IndexedDB, live video, deletion или migration.

---
## Этап — model artifact preflight по SHA-256 (2026-11-20)

- На базе Draft #252 создана отдельная ветка `feat/video-model-artifact-integrity-2026-11-20`: `js/video-model-artifact.js`, `tests/video-model-artifact.test.mjs`, `docs/VIDEO-MODEL-ARTIFACT-INTEGRITY.md`.
- Проверяется только идентичность локально переданного Blob и заранее ожидаемого SHA-256/bytes. Возвращает `artifactMatches:true` лишь для совпавшего SHA, но **не** разрешает модель, inference, удаление или объявление распознавания успешным. Не подключено в UI/SW, сеть/IDB нет.
- Конкретный кандидат `mattnudi/bee-detection` содержит `best.pt`; у данных Roboflow указан CC BY 4.0, но права на опубликованные веса и архитектуру отдельно не подтверждены. Веса не скачаны и не установлены.
- Тесты нового SHA требуют GitHub CI. Следующее — отдельный gate для доверия к временной разметке и проверка track-quality, не fake success. Не изменялись live originals, main, production.

---
## Этап — аудит свободных bee detection моделей (2026-11-20)

- На базе Draft #251 создана docs-only ветка `docs/video-bee-model-license-candidate-audit-2026-11-20` с `docs/VIDEO-BEE-MODEL-CANDIDATE-AUDIT.md`. Проверены BEE24, научный датасет detection/direction, MIT-код stingless bee, Hive-Cam, Gratheon/BeeAlarmed, ограничения Ultralytics и лицензия runtime ONNX Web.
- Подтверждённой легально доступной Android-совместимой pretrained моделью с готовым bee detection+tracking и направлением летка эти источники пока **не являются**. Не подключать чужой код/weights без source/license/accuracy. Никаких download, платных зависимостей, изменения user data, production.
- Следующее: отдельные датасетные/licensing и Android benchmarking проверки перед on-device inference. Сейчас cleanup blocked.

---
## CI Draft #251 — external Android copies remain unknown (2026-11-20)

- Code/test/docs SHA `7089f978e58422345cb06f5d2ae039cf0e0cb916`: [Android #44710841243](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44710841243) **completed/success** (regressions, Debug APK build/upload); [isolated #44710841400](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44710841400) **skipped**. Не подтверждён физический Android Camera/Gallery behavior.
- Новые видео через File Input получают explicit unknown externalCopyState; никакой автоматической очистки/миграции. Последующие docs-only commits требуют отдельной проверки SHA при необходимости.
- Главный незавершённый технический блок: безопасный бесплатный bee detection model+tracking, модельные веса и лицензия, реальная accuracy на летке, source-bound durable recognition, пользовательская проверка результата, Android ownership и all-copy cleanup. Пока удаления нет.

---
## Этап — происхождение внешних Android видео копий (2026-11-20)

- Поверх Draft #250 создана ветка `fix/video-external-copy-provenance-2026-11-20`. В новых записях леткового видео добавлено только поле `captureProvenance:{source:'file_input_or_external_camera',externalCopyState:'unknown',verifiedAt:null}`. Android File Input не доказывает отсутствие копий Camera/Gallery/MediaStore. Старые записи и IndexedDB schema не меняются.
- UI после сохранения и в списке предупреждает о потенциальных внешних копиях, не обещает их автоматического удаления. Direct delete API остаётся заблокированным.
- `tests/video-external-copy-provenance.test.mjs`, `docs/VIDEO-ANDROID-EXTERNAL-COPY-PROVENANCE.md`. Новый CI требуется отдельно; не менять реальные файлы/копии.

---
## Этап — сквозные safety-инварианты между видео модулями (2026-11-20)

- Следующая зависимая ветка `test/video-end-to-end-safety-invariants-2026-11-20` поверх staging pipeline #249. Добавлен `tests/video-end-to-end-safety-invariants.test.mjs`: целостная проверка запрета fake-completed, direct delete, подмены queue original, возвращаемых прав untrusted draft, отсутствия staging модулей в UI/PWA.
- Документ `docs/VIDEO-END-TO-END-SAFETY-INVARIANTS.md`. Это тестирование API и безопасности, не аппаратное end-to-end и не распознавание. Новый CI ещё не подтверждён; main, production, live originals untouched.

---
## Этап — сквозной staging-only local video observation pipeline (2026-11-20)

- На базе Draft #248 создана ветка `feat/video-observation-pipeline-2026-11-20`: `js/video-observation-pipeline.js` соединяет только два неактивных модуля `PasekaEntranceFramePreparation` и `PasekaVideoModelEvidence` через **внешне внедряемый, ещё не существующий** on-device adapter. Нет UI, службы модели, сети, записи в базу или удаления.
- Перед вызовом adapter и **после** асинхронного inference заново проверяются source video ID/SHA/bytes; mismatch/abort/failed inference возвращают отказ. Валидация модели возвращает исключительно `untrusted_observation_draft`, `recognitionSucceeded:false`, `cleanupAuthorized:false`; data URLs не попадают в result.
- `tests/video-observation-pipeline.test.mjs` проверяет mock positive staging, fake chat, cloud adapter, source mutation during async, abort/error и отсутствие network/DB/browser activation. Контракт `docs/VIDEO-OBSERVATION-PIPELINE-STAGING.md`. Последние code/test SHA: `a8f0e792a6f51f9f18fa63fdde6c56099139ecdc`, `4fe42f366a54b145dc364f9ee226d864143c843d`. CI этого этапа отдельно проверить.
- Никакой поставленной/подтверждённой модели пчёл пока нет, физический Android не проверен. Сохраняется запрет удаления оригиналов.

---
## CI #248 — исправлен ложный запрет in-memory Set.add (2026-11-20)

- Первый HEAD `0803b91559fa36484c8e4563d7b582c3e60a0ee4`: Android #44709983851 **failure**, 1004/1005 regression tests passed, APK skipped. Тест ограничения сетевых/DB операций ошибочно счёл `Set.add()` вызовом IndexedDB `.add`.
- Исправлен только тест `tests/video-model-evidence.test.mjs`, SHA `cbb096c1b51b2b6068922b885791c6f3df3dec60`: он теперь явно ищет fetch/XMLHttpRequest/indexedDB/transaction/objectStore/localStorage/sendBeacon. Код модуля не менялся. CI нового SHA требуется отдельно.

---
## Этап — валидация недоверенного результата модели видео (2026-11-20)

- После проверенного Draft #247 открывается ветка `feat/video-model-evidence-contract-2026-11-20`: test-only `js/video-model-evidence.js`, `tests/video-model-evidence.test.mjs`, `docs/VIDEO-INFERENCE-PROVIDER-EVALUATION.md`.
- Не доверять текстовому Worker, JSON без source SHA, дублированным трекам, неподтверждённой модели. Контракт выдаёт только `untrusted_observation_draft`, `reviewRequired:true`, `recognitionSucceeded:false`, `cleanupAuthorized:false` даже при формально валидном payload. Нет реального detection, AI подключения, сети, изменения базы/видео.
- По актуальным официальным документациям технический кандидат — ONNX Runtime Web WASM, но без весов, проверки модели, лицензии и Android benchmark выбор не активирован. MediaPipe возможно, Ultralytics AGPL требует соблюдения условий; бесплатные introductory credits не подходят.
- Следующий шаг — Draft PR и CI точного HEAD; затем отдельная валидация model readiness/параметров provider, без превращения draft в распознанный результат.

---
## Проверенный CI — защита переходов очереди видео (2026-11-20)

- Draft #247: исправленный code/test SHA `95c9eb7e313f0377b016984e793f07083c6d01be`, документальный PR HEAD после фиксации первого CI `811a20fcd61bd6ae20f594fe5ca0c071f8392351`. На HEAD [Android #44709298158](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44709298158) **completed/success**: Run regression tests, Build debug APK, Upload APK successful. [Isolated APK #44709298159](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44709298159) **completed/skipped**.
- Первый GitHub #44709135245 **failure**, 999/1000 тестов: stale assertion ожидал `transition_not_allowed` вместо `recognition_evidence_required`; исправлен исключительно test-only SHA `95c9eb7e...`.
- Source identity/Blob/SHA cannot mutate via queue `details`, completed remains blocked. No recognized result, no AI endpoint integration, no video deletion, no live data/migration, no merge/production. Последующие docs-only commits не считать тестированными на новом SHA автоматически.
- Следующий блок: оценка реального бесплатного video recognizer (возможность браузерной/Android offline inference или строго опционального бесплатного сервиса), его документированная способность распознавать bees/directions/tracks, источник подписи результата, интеграция с durable ledger, all-copy Android cleanup только после независимой верификации.

---
## CI PR #247 — устранена устаревшая проверка ошибки перехода (2026-11-20)

- Первый SHA `f810590d40fbe516e53e691952a6a55727d1a889`, GitHub Android workflow #44709135245 **failure**: 999/1000 тестов passed; единственный старый тест ждал `transition_not_allowed` для `uploading→completed`, новый fail-closed код правильно возвращает `recognition_evidence_required`. Debug APK и upload были skipped.
- Исправлен только test expectation в `tests/entrance-analysis.test.mjs`, SHA `95c9eb7e313f0377b016984e793f07083c6d01be`. Рабочий код source-integrity guard не менялся. Повторить regression и Android Build/Upload на новом точном SHA; до этого не заявлять success.

---
## Этап — сохранность ID/Blob при переходах очереди видео (2026-11-20)

- На основе Draft #246 создана ветка `fix/video-queue-source-integrity-2026-11-20`. В `js/entrance-analysis.js` защищён `transitionVideoQueue`: из `details` больше нельзя подменить `id`, `hiveId`, `bytes`, `blob`, `blobSha256`, result/cleanup flags, а переход в `completed` без доказанного video recognizer безусловно отклоняется с `recognition_evidence_required`.
- `tests/entrance-analysis.test.mjs` проверяет прямую попытку подмены original/source и fake completed; `docs/VIDEO-QUEUE-SOURCE-INTEGRITY.md` фиксирует границу API. Кодовый SHA `f16e38b759115eff60157ea16d1dbb8d1d2db98a`, тестовый SHA `4066397205cd48551595b0b7550ca2b7ca70c2ef`.
- Нет активного распознавания, нет IDB writes, изменений пользовательских данных, удаления/публикации. Новую ветку необходимо оформить Draft PR и проверить CI точного HEAD.

---
## Проверенный CI — staging локальных кадров и fail-closed delete helper (2026-11-20)

- Draft #246 проверен на code/test/docs SHA `9ca75dfd17bbddc53ff4f5aff0031f917c666b6f`: [Android #44708736344](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44708736344) **completed/success** (regression tests, Build Debug APK, Upload APK); [isolated APK #44708736326](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44708736326) **completed/skipped**. Physical Android не проверен.
- Препроцессор не подключён в UI, не выполняет распознавание и не даёт право на удаление; баг legacy `canDeleteVideoOriginal` исправлен безусловным fail-closed.
- Следующий этап — безопасный контракт взаимодействия с реальным распознавателем. Текущий текстовый Worker не годится как доказательство распознавания кадров. Без подтверждённого бесплатного provider, тестов Android и source-bound ledger не включать `completed` или удаление.
- Новые документационные коммиты после code SHA проверяются отдельно; никакого merge/production/живых оригиналов.

---
## Этап — fail-closed legacy deletion helper и локальные временные кадры (2026-11-20)

- Поверх Draft #245 создана ветка `fix/video-preprocessing-failclosed-2026-11-20`. В `js/entrance-analysis.js` неавторитетный helper `canDeleteVideoOriginal` теперь всегда отказывает; отдельный `deleteEntranceVideoBlob` по-прежнему блокирован. Исправлена регрессия в `tests/entrance-analysis.test.mjs`.
- Новый `js/entrance-frame-preparation.js` выполняет SHA/size/source ID preflight и локально декодирует 2–4 JPEG кадров из Blob в памяти, очищает object URL/canvas, не делает сеть/IDB/UI, никогда не выдаёт `recognitionSucceeded` или `cleanupAuthorized`. Это **staging-only**, не видеоаналитика и не интеграция распознавания.
- `tests/entrance-frame-preparation.test.mjs`: offline mock decoder, SHA mismatch, invalid source, abort, JPEG, cleanup, no network, no production load. Документ `docs/VIDEO-FRAME-PREPARATION-STAGING.md`. Последние code/test SHA: `b24df08e8180f9010ee6cf3e4e9f470c723ccfe4`, `0ae28bec72c664685b305b29126cb675aa12b01a`, `2bb0514966c8d7c7cee2265654ada7bfb0bf41f4`, `0eaccafc096bb8c12ec47c789e6c8aff8f51d257`.
- CI на новом HEAD ещё не подтверждён. Следующий шаг: открыть зависимый Draft PR и проверить полный Android workflow и regressions; затем лишь проектировать/проверять реальное video→inference→ledger. `main`, production, реальные видео не менялись.

---
## CI PR #245 — UI не выдаёт статус очереди за распознавание (2026-11-20)

- Проверенный code/test SHA `4a937900ec140c10624db5a04f92fe51c28cefed`; [GitHub Android workflow #44707836309](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707836309) **completed/success**: regression, Debug APK build, Upload APK успешно. [Isolated archive APK #44707836696](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707836696) **skipped**.
- UI-путь для `status='completed'` теперь выводит «Результат распознавания не подтверждён». Файл, статусы в БД, очередь и контроль удаления остались нетронутыми. Это не реализация распознавания и не proof Android physical camera.
- Аудит `cloudflare/worker.js`: текущий Worker принимает JSON `question/context/history`, отправляет текстовые messages в Workers AI и возвращает только `{answer,provider,model}`; действующего video-frame recognition endpoint/подписанного результата нет. Не считать этот ответ доказанным completed. Следующий приоритет — отдельный безопасный план и реализация video→frames→result с точной проверкой источника, бесплатной квотой и физическим Android-тестом. До этого delete blocked.
- Новые docs-only коммиты после проверенного code SHA требуют отдельной проверки при необходимости; никаких merges, production, пользовательских файлов не меняли.

---
## Контрольная точка — честный статус видео летка в UI (2026-11-20)

- На базе #244 создана отдельная рабочая ветка `fix/video-entrance-unverified-status-2026-11-20`. В `index.html` статус `entrance_media.status==='completed'` больше не выводит ложное «Анализ завершён»; вместо него «Результат распознавания не подтверждён». Реального подтверждённого распознавания в этой цепочке пока нет. Показ очереди и видео, блокировка удаления, запись исходников не затронуты.
- В `tests/entrance-video-manual-delete-guard.test.mjs` добавлен отрицательный UI-regression тест на старую надпись и сохранение предупреждения об отсутствии сервера и запрета удаления.
- Code SHA `0604edf41b9743fc2d76e24d978fc10da0d5a8c2`, tests SHA `23a79a5cb1deb2f0754c6993870e8cc3aca1d6e6`. Новая ветка требует отдельного CI. Никакого признания `completed` без ledger, подключения AI, auto-delete, changes production.

---
## CI PR #244 проверен на точном SHA (2026-11-20)

- Code/test/docs SHA `abcd5d3a34446a151a7400e415661f9f9d8b73d9`: [Android workflow #44707536300](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707536300) **completed/success**: regression tests, Build debug APK и Upload APK success. [Isolated archive #44707536160](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707536160) **skipped**.
- Строгая валидация ledger read-back и duplicate identity проверена в регрессионном наборе. На физическом Android устройстве не проверялась, автоудаление не включено.
- Следующий приоритет — убрать неподтверждённое UI-сообщение `Анализ завершён` по одному `entrance_media.status='completed'` без подтверждённого ledger. Исправление только индикации, не включать обработку и delete.

---
## Контрольная точка — строгая fail-closed проверка read-back распознавания (2026-11-20)

- Новый зависимый этап поверх Draft #243 в ветке `fix/video-ledger-read-integrity-2026-11-20`: `js/video-recognition-ledger.js` теперь валидирует целиком каждый persisted entry (источник, videoId, resultId, stateRevisionId, timestamps, digest, размер, evidenceVersion, cleanupState, JSON result), запрещает дубли identity и использует одинаковый guard при чтении и перед записью.
- Отсутствующий ledger возвращает `{ok:false,reason:'ledger_missing',entries:[]}`, а не ошибочно подтверждённый пустой реестр. Повреждение возвращает `ledger_corrupt` без раскрытия потенциально подменённых записей и без модификаций исходников.
- Добавлены тесты отсутствующей записи, повреждённых digest/размера/status/result/timestamps, duplicate и сохранности Blob. Code SHA `8067270989d8a32973574a4938a5e09f42eff09c`, tests SHA `0e8aab280a8860e95e957e3d62a6445b483a3c3e` — **новая проверка CI ещё не подтверждена**.
- Нет UI, AI интеграции, включения удаления, миграций, production. Следующий шаг — точный CI; затем audit реальных AI endpoint и запрет фиктивного `completed` до интеграции.

---
## Проверенный CI PR #243 — test-only ledger и защита от ID collision (2026-11-20)

- Исправленный code/test SHA `3e3c51372f26ce1544fa2e23cf359d5a31eb1fb4`: Android workflow [#44707175152](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707175152) **completed/success**; regression tests, debug APK build и upload прошли. Isolated archive APK [#44707175241](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44707175241) **skipped**, не считать успешным тестом.
- Предыдущий SHA `dfd5de3f1928850cb5fee1a94d3bdb3a01bfa5a5` [#44706938052](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44706938052): 988/989 passed, один старый тест требовал `put(storedRecord)` вместо безопасного `add(storedRecord)`. Исправлен только этот тест, введено явное отрицательное ожидание на `put`.
- Следующий приоритет — строгая fail-closed проверка уже сохранённых ledger записей перед будущей интеграцией UI; затем реальный источник распознавания. Нет auto-delete, merge, production, изменений пользовательских видео.
- Последующие docs-only коммиты не объявлять проверенными CI без отдельной проверки; code/test SHA указан выше.

---
## Контрольная точка — исправление CI и коллизий леткового видео (2026-11-20)

- Первый Android CI Draft #243 на SHA `3f6a0dfa092ee2d845d8922e16895351fa733f11`, run #44706715461: **failure**, 988 passed / 1 failed; Android build/upload были skipped. Единственный failing test извлекал `async function putEntranceVideo` начиная с `function`, вызывая SyntaxError при `await`.
- При анализе обнаружена реальная уязвимость: текущий `index.html` сохранял исходник через `entrance_media.put(storedRecord)`, что позволяло перезаписать видео при одинаковом ID. Изменена одна операция на `add(storedRecord)` (commit `53af9aecab221e236db1d1eb2e83ce83e326f126`); регрессионный тест исполняет настоящую async-функцию с SHA-модулем (commit `a86f8f2126cb3088209bf49a692a3bfd43c7f6f2`).
- Повторные тесты и Android CI для нового HEAD ещё требуют проверки. Оригиналы пользователей не менялись; автоматическое удаление, UI интеграция ledger и production запрещены.

---
## Этап — test-only durable ledger распознавания видео (2026-11-20)

- После docs-only Draft #242 создана зависимая ветка `feat/video-recognition-durable-ledger-2026-11-20`. Перенесены из несоединённой экспериментальной ветки без merge: `js/video-recognition-ledger.js` и `tests/video-recognition-ledger.test.mjs`; отдельный контракт `docs/VIDEO-RECOGNITION-DURABLE-LEDGER.md`.
- Функция проверяет SHA-256 исходного видео и state revision, записывает результат в `main/video_recognition_ledger_v1`, при любом успешном результате оставляет `cleanupState=blocked_archive_safety`. Никаких вызовов UI, удаления Blob, схемных миграций или живых операций.
- Открытый риск: метаданные Blob можно подменить несогласованным writer при сохранении прежнего SHA/size после хэширования, а внешние Android/архивные копии ещё не проверены. Запрет удаления #241 сохраняется. CI этого нового HEAD пока не подтверждён; следующий шаг — проверки GitHub на точном SHA, затем интеграция распознавателя отдельным шагом.
- Merge, production, публикация и изменение пользовательских видео не выполнялись.

---

## Контрольная точка — контракт распознавания/очистки видео (2026-11-20)

- На основе Draft #241 создан отдельный docs-only блок: `docs/VIDEO-RECOGNITION-CLEANUP-STATE-CONTRACT.md`. Определены fail-closed состояния pending/in-progress/recognized_durable/cleanup_blocked/cleanup_committed, необходимые доказательства SHA/ledger, учёт внутренних и внешних Android копий, атомарность и запрет resurrection при restore.
- Текущий код **не удаляет** видео после распознавания; распознаватель ещё не подключён в этой цепочке. Контракт ничего не разблокирует, не меняет состояние пользователя, не выдаёт archiveSafe или cleanupAuthorized.
- Перед программным этапом требуется сверить несоединённый ledger стек #213, внедрить только durable recognition без удаления и проверить CI/Android. Основной стек #230–241 остаётся Draft. main, production и реальные оригиналы без изменений.
- Документационные изменения текущей ветки не объявлять CI-verified без workflow на точном HEAD.

---

## Проверенный CI — защита леткового оригинала от преждевременного удаления (2026-11-20)

- Draft PR #241: code/test SHA deb588ce20e5929610050a01b465455e302ed837. Android workflow #44705595782 **completed/success**: Run regression tests, Build debug APK, Upload APK успешны; isolated archive APK #44705595821 **skipped**.
- Первый CI на SHA d9fd43b68218bd9efa3033fb3aff0a1cdd35d53b завершился **failure**: новая regression fixture ошибочно извлекала `async function removeEntranceVideo` без `async`, отчего тестовый `new Function` не мог разобрать `await`. Исправлен test-only extraction SHA deb588ce20e5929610050a01b465455e302ed837; рабочий код блокировки изменять не понадобилось.
- Теперь все вызовы `deleteEntranceVideoBlob` на ветке #241 отклоняются до IndexedDB write; UI-кнопка отключена. Захват/просмотр сохранены. Безопасное удаление после распознавания ещё **не реализовано**. Данный CI не проверяет физическое Android устройство.
- Следующий приоритет: безопасное durable-распознавание и результат/ledger на видео, после чего инвентаризация внутренних+внешних Android копий и строго проверяемая all-copy cleanup. Никаких merges, production, удаления пользовательских видео.
- CI выше подтверждён для code SHA; следующие документационные коммиты проверяются отдельно.

---

## Контрольная точка — блокировка преждевременного удаления леткового видео (2026-11-20)

- Начальное состояние: Draft #240 HEAD fda4f6e5d72b8cd5414ba1bb4ac50ea45888bf13, Android workflow #44704230240 completed/success; isolated archive APK #44704230343 skipped. Ветка #240 остаётся Draft, никаких merges/production.
- В зависимой ветке `fix/video-entrance-manual-delete-guard-2026-11-20` устранён риск прямого удаления нераспознанного оригинала из `entrance_media`: `index.html` теперь показывает disabled «Удаление заблокировано», `deleteEntranceVideoBlob(id)` всегда отклоняет вызов с кодом `ENTRANCE_VIDEO_DELETE_BLOCKED` без открытия IDB readwrite-транзакции; устаревший `removeEntranceVideo` безопасно сообщает об отказе. Capture, preview, list, SHA, журнал и все данные сохранены.
- Добавлен `tests/entrance-video-manual-delete-guard.test.mjs` на прямой delete, старые вызывающие пути, отсутствие транзакции и сохранение записи/просмотра. Новый контракт `docs/ENTRANCE-VIDEO-DELETE-GUARD.md`. Code SHA 20ce483fda164d6c4294f014e400a2594dc9c84d; tests SHA f94812a0a526220f1f294bc6cb4a00d3903cf811.
- CI нового SHA пока не подтверждён. Дальше — Draft PR, точная проверка regression/Android и исследование подтверждённой цепочки распознавания с учётом всех managed и external Android копий. Автоматическая очистка остаётся запрещённой, реальные пользовательские видео не удалялись.

---

## Проверен CI — new journal video source SHA/ID (2026-11-20)

- Draft PR #240: https://github.com/250oisr-eng/Pasekaapp/pull/240. Код и исправленные регрессии SHA `03c620231fd990123914011c9733858b034363e7`. Android workflow #44704005222 **completed/success**: Run regression tests, Build debug APK, Upload APK прошли. Isolated archive APK workflow #44704005147 **skipped**.
- Ранее SHA ef3e35b6ba81519473f15c248df054d00bea732a завершился **failure**: четыре старых теста ожидали v316 cache и старую последовательность скриптов. Исправлены tests/archive-ui-integration.test.mjs и tests/regression.test.mjs, не скрывая ошибки. На исправленном коде CI success.
- Два реальных пути создания новых journal videos получают стабильный ID и SHA-256 Blob/Data URL; old journal media не мигрируются. Offline shell v317 и Android www scripts включают новый модуль.
- Физическая Android проверка камеры, галереи, офлайн ввода и сохранности после рестарта не выполнялась. Автоматическое распознавание и удаление видео не реализованы. CI относится именно к исправленному SHA, последующие docs-only commits требуют собственного статуса.
- Следующий приоритет: guarded recognition ledger + Android внешние copies и безопасный запрет преждевременного удаления; никакого live cleanup, merge или production.

---

## Контрольная точка — новые видео журнала получают устойчивую идентичность (2026-11-20)

- Предыдущий Draft PR #239 `fix/video-archive-v2-legacy-copy-coverage-2026-11-20`: итоговый HEAD 373830645c128c7703632502b9428ded957db3d2, Android workflow #44703389103 completed/success, isolated APK #44703389078 skipped. Ручное удаление видео в действующем UI является отдельным выявленным риском, не изменено.
- Следующий приоритет — source identity именно в реальном capture workflow. Создана зависимая ветка `feat/journal-video-v2-source-evidence-2026-11-20` поверх #239. Новый модуль `js/journal-video-source.js` готовит новые журнальные видео: устойчивый `videoId`, `sourceSha256` по исходному Blob, `sourceBytes`, `sourceEvidenceVersion:1` и Data URL, SHA которого проверяется отдельно и совпадает с исходником. Ошибка или отсутствие SHA не допускает создания медиа.
- `index.html`: `addCapturedVideo` и file-picker путь `recordForm` используют общий SHA-validated preparer. Редактирование старых записей сохраняет прежние media без миграции, а старые без ID по-прежнему блокируют автоматический PASEKA02 import/cleanup.
- `sw.js`: offline cache `paseka-shell-v317` с новым js; `scripts/prepare-web.mjs` уже рекурсивно копирует `js` в Android www. Новые tests/journal-video-source.test.mjs используют настоящие SHA и record-media adapter и проверяют несовместимые legacy records, ошибки FileReader/hash, оба UI пути, offline cache.
- Код SHA d539eb6aa1060dfb4d1b142e481b850ce5a0e389, UI SHA fe86d6addccc6774c226dc8109a306d6a4aa47fd, cache SHA 976a8b279f584e11f07a36ff0561e271df82daf4, test SHA 02fef6fcfd830d27f4f27aa9ba976a5a806511c4. Контракт docs/JOURNAL-VIDEO-SOURCE-EVIDENCE.md.
- CI актуального SHA на момент записи не подтверждён. Следующий шаг — создать Draft PR и проверить regression + Android build по HEAD; при ошибке исправить. Никаких live deletions, changes main, production или merge; физическая проверка Android камеры ещё не проведена.

---

## CI проверен — реальные legacy PASEKA01 + capture UI (2026-11-20)

- Код/тесты/документация на SHA `70e8781c2a4a98cdfc0e060902d41f34172804bc`: Android workflow #44703165651 **completed/success**, regression tests, debug APK, upload успешны. Изолированный archive test APK #44703165708 **skipped**.
- Новый зависимый Draft PR #239: https://github.com/250oisr-eng/Pasekaapp/pull/239. Учитываются PASEKA01 `video`, `rollback_video`, `rollback_state`, `full_backup.previous.state` и реальный legacy journal capture без videoId, который теперь считает копию как identity:null/unidentified_copy. Никаких действий с original Blob или пользовательской базой нет.
- Реальный `index.html` имеет путь ручного удаления леткового оригинала без ledger-условия; риск отмечен, но runtime не изменялся. Не смешивать пользовательский запрос на подтверждённое распознавание с прежней кнопкой ручного удаления.
- Текущая инвентаризация всегда `cleanupAuthorized=false` и `auditComplete=false`. Следующий этап — безопасно согласовать runtime capture и recognition ledger, а также Android внешние копии, прежде чем разрабатывать удаление после распознавания.
- Success относится к указанному SHA. Поздний docs-only commit при появлении будет иметь отдельный CI. Main, production, опубликованное приложение и физические устройства не изменены.

---

## Сверка реального capture UI и исправление подсчёта копий без ID (2026-11-20)

- Прямой аудит `index.html`: летковые видео записываются `handleEntranceVideoFile → putEntranceVideo` в `entrance_media` с SHA-256; сервер распознавания ещё не подключён. В live UI присутствует `removeEntranceVideo → deleteEntranceVideoBlob` с подтверждением пользователя, **без проверки успешного распознавания**. До отдельного разрешённого изменения этот пользовательский путь является риском преждевременного удаления и не относится к автоматической безопасной очистке.
- Видео журналов через `recordForm` сохраняются как `{kind:'video',name,type,data:DataURL}` **без гарантированного videoId, sourceSha256, sourceBytes**; их невозможно безопасно сопоставлять с ledger по identity. Новое исправление инвентаризации всегда считает такую запись как `copy` с `identity:null` и `unidentified_copy`, а не пропускает её.
- В тесты добавлен точный legacy journal capture fixture. Code SHA 32d2230aac6d7f50c7310f450a278b57d1aa88b9; test SHA eb85507b2426fb7319d0e66bfc03b6925392ceb8. Полный CI актуального SHA проверяется отдельно.
- Не изменялся `index.html`, ручное удаление **не вызывалось**, никаких пользовательских файлов/данных не затрагивали. Приоритет: заблокировать преждевременное удаление при согласованном изменении live video lifecycle, после обоснованной матрицы совместимости.

---

## Контрольная точка — PASEKA01 legacy-видеокопии в инвентаризации (2026-11-20)

- Исходный Draft PR #238 HEAD c9d667080d768b3dba8acfb0e56018cde8bf8cc8: Android workflow #44702366437 **completed/success** (регрессионные тесты, debug APK, upload), отдельный isolated archive APK #44702366449 **skipped**. Ветка #238 остаётся Draft, main/production не менялись.
- Проверен реальный код v1 js/paseka-archive-restore.js: `archive_staging` содержит `kind='video'` с `metadata.id`, `blob`, `size`, `chunkSha256`; `kind='rollback_video'` хранит `record.blob`; `kind='rollback_state'` содержит `state`; `kind='state'` хранит непрозрачный JSON Blob, а `full_backup.previous` хранит `{at,state}`.
- В зависимой ветке fix/video-archive-v2-legacy-copy-coverage-2026-11-20 расширен только изолированный readonly `js/video-archive-v2-copy-inventory.js`: теперь известные legacy `video` и `rollback_video` учитываются как оригиналы `entrance_media`, архивные `rollback_state` и `full_backup.previous.state` проверяются на journal video Data URL, непрозрачный state Blob явно блокирует полноту инвентаризации. Chunk SHA старого архива **не** считается полным SHA источника.
- Добавлены регрессии `tests/video-archive-v2-copy-inventory.test.mjs`: legacy copies, recognized tombstone с rollback copy, неизвестные payload, historical state и v2 before/after snapshots. Новый код SHA d408da8e3367c9f8f7518ed00a10d1d523c0dabf, тест SHA cba0c88ded5545f5f0581d94f48bc7b739a87f0e. CI новых SHA ещё не подтверждён.
- Во всех вариантах cleanupAuthorized=false, auditComplete=false, externalCopiesVerified=false. Новое изменение не затрагивает live UI, Android bridge, IndexedDB migrations и пользовательские данные. Следующий шаг: GitHub CI, затем исследование фактических capture/recognition paths и Android MediaStore без активации удаления.

---

## Проверен CI — инвентаризация копий PASEKA02 (2026-11-20)

- Draft PR #238 на точном SHA 4aece72275b4075dbbae557df502c57c14ab1d1f: Android Build #44702184802 **completed/success**, шаги Run regression tests, Build debug APK, Upload APK успешны. Изолированный archive APK run #44702184782 **skipped**, не отдельный успешно пройденный тест.
- Проверка охватывает новый test-only readonly inventory с simulated IndexedDB; физическая проверка Android/Gallery/Downloads не проводилась, legacy backup форматы требуют дополнительного аудита. Cleanup остаётся всегда запрещённым.
- Следующий приоритет — сверка конкретных runtime-модулей capture, recognition и storage и регистрация создания/возможных внешних видео-копий до обсуждения удаления.
- Последующие docs-only SHA требуют отдельной CI-сверки. Main, production и пользовательская база не менялись.

---

## Контрольная точка — инвентаризация управляемых копий PASEKA02 (2026-11-20)

- Предыдущий Draft PR #237 HEAD 8a6ab3543c48697170acb838cd19540d46654f76: Android workflow #44701483418 completed/success (регрессии, APK build и upload); isolated archive APK #44701483368 skipped. Main/production не изменялись; #230–237 остаются Draft.
- Продолжена единая приоритетная задача: создана зависимая ветка feat/video-archive-v2-copy-inventory-2026-11-20. Новый изолированный js/video-archive-v2-copy-inventory.js выполняет одну readonly-транзакцию IndexedDB над main/state, video_recognition_ledger_v1, entrance_media, archive_staging, archive_history и full_backup. Считает отдельно live Blob летка, журнальные data-video вложения, staged originals и quarantine snapshots.
- Все копии помечаются по source+videoId; если признанный удалённым tombstone имеет ещё копию, отмечается deleted_tombstone_has_copy. Для иных legacy backups, неизвестных видео без ID, недействительного ledger или состояния — fail-closed диагностика. Внешние Android Camera/Gallery/Downloads не проверяемы в этой транзакции.
- Выход отчёта только метаданные, не Blob и не Data URL. Во всех состояниях cleanupAuthorized=false, auditComplete=false, archiveSafe=false; никаких writes и удаления не происходит. Это инвентаризация, а не механизм очистки.
- Новые tests/video-archive-v2-copy-inventory.test.mjs проверяют readonly транзакцию, копии в нескольких protected stores, recognized/tombstone conflict, journal data URL, unknown backup, legacy media, ошибки ledger/metadata и read failure. Создан docs/VIDEO-ARCHIVE-V2-COPY-INVENTORY.md. Code SHA c18c3608435b3039b215f60d8aa4cacae80b7b93; test SHA 3222acacde827bb2f93a4aca0ffca944b6ed4265.
- Проверка CI этого нового SHA ещё не подтверждена. Следующее — проверить и исправить CI, затем изучить реальный список источников видео/старых backup и только после доказательства полного контроля копий обсуждать безопасное удаление. Нет merge/production/активации UI/physical Android test.

---

## Проверенный CI — PASEKA02 защищённый rollback в карантин (2026-11-20)

- Draft PR #237: https://github.com/250oisr-eng/Pasekaapp/pull/237. Точный code/test SHA b9adda64aa98508b04202506cb1bbc7bdb5ab1e6, Android workflow #44701259981 completed/success; Run regression tests, Build debug APK и Upload APK пройдены. Изолированный archive test APK workflow #44701259955 skipped, не считается успешной отдельной проверкой.
- CI доказывает только поведение изолированного fake-indexeddb тестового сценария. Физический Android test не проведён; в runtime PWA/Android новый модуль не загружается.
- Подтверждены отказ при новом распознавании, новых записях с прежней revision, changed importedRevisionId, изменении Blob/hash, неизвестных оригиналах; сценарии atomic move/quarantine, crash readonly и error delete/abort. Положительный статус quarantine не разрешает очистку: byteIntegrityLocked=false, cleanupAuthorized=false, все copies сохранены.
- Следующий главный приоритет: независимая инвентаризация всех управляемых копий pending/recognized videos, staged/backup/quarantine/entrance/record_media и fail-closed cleanup-blocker, без удаления. Затем согласование real video-recognition workflow и физические Android испытания. Merge/production по-прежнему запрещены.
- Вышеописанный success относится к указанному SHA; последующие docs-only commits требуют отдельной сверки.

---

## Контрольная точка — PASEKA02 entrance quarantine rollback (2026-11-20)

- Положительная CI-проверка предшественника Draft PR #236 code/test SHA 579fa1b7e9847f070318c08b224108030669ff8b: Android workflow #44700669872 completed/success (regression, APK build/upload). Изолированный archive APK #44700669941 skipped. Далее в #236 добавлены docs-only commits.
- В новой зависимой ветке feat/video-archive-v2-entrance-quarantine-rollback-2026-11-20 разработан **изолированный** js/video-archive-v2-entrance-quarantine-rollback.js. Только для ранее успешно выполненного test-only entrance commit с status committed_rollback_blocked допускается защищённый откат: сначала readonly проверка истории, history.importedRevisionId и текущей revision/state/ledger/media, затем асинхронный SHA видео, затем повторная проверка всех пяти stores под общей readwrite транзакцией.
- При выполнении rollback фактические Blob **атомарно сохраняются в full_backup.quarantinedMedia** перед удалением ссылок из entrance_media в **той же** транзакции. Main/state возвращается с новой revision; recognition ledger и staged originals остаются без изменений. Любой отказ read, write, delete или конфликт приводит к abort с сохранением всех данных.
- Никакой video byte не уничтожается. После успешного отката history.status=reverted_quarantined_unverified, byteIntegrityLocked=false, rollbackAuthorized=false, restoreAuthorized=false, cleanupAuthorized=false; readonly inspector после restart возвращает только осторожную диагностику. Само наличие quarantined Media не подтверждает SHA-целостность на момент транзакции.
- tests/video-archive-v2-entrance-quarantine-rollback.test.mjs добавлены: успешное перемещение Blob с сохранением SHA, recognized tombstones, restart, повтор rollback, новое распознавание/наблюдение при той же revision, altered importedRevisionId, corrupted Blob, конкрурентный writer, same-size byte swap во время SHA, atomic failure при delete.
- Код SHA 0db0a6b5699ed3b4094f0da4291c3399732ba65b; тест SHA 6f849c7d6e6bc66d2d7a2c138e16e6d2f9dfbf37; контракт docs/VIDEO-ARCHIVE-V2-QUARANTINE-ROLLBACK.md. Полный CI именно нового SHA пока НЕ подтверждён.
- Следующая задача: открыть Draft PR и проверить CI; затем аудировать полное сохранение stage/full_backup и cleanup-барьеры для уже распознанных originals. Нет runtime UI, merge, production, физических Android-тестов или удаления пользовательских данных.

---

## Проверенный GitHub CI — test-only PASEKA02 entrance commit (2026-11-20)

- Для точного SHA **579fa1b7e9847f070318c08b224108030669ff8b** Android workflow #44700669872 завершён **completed/success**: Run regression tests, Build debug APK, Upload APK — успешны. Отдельный Build isolated archive test APK #44700669941 — skipped, не успех отдельной проверки.
- Узкий commit в Draft PR #236 проверен на CI, но не подключён к runtime и не испытывался на реальном телефоне. Статус «committed_rollback_blocked»: полноценного безопасного отката и удаления видео пока нет.
- Следующий главный приоритет: test-only protected quarantine rollback для импортированных, всё ещё не распознанных оригиналов, который перед изменением проверяет history.importedRevisionId и текущую revision, ledger/tombstones и все записанные оригиналы и при любом сомнении сохраняет данные.
- CI выше относится к указанному коду SHA; новый docs HEAD проверяется отдельно. Merge и production запрещены.

---

## Контрольная точка — PASEKA02 entrance-only atomic commit (2026-11-20)

- Проверен предыдущий Draft #235: итоговый HEAD 3a5739067140e633da1ad2c624932f8761e73792, Android run #44699480313 completed/success (regression/build/upload), isolated archive APK #44699480300 skipped. Main фактический SHA 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7; ветки #230–#235 остаются Draft и не слиты.
- В зависимой ветке feat/video-archive-v2-entrance-atomic-commit-2026-11-20 создан изолированный js/video-archive-v2-entrance-atomic.js. Это первое **настоящее, но только тестовое** атомарное добавление pending Blob из verified PASEKA02 с сохранением state, истории и snapshot в одной readwrite-транзакции пяти stores. Blob берётся из повторно хэшированного исходного архива, НЕ повторно читаемого изменяемого staging.
- Контракт узкий: только entrance_media, никакого record_media, прежняя живaя видеотека обязана быть пустой, прежний full_backup отсутствует, staged session+history согласованы, входящий ledger/tombstones идентичны локальным. Разрешено изменение live state **только revisionId**: любые новые записи, даже без увеличения revision, блокируют операцию.
- Protected snapshot сохраняется в full_backup, history получает статус committed_rollback_blocked. Автоматический откат видео и удаление остаются ЗАБЛОКИРОВАНЫ. Readonly inspector после рестарта сообщает только committed_media_unverified, а не безопасность byte/restore/delete.
- tests/video-archive-v2-entrance-atomic.test.mjs добавлен с негативными регрессиями: сохранение ledger, учёт новых записей, concurrent recognition, подмена staged Blob, rollback snapshot, атомарное прерывание при ошибке IDB.add, конфликт видео, защита чужих бэкапов, restart и повреждение истории.
- Контракт docs/VIDEO-ARCHIVE-V2-ENTRANCE-ATOMIC.md. Начальный код commit 5f0039e1bb0ea0f42eca3a3c768b08e88e2a61ec и дополнительное state protection  aa24ff962d212db8307a710ef0849c6755bd5f95; тесты commit 78d035a7f9a133362a2aab4118cb15f0b78200bf. JS-синтаксис проверен; CI точного нового SHA пока НЕ подтверждён.
- Следующий приоритет: проверить CI и исправить реальные ошибки; затем отдельная модель безопасного rollback с сохранением ledger/tombstones и всех оригиналов. Никаких merges, live UI, production и физического удаления видео.

---

## Проверка CI: pinned entrance add с обязательным abort (2026-11-20)

- Точный кодовый/test SHA 3bce3f1528e0866711c88e5e70fd4ec1b6a3dd8c: Android Build workflow #44699253786 **completed/success**. В build job успешны Run regression tests, Build debug APK и Upload APK. Изолированный Build isolated archive test APK #44699253789 **skipped**, не считать успешной отдельной проверкой.
- Draft PR #235: https://github.com/250oisr-eng/Pasekaapp/pull/235. Все добавленные test-only транзакции **всегда abort**, ни один пользовательский оригинал/ledger/state/backup не записан или удалён; не подключено к UI.
- Проверка в реальном Android test APK и на физическом телефоне НЕ выполнялась. В Lovable найден существующий проект Apiary Family Atlas; этот этап не изменял его код и настройки публикации.
- Следующий инженерный приоритет: тестовая полная атомарная транзакция состояния и признанной истории с защищённым rollback snapshot, чтобы будущий commit использовал именно удержанные verified archive Blob. Пока нет полноценного согласования record_media, всех копий и удаления после распознавания, запуск live и cleanup запрещены.
- Последующие docs-only SHA требуют отдельной проверки CI; code/test успех относится только к 3bce3f1528e0866711c88e5e70fd4ec1b6a3dd8c.

---

## Контрольная точка — PASEKA02: репетиция IDB add с обязательным abort (2026-11-20)

- Проверенный предшественник Draft #234: code/test SHA 36c990974f9f13dcb2af4d13163787c254d72c51, Android workflow #44698877760 completed/success, isolated archive APK #44698877638 skipped. После него только docs-only commits; основной стек #230–234 остаётся Draft.
- Новая зависимая ветка feat/video-archive-v2-pinned-add-abort-2026-11-20 поверх #234. Js/video-archive-v2-pinned-source.js теперь имеет тестовый метод rehearsePinnedEntranceAddsAbort: после повторной проверки реального PASEKA02 и SHA **удерживает те же immutable Blob** и в единой readwrite транзакции пяти stores сначала проверяет state/ledger/staging/history/entrance IDs, затем подаёт настоящие `entrance_media.add` (без put), ждёт завершения запросов и **всегда tx.abort**.
- `record_media` этим методом не восстанавливается, только entrance_media; при коллизии видео, неизвестных source ID, ошибке add или изменении ledger транзакция целиком отменяется. Никакой durable записи в main, media, staging, history, full_backup.
- tests/video-archive-v2-staging-verify.test.mjs дополнен проверками add-success-with-abort, same-size staged Blob tamper с interception add (доказано использование архивного Blob), journal video blocked, конкурентной записи video ID и искусственного add failure. Код SHA 46094204c4220c2bef9d10a1a92a88f70010cc1f, тест SHA 899239ca9f499d4d66981cfc526c865ce54d2631.
- Контракт docs/VIDEO-ARCHIVE-V2-ABORTED-ADD.md. На момент фиксации GitHub CI этого нового SHA ещё не подтверждён; Android физически не тестировался. Нет live integration, мержа PR, production и удаления оригиналов.
- Следующее: проверить CI итогового SHA и исправить реальные сбои. Затем — только отдельная тестовая реализация полноценного защищённого rollback + recognition ledger union, без удаления видео и без использования непроверенных staging байтов.

---

## Проверенный CI — pinned PASEKA02 source (2026-11-20)

- PR #234 код/тесты SHA 36c990974f9f13dcb2af4d13163787c254d72c51: Android workflow #44698877760 **completed/success** (regression tests, debug APK, upload); isolated archive APK workflow #44698877638 **skipped**. Это не физическое тестирование телефона.
- Подтверждён изолированный алгоритм получения неизменяемых SHA-проверенных архивных Blob без выдачи caller write/delete capability. Same-size staging substitution по-прежнему доказанный риск и явно возвращается stagedBytesLocked=false.
- Следующее ограниченное доказательство: тестовый запуск настоящих IndexedDB add-запросов из тех же удержанных Blob под финальным readwrite lock, с обязательным abort независимо от успеха; ни один байт не должен попасть в durable live state.

---
## Контрольная точка — неизменяемые источники PASEKA02 вместо mutable staged Blob (2026-11-20)

- Актуальная проверенная исходная цепочка: Draft #230 → #231 → #232 → #233. PR #233 HEAD 52d02d7ab84d741882ebf6d3059fb9f605c51ee5: Android workflow #44697729527 completed/success, isolated archive APK #44697729499 skipped. Нет merge/production/Android физического теста.
- Создана зависимая ветка feat/video-archive-v2-pinned-payload-proof-2026-11-20 поверх #233, один приоритет — byte-TOCTOU между staged SHA и будущим commit. Новый изолированный js/video-archive-v2-pinned-source.js повторяет SHA staging, заново проверяет реальный PASEKA02, создаёт **локальные неизменяемые Blob-срезы именно из проверенного архива** и проверяет SHA каждого нового источника. Проверяет live revision/ledger/videoIds/staging/history под финальной readwrite-блокировкой пяти stores, которая всегда abort.
- Ни один Blob не возвращается вызывающему коду, записи не выполняются. Результат явно сохраняет stagedBytesLocked=false, restoreAuthorized=false, cleanupAuthorized=false, archiveSafe=false. Это архитектурное доказательство для будущего одного commit-вызова, не готовая операция.
- В tests/video-archive-v2-staging-verify.test.mjs добавлены проверки pinned-источников, record/entrance, same-size Blob swap после аудита и повторного обнаружения SHA-подмены, гонок нового recognition ledger и истории, отсутствия данных для удаления/записи. Код SHA 95ca7d5d1e6617adc2721b021fe73a8434720b1a, тест SHA 5a06f0ebd67c6fcbf19e9fda730f790af48bb26c.
- Контракт docs/VIDEO-ARCHIVE-V2-PINNED-SOURCE.md: старые staged Blob сохраняют риск незамеченной same-size подмены; импорт вправе использовать только удерживаемые в том же вызове проверенные архивные Blob, необходим настоящий атомарный commit/rollback и полное согласование копий.
- CI этого нового кода ещё не подтверждён. Следующее: открыть Draft PR, выполнить Node/Android CI точного SHA, исправить ошибки. Затем тестовый атомарный commit исключительно безопасного узкого подмножества, используя удерживаемые Blob вместо повторно читаемых стадированных байтов, без интеграции live/cleanup.

---

## Проверенный результат CI — SHA staging verifier (2026-11-20)

- В Draft PR #233 на SHA `c5939b055f31fc32239c29bd0a56ab698ab5208d` Android workflow #44697513266 — **completed/success**, включая шаги Run regression tests, Build debug APK, Upload APK. Изолированный Build isolated archive test APK #44697513211 — **skipped**, не успешная отдельная APK-проверка.
- Подтверждены тесты изолированного stage verifier и существующей связанной цепочки именно на указанном SHA; реальный Android-телефон не тестировался. Последующие docs-only коммиты требуют собственного CI-статуса.
- Реальный импорт с видеоданными, delete/cleanup, rollback видео и durable writer-fence **не реализованы и не активированы**. Весь стек #230→#231→#232→#233 остаётся Draft; Main/production не менялись.
- Один следующий приоритет: формализовать и реализовать неизменяемость staged Blob до атомарного commit (writer-serialized согласованная защита), с сохранением новых записей, ledger/tombstones и protected backups. Без этой границы никакого live restore или deletion.

---

## Контрольная точка — повторная проверка SHA staging originals (2026-11-20)

- В зависимой ветке feat/video-archive-v2-staging-integrity-2026-11-20 подготовлен отдельный модуль js/video-archive-v2-staging-verify.js. Он принимает реальный PASEKA02, заново проверяет архивный SHA, читает ровно пять protected stores общей readonly транзакцией, сверяет header/history и точный список staged исходников, затем **повторно хэширует байты каждого уже сохранённого staged Blob**.
- После SHA-фазы повторно сравнивает live state, ledger, entrance keys и staged metadata под единой readwrite транзакцией, которая всегда abort. Никакого put/delete/restore. Результат всегда byteIntegrityLocked=false, requiresAtomicCommitCheck=true, restoreAuthorized=false, cleanupAuthorized=false и archiveSafe=false.
- Известное ограничение: подмена Blob того же размера и MIME после SHA, но до final write-lock, не определяется одним metadata fingerprint. Эту проверку нельзя считать разрешением на import/cleanup до отдельного immutable/write-fence протокола.
- Добавлены tests/video-archive-v2-staging-verify.test.mjs: оба вида видео, real-file SHA, same-size corruption, отсутствующий staged original, writer race, конфликт журнала распознавания, чужой full_backup, отсутствие store, сохранность. Синтаксис JS и тестов проверен, полный CI итогового SHA ещё не подтверждён.
- Документ контракта: docs/VIDEO-ARCHIVE-V2-STAGING-VERIFY.md. База Draft #232: code/test SHA 8f98505a9fde38dea489576fcb8de600e8a94db1, workflow #44697058894 success; isolated archive #44697058856 skipped. Этот CI не подтверждает код нового PR.
- Следующая задача: получить точный CI и устранить дефекты, затем спроектировать writer-fence staged Blob/реальную атомарную интеграцию с ledger и полным rollback. Main, production, пользовательские записи и удаление видео не изменяются.

---

## CI изолированного PASEKA02 staging — 2026-11-20

- Точный SHA `8f98505a9fde38dea489576fcb8de600e8a94db1`: Android workflow #44697058894 — completed/success (Run regression tests, Build debug APK, Upload APK). Отдельный Build isolated archive test APK #44697058856 — skipped.
- Draft PR #232: https://github.com/250oisr-eng/Pasekaapp/pull/232; код только stage-only, без live-импорта, удаления, восстановления и изменения main.
- Поскольку `protected_unverified` не доказывает повторно SHA stored Blob, следующий приоритет — read-only verification сохранённых staging copies с защитой от конкурентных изменений, не выдающая разрешения на commit или cleanup.
- Проверки относятся только к указанному SHA; физический Android тест не проводился.

---

## Контрольная точка — PASEKA02: атомарный тестовый staging нераспознанных видео (2026-11-20)

- На базе проверенного SHA цепочки Draft PR #231 создана зависимая ветка feat/video-archive-v2-pending-stage-2026-11-20. Цель — защищённое сохранение уже SHA-проверенных pending originals в тестовый staging, без live-импорта или удаления.
- Новый изолированный js/video-archive-v2-pending-stage.js использует настоящий PASEKA02 codec для проверки Blob и SHA каждого видео, отдельно проверяет SHA архива и всех видео до DB write. Единой readwrite транзакцией по main, entrance_media, archive_staging, archive_history, full_backup проверяет exact revision, ledger, ID collision, пустоту защищённых stores и записывает только header + исходные Blob + history. Main/state, ledger, entrance_media и full_backup не меняются.
- Реальная schema archive_staging содержит unique backupId index; только header несёт backupId, видеоentries — sessionId и составные source+videoId keys. Протокол совместим без изменения версии IndexedDB.
- Read-only inspectPendingStaging сообщает protected_unverified (копии есть, повторный SHA НЕ доказан) либо manual_review_required при повреждении header/history; не выдаёт restore/cleanup authorization.
- Тесты tests/video-archive-v2-pending-stage.test.mjs покрывают реальные entrance и record_video, защиту предыдущих backup, исходного Blob, записи ledger во время проверки, повторный staging, осиротевшие копии и некорректный архив. Подключения к live UI нет.
- Отдельный контракт docs/VIDEO-ARCHIVE-V2-PENDING-STAGING.md. Первичный code SHA f47d77a0e63b73c6e7d90156e39ff1716c9fb3ce и test SHA 6e79432aa4724f7e574ede9aca1f02e1ded532aa. Код прошёл синтаксический V8 parse, но полный CI ещё не подтверждён.
- База PR #231: code/test SHA c8ddefcaf47443a0c5b03c907e2811dc1912f3ae прошёл Android run #44696499993: regression, build APK, upload success. Isolated archive APK run #44696499782 skipped.
- Следующий приоритет: проверить SHA-специфический CI этой ветки и исправить тесты/ошибки; затем отдельный rehash staging content + writer-serialized recheck до рассмотрения реального commit. Merge, production, удаление видео запрещены.

---

## Проверка CI защитной цепочки PR #231 — 2026-11-20

- Точный SHA `c8ddefcaf47443a0c5b03c907e2811dc1912f3ae`: Android workflow #44696499993 **completed/success**. В job успешны **Run regression tests**, **Build debug APK** и **Upload APK**. Отдельный `Build isolated archive test APK` workflow #44696499782 имеет `skipped` (не считать проверенным).
- Проверена чистая последовательность stacked PR #230 → #231; нового live импортёра и удаления видео нет. Физическое тестирование APK не проводилось.
- Дата/вывод CI относится к указанному SHA, а не автоматически к последующим документационным commits.
- Следующая задача — отдельная проработка защищённого staging pending original видеозаписей, атомарного предварительного контракта и crash recovery; не запускать live restore или cleanup до полной проверки.

---

## Контрольная точка — PR #231: межисточниковые ID и гонка журнала (2026-11-20)

- Draft PR #231 открыт поверх #230: https://github.com/250oisr-eng/Pasekaapp/pull/231.
- Дополнены регрессии: одинаковый ID летка/журнала без ложного конфликта (источник входит в ключ), а также конкурентная запись журналового видео перед final aborted write-lock с сохранением исходных данных. Тестовые commits: 92207d23c2c5ac9e006a505938816e7bfd300ea8 и 85e677df21dde7beef172b01c90f52b71a01ff88.
- На момент фиксации полного CI точного итогового SHA нет. Проверка ожидается независимо от синтаксических и smoke-тестов.
- Следующий шаг: проверить актуальный CI; при ошибке исправить именно её, затем продолжить staging design без live действий.

---

## Контрольная точка — PASEKA02: защита исходных видео от коллизий ID (2026-11-20)

- На базе существующей Draft #230 создана зависимая ветка fix/v2-pending-media-id-collision-2026-11-20, отдельная задача: закрыть опасность совпадающих videoId у импортируемого pending original и уже существующего видео летка или журнала.
- В js/video-archive-v2-restore-gate.js добавлен чистый синхронный checkLivePendingMediaIdentity. Он требует отдельной проверки source+videoId, отвергает коллизию local entrance_media keys и journal record_media IDs, а также legacy видео с данными без стабильного videoId; существующий ledger/tombstone gate сохраняется.
- В js/video-archive-v2-restore-db-preflight.js проверка подключена после единого readonly снимка пяти stores. В js/video-archive-v2-commit-lock-guard.js повторно выполняется внутри единой write-lock транзакции, которая ВСЕГДА abort. Новый importer, writer, delete и восстановление не вводились.
- Регрессионные тесты: tests/video-archive-v2-restore-db-preflight.test.mjs и tests/video-archive-v2-commit-lock-guard.test.mjs (конфликт входного видео, conflict journal, legacy unknown ID, writer race и сохранение originals). Три изменённых JS файла прошли синтаксическую проверку в V8; pure guard прошёл три отдельных ручных сценария. Полная матрица Node/Android CI для этой ветки пока не подтверждена.
- Контракт описан в docs/VIDEO-ARCHIVE-V2-PENDING-IDENTITY.md. Предыдущий базовый SHA 209edddc638935641d88fa197e0c5b7170c3cf76 прошёл Android CI #44695197293 (success), isolated archive APK #44695197208 skipped; эти результаты нельзя переносить на новый SHA.
- Приоритет следующий: убедиться в прохождении CI на итоговом SHA, затем разработать атомарный защищённый staging pending originals и recovery, не включать live импорт и cleanup до доказательства безопасности всех копий.
- Без слияний, без активации нового улья, без обновлений production, без удаления видео и пользовательских данных.

---

## Контрольная точка — PASEKA02: оба recovery snapshot проходят проверку (2026-11-20)

- Продолжен существующий Draft PR #230. Исправлен только изолированный metadata-only inspectMetadataRecovery: прежде чем возвращать committed/reverted, проверяет корректную форму records и отсутствие непроверенных видео в обоих сохранённых snapshot — beforeState и afterState, включая неактивный.
- Проверка reverted требует валидный revertedRevisionId, отличный от обеих исторических ревизий, и точное совпадение с текущим состоянием. При расхождении — manual_review_required, без записей.
- Код SHA e445ce1e9bb896adbb0e1dbc0d6e3dbe430762c6; тест SHA f718ad280366fa043f7ab6295b646d575e13d1b9. Негативные тесты охватывают скрытые оригиналы в неактивном снимке, повреждённые records и повторно использованную или неверную rollback revision.
- Предыдущий итоговый HEAD 40a13a57d56f0d6079b0d9e0ff49a03ee6c5428b: Android workflow #44694864424 completed/success, isolated archive workflow #44694864506 skipped. Этот результат не доказывает новый SHA.
- Следующее: подтверждение CI и аудит pending-media staging, без live restore и удаления. Ветка Draft, нет merge или production.

---

## Контрольная точка — обнаружение скрытых оригиналов при recovery (2026-11-20)

- В Draft PR #230 изолированный readonly inspector теперь проверяет форму records и запрещает скрытые исходные видео в текущем state (data:video, data:application/octet-stream, blob:), прежде чем присвоить not_imported или committed. Такие данные требуют manual_review_required; автоматическое удаление и восстановление не запускаются.
- Код commit 9dfdf0efa4c59e8b2895755473d09137e5dfdf04, регрессионные тесты commit ab3a7e1b48be6137ee15845ca566a1db9262a2ec. Проверки CI на новые SHA пока не подтверждены. Предыдущий code/test SHA 9aacbe124fffcd3012f3334d5544c6df14ca0f4d: Android workflow #44694728452 cancelled, isolated APK #44694728364 skipped; оба не считаются успехом.
- Следующий приоритет: подтверждение актуального CI и аудит передачи pending оригиналов в PASEKA02 с гарантией сохранности до распознавания. Live-интеграция, cleanup, merge и production исключены.

---

## Контрольная точка — metadata-only rollback и baseline recovery (2026-11-20)

- В Draft PR #230 исправлен rollbackMetadataOnly: история должна принадлежать ожидаемому backup ID; previousRevisionId и importedRevisionId совпадают с версиями снимков beforeState/afterState, различаются и содержат корректный archiveSha256. Любая ошибка прерывает общую readwrite транзакцию до записи; backup/history и пользовательский state сохраняются.
- inspectMetadataRecovery возвращает manual_review_required вместо not_imported, если в локальном state без архивной истории отсутствует валидная schemaVersion=15 или revisionId. Режим диагностики остаётся readonly.
- Код: commit 40d06794c5048c626ad505ead4febd90f7083061; регрессионные тесты: commit 9aacbe124fffcd3012f3334d5544c6df14ca0f4d.
- На предыдущем docs HEAD 3d093175f458d484f7bc47eb16f99bc33cc96a13 Android workflow #44693025279 completed/success, в job успешны Run regression tests и Build debug APK; isolated APK workflow #44693025295 skipped. Эти результаты НЕ относятся к новым code/test SHA.
- Следующий шаг: проверить CI для итогового SHA; аудит staged-переноса видео без подключения live UI и без cleanup. Merge, публикация, удаление оригиналов запрещены.

---

## Контрольная точка — усилена проверка целостности recovery v2 (2026-11-20)

- В том же Draft PR #230 диагностическая `inspectMetadataRecovery` дополнительно сверяет backup ID, SHA-256, schemaVersion и ревизии `beforeState`/`afterState` с `archive_history`; при расхождении возвращает `manual_review_required` и не исправляет данные автоматически.
- Добавлены отрицательные тесты на повреждение полей истории и snapshot; `readonly` режим диагностики сохранён. Код SHA `47e68d28da2867c8c2a66a881822dd24d6747dbe`, последний тест SHA `b71be63cdbb8a6c95c31981926dfd39c8bc14367`.
- CI итогового SHA ещё требует отдельной проверки. Нет восстановления видео, включения live UI, удаления оригиналов, merge или production deployment.
- Следующая задача: проверить результаты точного SHA и продолжить независимую проверку архивирования pending originals, не включать cleanup до доказательства сохранения каждой управляемой копии.

---

## Контрольная точка — recovery v2 только для чтения (2026-11-20)

- Продолжена существующая Draft-цепочка архивирования, PR #230, ветка `feat/video-archive-v2-metadata-atomic-restore-2026-11-20`. Новых параллельных PR не создано.
- Исправлено: `inspectMetadataRecovery` ранее открывал `readwrite` на пяти защищённых IndexedDB stores, несмотря на статус диагностической операции. Теперь применяется строго `readonly`; атомарные `commitMetadataOnly` / `rollbackMetadataOnly` остаются `readwrite`.
- Добавлен регрессионный тест на отказ диагностической операции от права записи и сохранение всех пяти stores в согласованном чтении.
- SHA кода `7c8c07f68e3b3ef7335ae84fdebb0ff3635814ee`; SHA теста `53a41383f9c00314e380fb057c93401a1b40c269`. На SHA теста Android и isolated archive workflows зарегистрированы, но на момент проверки не завершены; успешные проверки НЕ заявляются.
- Блокеры: полноценный импорт/откат видео PASEKA02, сохранение всех оригиналов до распознавания, удаление только после подтверждения на всех управляемых носителях, физический Android тест; работающий UI не подключён. `archiveSafe=false`, `cleanupAuthorized=false`.
- Следующая задача: дождаться и проверить CI именно на новом итоговом SHA и продолжить аудит защиты staged видео без live-включения и удаления.

---

## Большая контрольная точка — изолированный атомарный импорт/откат PASEKA02 без видеовложений (2026-11-20)

- Проверено, что последний PR #226 (SHA `ebe63a1abf3935355d8779af0b159415793f8d1e`) прошёл Android Build, кодовый SHA `30dbf9254e9f9dc8ef739a2e0bd1d859dae2d2b7` прошёл Fast Quality. Отдельная UI/Windows цепочка #227–229 завершила CI, включая сборку Windows+Android ZIP на SHA `f113870dca9c98615f0ddc307941cef05aff982b`; в `main` ничего не сливалось.
- Новая зависимая архивная ветка `feat/video-archive-v2-metadata-atomic-restore-2026-11-20` создана поверх #226. Реализован `js/video-archive-v2-metadata-atomic.js` — **изолированный и не подключённый к приложению** атомарный импорт/откат только для полностью безопасного подмножества PASEKA02: schemaVersion=15, без pending video и иных исходных видео, без существующих staging/history/full_backup, с неизменным полным recognition ledger.
- Реальный файл перед транзакцией проходит PASEKA02 decoder, SHA-256 и синхронную валидацию; под общей `readwrite` блокировкой пяти stores (`main`, `entrance_media`, `archive_staging`, `archive_history`, `full_backup`) повторно проверяются revisions, ledger и отсутствие защищённых копий. В одной транзакции создаются previous state/ledger, after state, history и новый state. Никаких `delete`, `clear` или возврата оригиналов.
- Атомарный rollback сравнивает **полный** текущий state с imported snapshot (не только revision), проверяет ledger, защищённые записи и сохраняет snapshot и history после отката. Изменение журнала/маток/семей, новое видео/распознавание или чужой backup после импорта блокируют откат без потери данных. `inspectMetadataRecovery` классифицирует `not_imported`/`committed`/`reverted`/`manual_review_required` и **не выполняет recovery автоматически**.
- Добавлена матрица регрессий в `tests/video-archive-v2-metadata-atomic.test.mjs`; документация `docs/VIDEO-ARCHIVE-V2-METADATA-ATOMIC.md`. На кодовом SHA `b4e5d90102840c67a7c3017fa76993a2c27bb66a` Fast quality #44691504851 **success**; Android на финальном docs SHA проверить отдельно.
- Это НЕ live restore PASEKA02 и не разрешение на cleanup/миграции/production. Следующая большая задача — staged обработка незавершённых видео, интеграция видеоцепочки, подготовка полной автоматической безопасной модели backup+rollback; после этого отдельный Android тест.

---

## Крупный этап — сквозной безопасный dry-run восстановления PASEKA02 и защита full_backup (2026-11-20)

- Ветка `feat/video-archive-v2-end-to-end-dry-run-2026-11-20` поверх Draft PR #225. Создан `js/video-archive-v2-restore-dry-run.js`: принимает **реальный Blob архива** `PASEKA02`, использует проверенный codec для манифеста, state, ledger, видео летка и журнала, затем read-only DB preflight и финальную проверку ledger под **отменяемой** общей readwrite-блокировкой. Возвращает только отчёт с SHA-256 архива, количеством видео и историей, без права на запись.
- Выявлен недоучтённый защищённый store **`full_backup`**: рабочий `js/paseka-archive-restore.js` использует его для предыдущего состояния при v1 restore. Исправлены `js/video-archive-v2-restore-db-preflight.js` и `js/video-archive-v2-commit-lock-guard.js`: теперь все `main`, `entrance_media`, `archive_staging`, `archive_history`, `full_backup` участвуют в одном чтении / write-lock. Любая запись `full_backup` блокирует v2 restore, защищённые данные не меняются и не удаляются.
- Исправлена TOCTOU-последовательность: полный SHA-256 файла вычисляется **до** заключительной проверки под write-lock, а не после. Добавлена регрессия на новое распознавание во время вычисления отпечатка.
- `tests/video-archive-v2-restore-dry-run.test.mjs`: полный тест `PASEKA02` с обоими типами видео, SHA-256, отказом на v1/corruption, потерей ledger, гонкой распознавания, защитой staging и full_backup, неизвестной схемой и отказом зависимостей. Обновлены тесты двух ранее созданных guard-модулей. `docs/VIDEO-ARCHIVE-V2-RESTORE-READINESS.md` содержит карту всех защищённых stores, угроз и план следующего этапа.
- **Fast quality checks success** на кодовом SHA `30dbf9254e9f9dc8ef739a2e0bd1d859dae2d2b7`, run #44688101339. Android CI и итоговый docs HEAD отдельно проверить. Нет действующего v2 импорта, staging/rollback commit или удаления, `restoreAuthorized=false`, `archiveSafe=false`. Все PR Draft, `main` и production не изменены.
- Следующее: атомарный и полностью обратимый v2 stage/commit/rollback, согласование видео и архивных веток, защита всех persistent копий после распознавания и физический Android тест. Нельзя включать автоматическое удаление на основании dry-run.

---

## Контрольная точка — проверка v2 restore под отменяемой readwrite-блокировкой (2026-11-20)

- Создана зависимая ветка `feat/video-archive-v2-commit-lock-guard-2026-11-20` поверх Draft PR #224. Новый изолированный `js/video-archive-v2-commit-lock-guard.js` открывает **одну readwrite-транзакцию** над `main`, `entrance_media`, `archive_staging`, `archive_history`, читает живой ledger/state, ключи входных видео, количество staging/history и **синхронно внутри transaction callback** выполняет restore ledger gate.
- Даже если проверка успешна, транзакция намеренно **abort**; никакие `put`/`delete` не выполняются, write-авторизация не выдаётся. При обнаружении любой staging/history записи или несовпадении текущего ledger — fail closed. Это подтверждение механизма проверки на момент блокировки, **не реализация commit**.
- `tests/video-archive-v2-commit-lock-guard.test.mjs`: проверка единой readwrite-транзакции и её обязательного abort, гонок writer до/после неё, непрерывности истории, сохранности staging/history, отсутствующего ledger и store. CI точного SHA проверить.
- Следующий этап: безопасный staging+атомарный commit/rollback с включением текущего ledger и всех protected stores; миграционная совместимость и физический Android тест. Пока `archiveSafe=false`, `restoreAuthorized=false`, автоделение видео запрещено; `main` и пользовательские данные не менялись.

---

## Контрольная точка — единая read-only проверка protected stores перед v2 restore (2026-11-20)

- Поверх PR #223 создана отдельная Draft-ветка `feat/video-archive-v2-restore-db-preflight-2026-11-20`. Изолированный `js/video-archive-v2-restore-db-preflight.js` читает в одной readonly IndexedDB-транзакции `main/state`, `main/video_recognition_ledger_v1`, ключи `entrance_media`, количество `archive_staging` и `archive_history`; затем вызывает чистый v2 ledger restore gate PR #223. Blob не выгружаются целиком.
- Пока полноценная безопасность staging/history v2 не реализована, при наличии **хотя бы одной** staged/history записи проверка отказывает, ничего не удаляет и не меняет. При отсутствующем ledger, неподдерживаемой схеме state, недостающих stores, конфликте истории распознавания также fail closed.
- Добавлены `tests/video-archive-v2-restore-db-preflight.test.mjs`: один readonly transaction, обнаружение защищённых staging Blob и history rollback, сохранность данных после отказа, отсутствие ledger, потеря tombstone, отсутствие store и неверный state. Результат всё ещё `restoreAuthorized:false`, `archiveSafe:false`, `requiresAtomicCommitCheck:true`.
- Это **не** write-транзакция, не текущий import/rollback и не разрешение удаления. Нужен разработанный и протестированный атомарный commit-guard без потери истории, затем Android физический тест. Итоговый CI проверить отдельно.

---

## Контрольная точка — изолированный preflight восстановления PASEKA02 (2026-11-20)

- Создана зависимая Draft-ветка `feat/video-archive-v2-restore-ledger-gate-2026-11-20` поверх PR #222. Добавлен чистый `js/video-archive-v2-restore-gate.js`: сравнивает текущий и импортируемый ledger распознавания, отказывает при потере, переписывании или понижении статуса существующих результатов/tombstone; проверяет каждый кандидат исходного видео по `(source,videoId)` и полному SHA-256 против всей известной истории, включая попытки подставить тот же исходник с новым videoId.
- В journal state проверяет `record_media`: уже распознанные оригиналы с Data URL запрещены, а нераспознанный видеоисточник обязан иметь уникальный ID, правильный Data URL, SHA/размер, соответствующие отдельному pending payload. Старые видео без ID, скрытый binary, дубли и лишние вложения блокируются.
- `tests/video-archive-v2-restore-gate.test.mjs`: положительный read-only preflight и негативные случаи утери ledger, изменённой истории, alias SHA, распознанных Data URL, несовпадения байтов/хэша, orphan, дубликатов, неизвестной кодировки. **Никаких транзакций/импорта/удаления:** результат всегда `restoreAuthorized:false`, `archiveSafe:false`, `requiresAtomicCommitCheck:true`.
- Это не переносит проверку в реальную write-транзакцию, не закрывает staged/rollback/backup-history и ещё не интегрировано с UI. Следующий этап: совместимый атомарный протокол чтения всех protected stores перед commit и интеграция с активным runtime/разными цепочками PR; физический Android тест. CI итогового SHA проверить отдельно.

---

## Контрольная точка — повторная проверка snapshot после SHA (2026-11-20)

- В зависимой ветке `feat/video-archive-v2-posthash-recheck-2026-11-20` поверх PR #221 создан изолированный `js/video-archive-v2-export-candidate.js`. Метод получает согласованный snapshot, формирует PASEKA02 через отдельный codec, затем делает **повторную атомарную readonly-сверку** state, ledger и входных видеометаданных, заново хэширует исходные Blob и отменяет результат при изменении, конфликте с распознаванием или подмене байтов при старом хэше.
- Добавлен `tests/video-archive-v2-export-candidate.test.mjs` с моделированием гонок после первого SHA: новое распознавание, изменение revision, изменение/подмена видеобайтов, добавление ещё одного оригинала; проверяется сохранность живого Blob при отказе. Положительный тест возвращает только `postHashRecheckPassed:true`, но всегда `requiresWriterFence:true`, `archiveSafe:false`, `restoreAuthorized:false`.
- **Это оптимистическая read-only сверка, не постоянная блокировка записи**: после неё другой writer может изменить данные. Активный export/download, backup/restore/rollback и автоматическое удаление не подключены; Android Gallery и старые staged copies остаются отдельными блокерами. CI нового SHA проверить отдельно.

---

## Контрольная точка — атомарный read-only снимок для архива v2 (2026-11-20)

- В зависимой ветке `feat/video-archive-v2-consistent-read-2026-11-20` поверх Draft #220 добавлен **не подключённый к рабочему экспорту** `js/video-archive-v2-snapshot.js`. Он считывает state, `main/video_recognition_ledger_v1` и все `entrance_media` в одной IndexedDB readonly-транзакции, не используя хэши из несогласованных раздельных чтений.
- При отсутствии ledger, повреждении state или отсутствии в метаданных Blob подтверждённого `blobSha256` и `bytes` операция отказывает; если в ledger есть запись о распознавании того же видео, сохранённый оригинал блокирует подготовку архива. Ни один исходный Blob не удаляется.
- Добавлен `tests/video-archive-v2-snapshot.test.mjs`: одновременное чтение, конкурентная readwrite-запись после начала snapshot, отсутствие/повреждение ledger, отсутствие SHA, конфликт tombstone/оригинала, отсутствие магазинов и неверная схема.
- Важно: успешный snapshot сам по себе **не делает архив безопасным** после асинхронного SHA и не подтверждает отсутствие staged/rollback/внешних Android-копий. Метод всегда возвращает `archiveSafe:false`, `restoreAuthorized:false`, `needsPostHashRecheck:true`. Интеграции с codec и живым export/import пока нет. Тесты/CI итогового SHA проверить отдельно.

---

## Подтверждение кодовых тестов PASEKA02 journal adapter (2026-11-20)

- На кодовом SHA `efd3ee1a795740bbde324edb64fb21ba6728a7e2` Fast quality checks завершились **completed/success**, workflow GitHub CI; после добавления итоговых документов Android и новый итоговый HEAD сверить отдельно.
- Исправлено нарушение регрессии из #44675892008 (`1/799`): прямой `pendingVideos[source=record_media]` запрещён; только SHA-verified адаптер может сформировать journal video. Добавлен отдельный тест прямой инъекции.
- `stateAndLedger` теперь отдельно распознаёт `kind='video'` даже без известного MIME и блокирует неизвестную кодировку при отсутствии адаптера. Новые тесты включены в успешный прогон.
- Изолированный codec всё ещё не имеет согласованного IndexedDB snapshot/commit/rollback и НЕ является рабочим backup/restore. Автоудаление не включено; `main`, production, пользовательские записи не менялись.

---

## Исправление регрессии PASEKA02 record_media (2026-11-20)

- Первый Fast quality run #44675892008 на кодовом SHA `8fa9f26ca5c3fdddde4f70d0715b1b6d9d1dfd6c` завершился **failure: 1/799**: предыдущая защита не позволяла передавать произвольный `record_media` Blob без доказанного Data URL, а новая интеграция ошибочно пропускала его.
- В `js/video-archive-v2-metadata-codec.js` восстановлен fail-closed контракт: входной параметр `pendingVideos` допускает только `entrance_media`; `record_media` может быть сформирован только опциональным, проверяющим SHA-256 журналовым адаптером. Добавлен тест на попытку прямой инъекции Blob. Новая CI-проверка обязательна.
- Включение рабочего импорта/удаления не производилось.

---

## Контрольная точка — интеграция journal video в изолированный PASEKA02 кодек (2026-11-20)

- В зависимой ветке `feat/video-archive-v2-record-codec-2026-11-20` поверх Draft PR #219 codec PASEKA02 опционально вызывает тестовый record-media adapter, извлекает проверенные Data URL журналовых видео в отдельные Blob entries типа `record_video` и восстанавливает их после повторной SHA-256 проверки; фотографии остаются частью state.
- Поддерживаются `data:video/*;base64` и подтверждённый источник `data:application/octet-stream;base64`, идентичности `entrance_media` и `record_media` не смешиваются. Без адаптера старое поведение безопасного отказа сохраняется.
- В `tests/video-archive-v2-record-codec.test.mjs` добавлены сквозные тесты чистого кодека: журналовый и смешанный roundtrip, Android MIME, tombstone, отказ без адаптера, повреждение Blob и неправильный размер. Все изменения пока изолированы от IndexedDB и интерфейса; не являются рабочим backup/restore и не разрешают delete.
- CI проверять на точном SHA. Следующее — ограничение повторного появления через импорт, согласование ledger с работающими writer-путями и атомарный восстановительный протокол; отдельный Android-тест. Запрет merge/deploy/main сохраняется.

---

## Исправление CI адаптера журнала — источник потокового SHA (2026-11-20)

- Первый Fast quality run #44675711627 для кодового SHA `a6e9fafb9f40f286fd4b59ce86b9d8afe2019060` завершился **failure: 7/792 тестов**, все семь регрессий адаптера выдавали `V2_RECORD_ADAPTER_UNAVAILABLE`. Причина — архивная ветка не содержала `hashVideoDataUrlHex`, внедрённый ранее в параллельном видео Draft PR #213.
- В `js/paseka-sha256.js` аккуратно перенесена именно потоковая функция SHA-256 для исходных Base64 Data URL без изменения `hashBlobHex`. Следующий CI проверить именно для нового SHA; исходный неуспешный прогон не скрывать.
- Полный архив v2/интеграция с runtime/удаление не активированы.

---

## Контрольная точка — изолированный адаптер видео журнала для архива v2 (2026-11-20)

- На базе Draft PR #218 создана ветка `feat/video-archive-v2-record-media-adapter-2026-11-20`. В `js/video-archive-v2-record-media.js` добавлен автономный, НЕ подключённый к текущему архиву адаптер: из `records[].media[]` с `kind=video`, `videoId`, `sourceSha256`, `sourceBytes` и Base64 Data URL извлекаются оригинальные байты только неопознанных видео, подтверждаются SHA-256 и затем могут быть восстановлены без потери фотографий или структуры журнала.
- В состоянии для будущего codec используется временный маркер `archivePendingVideoV2`, `data:null`; реальная запись не мутируется. Результат нельзя использовать для сохранения или восстановления до совместимого кодека и защиты атомарного снимка. Распознанный оригинал, legacy без identity, конфликт хэша и подозрительная непрозрачная кодировка блокируются.
- `tests/video-archive-v2-record-media.test.mjs` проверяет точные байты, восстановление, Base64 с несколькими чанками, фото, дубли, legacy, tombstone, повреждение и незаявленные видеовложения. Кодек PASEKA02 ещё НЕ вызывает адаптер, поэтому не является полноценным журналовым backup. CI окончательного SHA подтвердить отдельно.
- Без удаления видео, без изменения старого v1, `main`, пользовательских данных, production или слияния PR. Следующее: после подтверждения CI безопасно интегрировать адаптер в v2 codec и добавить сквозные тесты, затем согласовать состояние IndexedDB/rollback и Android.

---

## Дополнение — строгий запрет непрозрачных полей ledger (2026-11-20)

- Аудит изолированного v2 обнаружил риск бесшумного JSON-преобразования вложенного `Blob` в пустой объект. `js/video-archive-v2-guard.js` теперь отклоняет непрозрачные типы внутри результата, незнакомые поля ledger и записей; `tests/video-archive-v2-guard.test.mjs` содержит прямую регрессию.
- Проверки CI необходимо сверить на новом кодовом и окончательном SHA; ранее успешный run не подтверждает эти последние изменения.

---

## Контрольная точка — перенос необработанных летковых видео в изолированном v2 (2026-11-20)

- Поверх Draft PR #217 создана ветка `feat/video-archive-v2-pending-entrance-2026-11-20`. `js/video-archive-v2-metadata-codec.js` расширен: разрешены **только** явно переданные `pendingVideos` из `entrance_media`, не имеющие результата распознавания в переданном ledger. Бинарные Blob переносятся отдельно от state, контроль целых исходных SHA-256 выполняется потоковым `PasekaSha256.hashBlobHex` при записи и при чтении.
- Результат read-only анализа возвращает Blob ожидающих распознавания видео, но всегда `restoreAuthorized=false` и `archiveSafe=false`; он не служит разрешением на удаление и не меняет IndexedDB.
- `record_media` Data URL, существующий runtime и конкурентные обновления источника не интегрированы: экспорт с журналовым видео продолжает безопасно отказываться. Не считаем этот кодек полноценной заменой backup. Предусмотрены тесты roundtrip, corruption/hash/tombstone/duplicate, неправильного размера и неподдерживаемого источника.
- CI на итоговом SHA требует отдельной проверки. Следующий этап: полное согласование record_media, подтверждённые источники SHA и snapshot/revision, staged commit/rollback, Android; никакого merge/production/delete.

---

## Контрольная точка — v2 metadata-only codec (2026-11-20)

- Создана зависимая ветка `feat/video-archive-v2-metadata-codec-2026-11-20` поверх PR #216. Отдельный изолированный `js/video-archive-v2-metadata-codec.js` создаёт и валидирует файл с сигнатурой `PASEKA02`, JSON state и целым ledger, проверяя SHA-256, размеры и структуру. Старый `.paseka` v1 не менялся.
- В целях защиты данных этот **промежуточный кодек не транспортирует ни входные video Blob, ни видео Data URL в state**; при их обнаружении отказывает. Это не полный архив v2, не путь для обычного полного backup, не restore/staging/commit и не разрешение удалять файлы.
- `tests/video-archive-v2-metadata-codec.test.mjs`: позитивный roundtrip и негативные тесты на коррупцию state/ledger, лишние байты, устаревший формат, бинарные поля, некорректный JSON и отсутствие криптографии. CI на итоговом SHA ещё проверяется.
- Следующая задача: безопасный полноценный транспорт ожидающих распознавания видео, совместимость `record_media`, согласование двух цепочек и проверка на Android. Слияние/production/deployment без разрешения не выполняются.

---

## Контрольная точка — изолированный валидатор метаданных архива v2 (2026-11-20)

- Поверх Draft PR #215 создана ветка `feat/video-archive-v2-ledger-validator-2026-11-20`. Добавлен независимый, **не подключённый к интерфейсу** модуль `js/video-archive-v2-guard.js` и `tests/video-archive-v2-guard.test.mjs`.
- Guard отклоняет повреждённый ledger, непроверенный SHA/размер результата, дубли video identity/result ID, видеобинарник внутри структурированного результата, попытку включить распознанный оригинал в набор архивных video payload. Функция намеренно возвращает `archiveSafe:false`; это не полноценная проверка исходных Blob, Data URL в state, staging или rollback.
- Кодек v2/изменение существующего архива, автоматическое распознавание и удаление видео НЕ реализованы. CI на точном HEAD подтвердить отдельно. Следующее: проверка тестов и интеграционный аудит v2 с исходными хэшами/байтами и импортом, без включения delete.

---

## Контрольная точка — контракт архива v2 для видео (2026-11-20)

- При повторной проверке обнаружено, что PR #214 дублирует часть #211. В PR #214 добавлено предупреждение о пересечении, merge не производится; приоритет — цепочка #210 → #211 → #212 и отдельный видео PR #213.
- В ветке `docs/video-archive-v2-contract-2026-11-20` поверх #212 создан `docs/VIDEO-ARCHIVE-V2-CONTRACT.md`: новый формат с переносом полного ledger/tombstones, запретом включения распознанных оригиналов, защитой от восстановления старых Blob, атомарными правилами commit/rollback, Android и миграционными тестами. **Только проект контракта; код архива v2 не реализован.**
- Следующий шаг: отдельный проверяемый v2 validator/codec и тесты, затем интеграция с UI и видеоцепочкой, физический Android тест. Автоудаление выключено, production и main не изменены.

---

## Дополнение к PR #212 — аудит осиротевших видеокопий (2026-11-20)

- Исправлен `inspectStagingRecognitionCopies(db)` в `js/paseka-archive-restore.js`: прежде он рассматривал только видеокопии staging, для которых сохранился `kind=session` header. Теперь только по индексным **ключам**, без загрузки Blob в память, проверяются и видеокопии с потерянным заголовком. Такие копии получают `status='orphaned_header'`, `missingSessionHeader=true` и `action='manual_review_required'`.
- В отчёт добавлены `orphanedMatchedCopies`, `unclassifiedVideoKeyCount`, `requiresManualReview` и явное `identityVerifiedByBytes=false`. Один `videoId` без доказательства идентичности SHA-256 **не даёт права удаления**. Ссылки из `archive_history` остаются помеченными как защищённые. Дубли идентичностей ledger и неподдерживаемые cleanup-состояния приводят к fail-closed ошибке.
- В `tests/archive-staging.test.mjs` добавлены регрессии на удалённый header с сохранённым staged Blob, orphan с архивной историей, duplicate ledger identity и неподдающиеся классификации ключи. Проверяется, что отчёт не меняет временные записи и ledger.
- Кодовый SHA `cf4d71aa254e9dc49656e41f681f98aca962c35c`: [полный регрессионный job #44672535903](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672535903) **completed/success**. Android CI на кодовом и итоговом документационном SHA проверять отдельно.
- Автоматическая очистка, привязка результата к хэшу исходного видео и транспорт `ledger/tombstone` в переносимом архиве остаются блокерами. PR #212 Draft, main/production/физические архивы/данные не менялись и не удалялись.

---

## Дополнение к PR #212 — повторная очистка без записей (2026-11-20)

- `discardArchiveRestoreSession` после чтения индексных ключей возвращает `false`, если staging-сессия уже пуста; операция **ничего не удаляет** и не ошибается лишь из-за сохранившейся в `archive_history` ссылки. Если хоть одна запись есть, полные проверки ownership/kind/history продолжают действовать в единой readwrite-транзакции.
- Добавлен регрессионный тест `tests/archive-staging-cleanup-status.test.mjs` на двукратный повтор пустой очистки при наличии старой ссылки из истории.
- Кодовый SHA `6a699d3c10ca43658a5554a52f0b8017837ce4b6`: [complete regression #44672319861](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672319861) **completed/success**; Android CI и проверка итогового документационного SHA требуют отдельного подтверждения.
- Автоудаление после распознавания не подключено. Основной оставшийся блокер: `video_recognition_ledger_v1` не содержит подтверждённой привязки к хэшу байтов, а `.paseka` v1 не сохраняет ledger/tombstone; поэтому автоматическая очистка остаточных staged-копий не разрешена.

---

## Контрольная точка — защита истории при очистке archive_staging (2026-11-20)

- Создан зависимый Draft PR #212 поверх #211: ветка `fix/archive-staging-history-protection-2026-11-20`. `main`, production, реальные пользовательские записи и архивы не изменялись.
- Исправлен `discardArchiveRestoreSession` в `js/paseka-archive-restore.js`: прежняя реализация проверяла `archive_history` только для staging без заголовка; теперь ссылка на импорт или rollback проверяется **для каждого случая** в одной IndexedDB readwrite-транзакции с возможной очисткой. Статусы `failed`/`ready`/`staging` не обходят защиту истории. Завершённый `reverted` импорт допускает прежнюю явную очистку лишь при `status=reverted` в истории, `rollbackAvailable=false`, отсутствии ссылки на rollback session и точном `backupId`.
- Добавлена fail-closed проверка `sessionId`, заголовка `session.sessionId/backupId`, всех primary keys и соответствующего `kind` по вторичным индексам **без чтения видео Blob**. Неизвестные/перепутанные записи, включая `rollback_video` в чужой сессии, не удаляются; отсутствие индекса `kind` приводит к безопасному отказу.
- Новые регрессии в `tests/archive-staging-cleanup-status.test.mjs`: защита ссылки history даже при повреждённом статусе, корректный полностью завершённый rollback, конфликт `backupId`, cross-session key, подмена `kind`, старый IndexedDB без обязательного индекса и неправильный sessionId. `tests/archive-restore-atomicity.test.mjs`: синтетический header приведён к действительной форме с `backupId` (защитный код не ослаблен).
- Кодовый SHA `dfa7957cf111a0b055f2122e0cb5b5de81a5d50f`: [complete regression #44672101794](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44672101794) **completed/success**. Android CI на этом SHA проверять отдельно; документационный HEAD потребует собственного CI.
- **Что не сделано:** автоматическое удаление видео после распознавания, проверка идентичности байтов для staging-копий, транспорт ledger/tombstone в `.paseka` и физическая Android-проверка. Новый код усиливает существующую ручную очистку; без полноценного протокола он не является разрешением удалить оригинал или резервную копию. `main` не менялась, PR Draft, merge/deployment отсутствуют.
- Следующий этап: безопасный недеструктивный план идентификации staged-копий по подтверждённому результату и хэшу содержимого; только после согласования архивного формата и восстановления — проверенная селективная очистка с retry и регрессионными сценариями после обрыва.

---

## Контрольная точка — предотвращение повторной готовности staging и аудит остаточных видео (2026-11-20)

- Создан зависимый Draft PR #211 поверх #210, отдельная ветка `fix/archive-staging-finalize-ledger-2026-11-20`. Основная ветка `main` не менялась.
- `js/paseka-archive-restore.js`: `updateSession` проверяет `main/video_recognition_ledger_v1` в общей readwrite-транзакции, прежде чем присвоить `ready` (также при идемпотентном повторе). `finalizeStagedArchive` проверяет тот же ledger непосредственно в своей readwrite-транзакции после полной проверки снимка, в том числе когда сессия уже была `ready`. Если распознавание завершилось в промежутке — `VIDEO_LEDGER_NOT_PRESERVED`, без новой записи/смены состояния.
- Добавлен `inspectStagingRecognitionCopies(db)`: **только чтение** ключей staging и метаданных ledger; возвращает число копий с подтверждённым распознаванием и tombstone, наличие ссылок архивной истории и `manual_review_required`. Не удаляет Blob, журнал, историю, rollback snapshot или исходный архив и не выдаёт `archiveSafe`.
- `tests/archive-staging.test.mjs`: новые реальные fake-indexeddb тесты перезапуска/явной финализации с новым ledger, повторной проверки уже готовой сессии, гонки после последнего video, обнаружения stale staged copies и полной неизменности Blob/ledger, испорченного ledger и старой базы.
- **Ограничения:** audit не является механизмом автоматического удаления. Ранее созданные копии в `archive_staging` сохраняются; пользовательские архивы и old backup не переписываются. Формат `.paseka` v1 не переносит ledger/tombstone. Полная пофайловая интеграция с видеоцепочкой #205–#209, архив v2 и физические Android проверки остаются отдельными задачами.
- CI оценивать только на точном HEAD #211. Не объединять PR и не развёртывать production без отдельного разрешения.

---

## Архивный PR #210 — атомарный барьер записи staging после распознавания (2026-11-20)

- В `js/paseka-archive-restore.js` функция `putStagingEntryAndUpdateSession` читает `main/video_recognition_ledger_v1` **в той же IndexedDB readwrite-транзакции**, в которой создаёт каждый staged-оригинал и увеличивает `stagedCount`. При подтверждённом результате распознавания или повреждённом журнале операция abort; новая видеокопия не записывается.
- Новый тест `tests/archive-restore-atomicity.test.mjs` моделирует запись результата распознавания после первой видеокопии при многофайловом импорте и подтверждает, что следующая копия не записана, сессия помечена failed и ранее сохранённый ledger остаётся.
- Это расширение preflight из предыдущего этапа. **Открытый риск:** оригиналы, скопированные в `archive_staging` *до* завершения распознавания, сохраняются до безопасной очистки staging. Не удалять/не считать удалёнными source, архив, медиа и recovery snapshot без полного транзакционного протокола. Также требуется запрет подтверждения статуса ready при обнаруженном ledger и сценарии restart/retry.
- Исходный archive v1 всё ещё не переносит `video_recognition_ledger_v1` и tombstone; при непустом ledger импорт/откат/экспорт блокируются. Архивную ветку #168 и видеоцепочку #205–#209 нельзя сливать автоматически: требуется аккуратное согласование и сквозное тестирование.
- PR #210 остаётся Draft. Кодовый SHA этой доработки `7ab2d4382d0abf46f39536130bafc6c3da6581bc`; точные результаты CI указывать по GitHub после завершения. Ни production, ни пользовательская пасека не изменены, данные не удалялись.

---

## Архив PR #210 — запрет подготовки несовместимого импорта (2026-11-20)

- Функция `stageArchiveForRestore` теперь проверяет `main/video_recognition_ledger_v1` до разбора архива и повторно после асинхронной проверки, перед записью в `archive_staging`. При наличии результатов распознавания или повреждённом ledger подготовка v1 не начинается, чтобы не создавать управляемые дубли старых видео.
- Добавлены регрессионные тесты: старый архив с непустым ledger не создаёт staged entry; повреждённый ledger не переписывается.
- **Остаточный риск:** распознавание может завершиться уже во время многотранзакционной подготовки. Поштучная атомарная сверка ledger и очистка временных записей при сбое пока не реализованы; нельзя считать защиту всех staged-копий завершённой. Финальный импорт и откат дополнительно защищены проверкой в readwrite-транзакциях.
- Порядок приоритета: добавить transaction-level ledger guard для `putStagingEntryAndUpdateSession`, проверить resume/recovery и безопасную очистку временных копий без удаления источников и резервных копий; затем вводить перенос истории/tombstone в новую версию архива.
- Все изменения находятся в зависимом Draft PR #210 поверх #168. CI нового HEAD требует повторной проверки, main/deploy не затрагиваются.

---

## Контрольная точка — fail-closed полная архивация и восстановление видео (2026-11-20, Draft PR #210)

- Отдельная зависимая ветка от архивного Draft PR #168: `fix/full-archive-video-ledger-interlock-2026-11-20`. Видеостек #205→#209 **не объединён** с архивной веткой; изменение минимально и не переносит неподтверждённую модель удаления.
- `js/paseka-archive.js`: `readConsistentDatabaseSnapshot` читает `main/video_recognition_ledger_v1` в одной readonly-транзакции с `state` и `entrance_media`. Архив v1 не создаётся, если журнал распознавания не пуст или повреждён, потому что формат не переносит его.
- `js/paseka-archive-restore.js`: в финальных readwrite-транзакциях `commitStagedArchive` и `rollbackCommittedArchive` читается тот же ключ; в случае результатов распознавания или повреждённого журнала импорт/откат отклоняются без изменения `state`, `entrance_media`, `full_backup`, `archive_history` и staging. Проверка именно внутри write lock предотвращает потерю результатов при гонке с распознаванием.
- `tests/archive-export.test.mjs` и `tests/archive-restore-atomicity.test.mjs`: новые тесты проверяют распознанные/повреждённые результаты, сохранение прежнего поведения при пустом ledger, необратимость импортного overwrite и rollback при изменении ledger после подготовки, неизменность данных при отказе.
- **Это защитное ограничение, а не финальный формат архива.** Экспорт результатов и tombstone в `.paseka` отсутствует. Существующие архивы и оригиналы не стираются. Полное восстановление не может безопасно заменить данные при непустом ledger до проектирования следующей версии совместимого архива. Удаление видео по распознаванию не включено.
- CI на точном итоговом SHA должен быть отдельно проверен. `main`, production, физическая пасека и пользовательские данные не затронуты; PR #210 Draft, merge/deployment не выполнялись.
- Следующее: согласовать полноценный перенос `ledger/tombstone` через новую версию `.paseka` и все стадии (export, validation, stage, commit, rollback), затем сквозные тесты восстановления, отдельных backup-файлов, Android и внешних копий камеры.

---

## Контрольная точка — CI исправления истории rollback (2026-11-19)

- Актуальный GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`, не изменён.
- Основной Draft PR #168: HEAD `13137de26c6e756c144c84adde2851712c661775`, base main, `mergeable=true`.
- Исправление renderer истории в `index.html` использует `backupId || sourceBackupId`; регрессионный тест `tests/archive-restore-history-ui.test.mjs` входит в PR #168.
- Android workflow #44467107603 на точном HEAD #168 завершился `success`: **731/731 tests passed, 0 failures**, Capacitor sync, Gradle Debug APK build и artifact upload — success. Job ID `135369261478`.
- Artifact `paseka-debug-apk`, ID `14502782884`, size 3,451,620 bytes, ZIP SHA-256 `37e5378b362e4850685c727a69baaa7ea9d66458d7276ee6b0c1f74cbc32e139`, expires 2026-12-03. Это обычная Debug APK; не использовать для установки на телефон вместо изолированной test4.
- Физический commit/rollback ранее подтверждён на изолированной test3. Проверка исправленного отображения после rollback на test4 ещё не завершена.
- PR #174: HEAD `82afa8e4feaa9ebdabd4bf99ca7671a0b91fc842`, Draft, `mergeable=false`, base PR #168 на старом SHA `c7199c61f7161fc4b542e35d77f9318310939c37`. Ветку не сливать; она используется только для изолированной сборки. Триггер CI после обновления test4-теста ожидается.
- Lovable project `8193a703-9f20-4dc8-9460-8d93225ea25f`: `needs_attention / out_of_credits`, latest commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef`; этот SHA не найден в GitHub Pasekaapp, синхронизация с репозиторием не подтверждена.
- Следующий шаг: подтвердить изолированный workflow и артефакт с package ID `ru.paseka.journal.archive.test4`; затем физически проверить отображение исходного backup ID после rollback. Test2/test3 и их данные не удалять. Не выполнять merge, публикацию или production deployment.

---

## Контрольная точка — исправление истории отменённого импорта архива (2026-11-19)

- После физического испытания commit/rollback на OnePlus 10 Pro 5G обнаружено, что отменённая staging-сессия хранит исходный идентификатор архива в `sourceBackupId`, тогда как renderer читал только `backupId` и показывал `Архив undefined`.
- Исправлено в `index.html`: отображение истории использует `backupId`, затем `sourceBackupId`, и только при отсутствии обоих — явный текст «идентификатор не сохранён».
- Добавлен `tests/archive-restore-history-ui.test.mjs`, проверяющий отображение исходного ID после rollback.
- Перенос исправления выполнен непосредственно в основной feature PR #168, а не оставлен только в test-only PR #174. Коммиты исправления: `a84b6afbe32cd28b77e0ed437079317944fca600` и `d4cc8a9b26344cc0cb11bd5a190f1cc11a28b0d0`.
- CI после последнего изменения ожидается; до его завершения не считать исправление проверенным. PR #168 остаётся Draft, main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменялась.
- Физически подтверждены экспорт, preflight/staging, commit и rollback на изолированной test3; новые данные тестового приложения восстановлены. Test2/test3 сохраняются. Test4 предназначен для повторной проверки исправленной истории; не использовать рабочее приложение и не удалять тестовые установки.

---

## Контрольная точка — защита новых записей от потери при откате архива (2026-11-19)

- Read-only аудит выявил опасный пробел: прежний rollback проверял соответствие переданной вызывающим кодом revision текущей базе, но не сравнивал текущую revision с revision, созданной самим commit импорта. Поэтому после импорта новые записи журнала могли быть затёрты при откате.
- Исправление в `js/paseka-archive-restore.js`: Phase A проверяет, что текущая revision совпадает с `importedRevisionId` сохранённой committed import session; Phase B повторяет эту проверку внутри финальной readwrite-транзакции. Проверка в Phase B закрывает гонку, когда журнал изменяется во время асинхронной проверки rollback snapshot.
- При несовпадении возврат блокируется с кодом `ROLLBACK_STATE_CHANGED`; журнал, видео, история импорта и rollback snapshot остаются без изменений. UI сообщает, что новые записи сохранены и отмена заблокирована.
- Добавлены два регрессионных сценария: журнал изменён после импорта до вызова rollback; журнал изменён во время асинхронной проверки перед финальной транзакцией. Фикстура atomicity-тестов теперь содержит committed `importedRevisionId`.
- Дополнительно исправлен запуск isolated APK workflow: он выполняется только для pull request из ветки `test/full-archive-android-isolated-2026-11-18`; в PR #168 этот test-only workflow пропускается. Предыдущий запуск #44398348034 ошибочно упал на отсутствующем в PR #168 test-only script, хотя regression tests прошли 730/730; после gate новый запуск #44398558803 корректно skipped.
- На code/test commit PR #168 `e323ee7136e2d5377696c10eb10587aa5b29fa9b`: **730/730 tests passed, 0 failures**, Android Debug build/upload workflow #44398347933 — success. На синхронизированной тестовой ветке PR #174 commit `b116b93792289ed5bb69f408d98741b151a8cc3f`: **733/733 tests passed, 0 failures**, обычная Android Debug build/upload #44398375948 — success.
- После настройки workflow gate: PR #168 isolated workflow #44398558803 — skipped (ожидаемо); PR #168 standard Android build #44398558415 — success, 730/730 tests; PR #174 standard Android build #44398564428 — success, 733/733 tests; PR #174 isolated APK workflow #44398564375 — success, 733/733 tests, Gradle build, package ID assertion и upload. Artifact `paseka-archive-isolated-test-apk`, ID `14472093088`, размер 3,451,679 bytes, ZIP SHA-256 `35b11cd016a4bd0226c4d967ba2fba7b1ed783b341f5b6b398aeee82b537b352`, expires 2026-12-02 21:11:52 UTC; package ID `ru.paseka.journal.archive.test2`.
- Физическая проверка preflight на OnePlus 10 Pro 5G ранее завершена успешно; пользовательские рабочие данные не менялись. Commit/rollback на телефоне ещё не выполнялись.
- PR #168 и #174 остаются Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась. Merge, публикация и production deployment не выполнялись.

---

## Контрольная точка — изолированная APK с исправленным Android-сохранением готова (2026-11-18)

- Изолированный test-only PR #174 пересобран поверх PR #168, package ID: `ru.paseka.journal.archive.test2`, имя: «Пасека — архив тест 2». Предыдущее тестовое приложение остаётся отдельным и не затрагивается.
- Workflow #44389963111 на SHA `fd370ff3c89a34b4d218cfc3c6cfb06001cb7677`: **731/731 tests**, Android Gradle build, проверка package ID через `aapt` и upload — success.
- Artifact `paseka-archive-isolated-test-apk`, ID `14469105084`, SHA-256 ZIP `16008c7168df0b4e28364b3e0a61012f45c7c147fe3991d334a7636a0c7c7a48`, expires 2026-12-02 20:21:56 UTC. В APK непосредственно подтверждён package ID `ru.paseka.journal.archive.test2`; production ID отсутствует.
- В APK включён native MediaStore Downloads bridge; путь сохранения: `Downloads/Пасека`. CI подтверждает компиляцию и изоляцию, но не физическую запись файла на OnePlus.
- Для повторного теста нужно установить новую APK как отдельное приложение, создать тестовый улей (его имя присваивается автоматически), записать видео летка (оно сохраняется автоматически) и проверить, что файл появляется в `Загрузки/Пасека`. Старое тестовое приложение не удалять.
- После физической проверки скачать архив, проверить открытие файла вне приложения. Не запускать восстановление/rollback до подтверждения экспорта и проверки файла.
- PR #168 и #174 остаются Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась.

## Контрольная точка — исправление сохранения полного архива на Android (2026-11-18)

- По физическому тесту пользователя на OnePlus выяснено: архив формировался (UI показывал 1 видео летка, 2.6 МБ), но файл не появлялся. Причина в прежнем UI-коде: он создавал `blob:` URL, нажимал скрытую HTML-ссылку и сразу сообщал об успехе, не подтверждая, что Android WebView сохранил файл.
- Добавлен Android native Downloads bridge: generated Capacitor `MainActivity` регистрирует ограниченный JS interface, который потоково пишет файл блоками по 256 KiB через MediaStore в публичную папку `Downloads/Пасека`. Используются `IS_PENDING` до успешного завершения и удаление незавершённого файла при ошибке. Временные и пользовательские записи IndexedDB не затрагиваются.
- Android UI теперь сообщает об успехе только после того, как native bridge закрыл поток и снял `IS_PENDING`. При ошибке показывает конкретное сообщение. В обычном браузере остаётся download-link fallback.
- Добавлены: `js/paseka-android-download.js`, `scripts/prepare-android-archive-download.mjs`, `tests/android-archive-download.test.mjs`; обновлены `index.html`, `sw.js`, Android CI workflows и UI tests.
- Первый Android build выявил ошибку экранирования регулярного выражения в Java; исправлена. Финальный code/test SHA: `661ea9ad602bacdee3ab096a668fcbc56b167ec2`.
- Fast Quality Checks #44388526905: **728/728 tests, 0 failures**.
- Android build #44388526739 на том же SHA: Gradle Debug APK build/upload — success. Артефакт `paseka-debug-apk` ID `14465919073`, SHA-256 ZIP `d29002a7435fd99ccce7c8fb8b23f1006a40ded3e7bbf1977e2b8938700f026d`. Это сборка с production package ID `ru.paseka.journal`; **не устанавливать её на устройство для тестирования**.
- Требуется новая изолированная APK с отдельным package ID для физической проверки сохранения в Downloads. После неё проверить фактическое появление файла и размер, затем открытие архива вне приложения. Восстановление и rollback пока не запускать.
- PR #168 остаётся Draft; main не менялась, merge/deployment не выполнялись.

## Контрольная точка — подготовлена изолированная APK для проверки полного архива на OnePlus (2026-11-18)

- Для физической проверки PR #168 создан отдельный test-only Draft PR #174, ветка `test/full-archive-android-isolated-2026-11-18`, stacked поверх PR #168. Его workflow не меняет production appId: создаёт пакет `ru.paseka.journal.archive.test` только в CI workspace и проверяет application ID в готовом APK через Android `aapt`.
- Isolated archive workflow #44384033966 на SHA `9a688ba9746f781921f605eb6ba34a05607ad0c4`: **726/726 tests, 0 failures**, Android Debug APK build и package ID assertion — success.
- Artifact `paseka-archive-isolated-test-apk`, ID `14466525052`, ZIP SHA-256 `fee50ea2c5be4c1b07d86d524282f55d26c06fbc4946d69d876e8aed23e2eed1`, expires 2026-12-02 19:49:34 UTC. Workflow: https://github.com/250oisr-eng/Pasekaapp/actions/runs/44384033966
- Package ID в APK подтверждён: `ru.paseka.journal.archive.test`; production package `ru.paseka.journal` не используется. Приложение устанавливается отдельно от рабочей и прежней тестовой версий.
- Основной PR #168: последний code/test SHA `b0be11442083c2a3cc639d22b6bfee1b6910282f`; Fast Quality #44383207248 и Android #44383207220 прошли **723/723 tests**, APK build/upload success. Последующие коммиты в PR #168 — документационные и workflow-only.
- Физический тест экспорта, открытия файла вне приложения, восстановления и rollback на тестовых данных ещё не выполнен. Не использовать рабочее приложение или пользовательскую базу. Не сливать PR #168/#174 и не публиковать приложение.

## Обновление — IndexedDB v5 и регрессионные тесты (2026-11-18)

- Исправлено расхождение: приложение открывает IndexedDB версии 5; переход v4→v5 не создаёт stores и не преобразует пользовательские записи, но инициирует `versionchange`, чтобы старые вкладки закрыли подключения перед восстановлением.
- Добавлен тест v4→v5 с проверкой `main/state`, `full_backup/previous`, Blob в `entrance_media`, archive staging/history stores и сохранения legacy-видео без скрытой перезаписи. Обновлены проверки версии UI/видеомодуля и Service Worker cache v315.
- Итоговый code/test SHA: `b0be11442083c2a3cc639d22b6bfee1b6910282f`.
- Fast Quality Checks #44383207248 на этом SHA: **723/723 tests, 0 failures**.
- Android workflow #44383207220 на том же SHA: regression tests и подготовка web/Capacitor/Android прошли; Gradle APK build/upload ещё выполнялись на момент записи.
- Предыдущий промежуточный SHA `be18ddb151ee0ff86cff28296512c899ad95a8a8` имел 4 ожидаемо устаревших тестовых assertions (DB v4 и cache v314); все четыре исправлены. Не считать этот промежуточный прогон итоговым.
- Документация архива обновлена: IndexedDB v4 — добавление staging/history; v5 — versionchange barrier без структурной миграции; app schemaVersion остаётся 15.
- PR #168 остаётся Draft; main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не менялась. Физический Android экспорт/импорт ещё не проверен.

## Контрольная точка — защита от старых вкладок при восстановлении архива (2026-11-18)

- В аудите найдено несоответствие: комментарий в `commitStagedArchive` ссылался на закрытие старых вкладок повышением IndexedDB до v9, но приложение фактически открывало БД версии 4. Следовательно, вкладки старого кода могли остаться открытыми; защита от конкурентной legacy-записи видео не соответствовала комментарию.
- Исправление: IndexedDB object-store version повышена с 4 до 5. Новых object stores, индексов, преобразования записей или изменения app `schemaVersion=15` нет. Цель повышения — вызвать стандартное событие `versionchange`, чтобы старые подключения закрылись до восстановления; обработчик приложения дожидается очереди сохранения.
- Добавлен регрессионный тест upgrade v4→v5: проверяет сохранность `main/state`, `full_backup/previous`, оригинального Blob в `entrance_media`, всех staging/history stores и отсутствие принудительной перезаписи legacy-видео.
- Обновлён тест UI на IndexedDB v5 и Service Worker cache v315, чтобы офлайн-клиент получил обновлённый HTML.
- Изменены: `index.html`, `js/paseka-archive-restore.js`, `tests/indexeddb-startup-guard.test.mjs`, `tests/archive-ui-integration.test.mjs`, `sw.js`.
- Новый code/test SHA: `be18ddb151ee0ff86cff28296512c899ad95a8a8`. Fast Quality Checks #44382917507 и Android workflow #44382917325 выполняются; результаты ещё не подтверждены.
- PR #168 остаётся Draft. Main `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7` не изменена. До CI и проверки конфликта PR не считать этап завершённым.

## Контрольная точка — PR #168: полный архив и проверка целостности (2026-11-18)

- Main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- PR #168 остаётся Draft на ветке `feat/full-media-backup-restore-main-2026-11-18`. Последний проверенный code/test SHA: `52e587aa1f3e24c3f0de7aa221a8323d4cc7af51`.
- Fast Quality Checks #44333118570 на точном SHA: **722/722 tests, 0 failures**.
- Android PR workflow #44333131328 на том же SHA: **722/722 tests**, Debug APK build/upload success. Artifact ID `14439657825`, размер 3,446,813 bytes; ZIP SHA-256 `31658a873bc27fa4fabf127ba843c0f393b5e208ad321f2bb0f7595bbc2ed55b`.
- Защита данных: новые видео сохраняются с SHA-256; rollback восстанавливает legacy-видео с заново проверенной суммой; импорт проверяет revision, staged content, видео и выполняет замену атомарно.
- Защита экспорта: предыдущий Blob архива сбрасывается при каждом новом экспорте; Blob удерживается только если браузер поддерживает отправку файла; сообщения о fallback выводятся в статус экспорта.
- PR #169 остаётся Draft и зависит от #168; его ветка основана на более старом HEAD #168 и требует синхронизации после завершения текущего этапа.
- Не выполнены физическое скачивание/открытие/восстановление .paseka на Android. CI APK не заменяет проверку Android WebView/SAF.
- Merge, publish, production deployment и операции с пользовательскими данными не выполнялись.

---

## Уточнение статуса проверок — code/test SHA и документационный HEAD (2026-11-18)

- Последний SHA, на котором изменялись код и тесты PR #168: `3436c621c5de175259a0cf112feeaba84984bd5d`. На нём Fast Quality Checks #44331728300 и Android PR workflow #44331737784 прошли: 721/721 tests; Debug APK build/upload success, artifact 14439701927.
- После этих проверок добавлен отдельный documentation-only checkpoint. Не смешивать code/test SHA с текущим PR HEAD; актуальный PR HEAD всегда сверять через GitHub перед продолжением.
- После code/test SHA `3436c621c5de175259a0cf112feeaba84984bd5d` добавлены только документационные коммиты. Android workflow #44332204313 запускался на промежуточном documentation-only HEAD; он не меняет результат code/test проверок на `3436c621c5de175259a0cf112feeaba84984bd5d`.
- PR #168 остаётся Draft. Merge, publish и production deployment не выполнялись.

---

## Контрольная точка — PR #168: контроль целостности видео и CI (2026-11-18)

- GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`.
- PR #168 открыт, Draft, mergeable=true. Последний проверенный code/test SHA: `3436c621c5de175259a0cf112feeaba84984bd5d`; последующие изменения после него — только документация. Main не менялась.
- Fast Quality Checks #44331728300 на точном HEAD: **721/721 tests, 0 failures**.
- Android PR workflow #44331737784 на том же HEAD: **721/721 tests**, Debug APK build и upload успешны. Artifact `paseka-debug-apk`, ID `14439701927`, размер 3,446,730 bytes; SHA-256 ZIP-артефакта `d44c47515bc61599b5fdc3f93e6ac13287031a9da0e1a4acd4f662470d39b3fd`.
- Дополнительная защита: новые видео сохраняются с вычисленным SHA-256; при rollback для восстановленного legacy-видео записывается только что проверенная контрольная сумма. Добавлены тесты для same-size replacement и восстановления legacy media.
- PR #169 остаётся Draft и зависит от #168. Его HEAD `308b2f02ba218eef0f10197a7c5c97d2bd592c17` основан на прежнем #168 HEAD `cee7f51ce55490507ed6dea51939139b974d46c8`; сравнение с текущим #168 HEAD показывает diverged: 12 ahead / 6 behind. После завершения #168 требуется безопасно перенести навигационные изменения на актуальную базу, не теряя их.
- Не проверялись физическое скачивание/открытие .paseka и восстановление на реальном Android-устройстве. PR остаётся Draft; merge, publish и production deployment не выполнялись.
- Следующий этап: независимый code review PR #168; затем физический Android smoke test на тестовых данных; после этого синхронизировать зависимый PR #169.

---

## Контрольная точка — PR #168: полный архив медиа и атомарное восстановление (2026-11-18)

- Актуальный GitHub main: `8144ec8fe7e61c2f70f067c78f299bf0e7551dd7`. PR #154 действительно merged; merge commit совпадает с этим SHA. PR #154 code/test HEAD `2b66cd59e4acf05adb44b40b0991ecff56154d56`: 611/611 tests, Android Debug APK success; это проверки PR HEAD, а не отдельные workflow на merge SHA.
- Новый Draft PR #168 основан непосредственно на main, без отставания на момент создания. Текущий branch: `feat/full-media-backup-restore-main-2026-11-18`. Старая цепочка PR #9–#40 целиком не сливалась.
- Перенесены отдельные архивные модули codec, SHA-256, staging и atomic restore/rollback из проверяемой старой ветки #40; код интегрирован поверх актуального main. Старый CI #40 на SHA `52f43ed29d7037401c04526938f5230b5f7f675c` не заменяет проверку новой базы.
- Добавлен переносимый `.paseka`: единый readonly snapshot `main` + `entrance_media`; state JSON и отдельные оригиналы видео; SHA-256 по блокам 1 MiB; ограничение путей/размеров/метаданных; импорт сначала в persistent staging; атомарная замена только после явного подтверждения; rollback прежнего state и видео с revision guard.
- IndexedDB object-store version 3→4: добавляются только `archive_staging` и `archive_history` с индексами. Существующие `main`, `full_backup`, `entrance_media` сохраняются; app schemaVersion не меняется; преобразования пользовательских записей при upgrade нет.
- JSON/automatic backup по-прежнему не содержат отдельные оригиналы видео. Подписи интерфейса уточнены, чтобы не называть JSON полной мультимедийной копией. Полный архив остаётся локальным: внешние сервисы, загрузка на сервер и платные зависимости не добавлены.
- Добавлены тесты формата, экспорта, SHA-256, staging, cleanup, atomicity, UI/offline и upgrade v3→v4 с сохранением существующих данных. Fast Quality Checks #44322389285 на SHA `6851bbc397674d2fdbe3a3819ab04cc0c7217a0b`: 715/715 tests, 0 failures. Android PR workflow #44325832906 на точном текущем HEAD `4386d3b38a1c31303e5f9b19ad3ce7cf51f1bb20`: 715/715 tests, 0 failures; Android Debug APK build/upload success; artifact `paseka-debug-apk`, ID `14436487643`, 3,446,523 bytes. Fast Quality Checks #44322389285 на code/test SHA `6851bbc397674d2fdbe3a3819ab04cc0c7217a0b`: 715/715, 0 failures. На промежуточном Android run #44322813466 также были успешны 715/715 и сборка APK. Старый CI PR #40 не использовался как доказательство совместимости с main.
- Lovable `Apiary Family Atlas`: опубликован, последний commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef`, агент `needs_attention / out_of_credits`; синхронизация с GitHub main не подтверждена.
- Не выполнялись merge, публикация, production deployment, изменение production DB или операции с пользовательскими данными. Физическое Android-тестирование сохранения/открытия .paseka вне приложения остаётся отдельным release gate.

### Следующий шаг
Следующий шаг: независимый code review всего PR #168 и подготовка физической проверки Android: скачать .paseka, сохранить вне приложения, выбрать этот файл и выполнить тестовое восстановление на отдельном/пустом тестовом профиле без пользовательских данных. Текущий HEAD a5dfbda620feed2b9188bf82ddc3a62cb8ab21d9, main 8144ec8fe7e61c2f70f067c78f299bf0e7551dd7; PR #168 Draft, 12 commits ahead / 0 behind, mergeable=true. Android и quality workflows прошли на точном code/test HEAD. Lovable latest commit 2196e3fd478fbb58810d6a78317c0ddd056dfdef не совпадает с веткой PR; синхронизация не подтверждена. Не объединять без отдельного разрешения.
 
---

## Контрольная точка — OP-07 и резервная безопасность (2026-11-17)

- PR #154: code/test HEAD `2b66cd59e4acf05adb44b40b0991ecff56154d56`; Fast Quality Checks #44169456462 — **611/611 tests, 0 failures**; Android Debug APK PR run #44169468103 — success; push run #44169456444 — success.
- Добавлены два migration regression tests: schema 14→15 сохраняет существующий `sectionalTechProcesses`; неправильный тип блокирует миграцию без изменения исходного состояния. Сам migration guard уже присутствовал; его логика не менялась.
- Пользовательское правило OP-07: установка решёток/медовых корпусов либо одновременно со вторым рядом, либо через 12–15 дней после него. Код принимает 0/12/15 и отклоняет 11/16; `AFTER_OP06` остаётся отдельным source-backed сценарием.
- **Новый production blocker:** в текущем main ручной `downloadBackup()` экспортирует только `{app:'Paseka', state:S}`, а `writeAutoBackup()` сохраняет только `S`. Оригиналы видео находятся отдельно в IndexedDB store `entrance_media` и в эти копии не входят. В main нет интегрированного контейнера `.paseka` и staging-импорта; JSON-копия не является полным архивом мультимедиа.
- Полный архивный стек PR #9–#40 остаётся незлитым. PR #14 — корневой Draft, его ветка diverged: 96 commits ahead / 109 behind main; PR #40 содержит позднюю финализацию staging и проверку rollback ownership. Нужны отдельный аудит, перенос/rebase на актуальный main и повторный CI. Не сливать старую ветку как есть.
- В репозитории **93 открытых PR, все Draft**; 19 PR имеют base=main. Только #148 из корневых веток находится на актуальной базе (83 ahead / 0 behind); остальные 18 корневых веток diverged и отстают от main на 105–109 commits. Не закрывать и не объединять автоматически.
- Активная технологическая цепочка: #148 → #149 → #87 → #150 → #151 → #152 → #153 → #154; все остаются Draft, профиль секционного улья не активирован. Main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Следующий приоритет — восстановить полное резервное копирование и безопасное восстановление видео; журнал обработок Varroa отложен до закрытия этого пробела. Слияние PR, production и публикация требуют отдельного разрешения.

---

## Контрольная точка — OP-07: подтверждён срок 12–15 дней (2026-11-17)

- Пользователь подтвердил два допустимых варианта установки двух больших разделительных решёток и медовых корпусов: **сразу вместе со вторым рядом** (0 календарных дней) либо **через 12–15 календарных дней после второго ряда**. Диапазон — отдельное пользовательское уточнение; не приписывать его DOCX.
- `AFTER_OP06` сохраняется как отдельная последовательность по источнику P20–P23; она не подменяется двумя вариантами срока относительно второго ряда.
- В рабочей ветке `fix/op07-12-15-day-window-2026-11-17` обновлены OP-07 coordinator и регрессионный тест: completion guard и inspector сверяют фактическую разницу календарных дней с сохранённым evidence; разрешены только 0 дней для немедленного варианта и 12–15 дней включительно для отложенного. Интервалы 11 и 16 дней отклоняются с rollback.
- PR #154 открыт как Draft поверх PR #153: base SHA `ef8fe87fd3336cff82aa31b7c99064d930d016c8`, проверенный code/test HEAD `6dd961b2df6fd859da558806a4e1edcdbbd6587c`; после проверенного code/test HEAD добавлялись только документационные уточнения; код и тесты не менялись; mergeable=true. Workflow #44166954651 на точном HEAD `6dd961b2df6fd859da558806a4e1edcdbbd6587c` завершился success: regression tests, Android Debug APK build и upload успешны. Artifact #14365802511, SHA-256 `2649c600f9d1a4d2051c3a29364ce05879d3ff4d8f4eb5e3a13561e6310b9f60`.
- Основная цепочка #148 → #149 → #87 → #150 → #151 → #152 → #153 → #154 остаётся Draft/unmerged; профиль секционного улья не активирован. Main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- IndexedDB, миграции, backup, production и пользовательские данные не изменялись.

---

## Контрольная точка — интеграционный аудит PR #148–#153 (2026-11-17)

- Проверены актуальные refs GitHub: `main` = `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #152 HEAD = `a82d4137a6f1edab5066cc50f123642d6ea8ecfa`; PR #153 HEAD = `4beec099169eef39d4d36560905fca4ac0583c91`.
- PR #148, #149, #87, #150, #151, #152 и #153 открыты, Draft, не объединены; GitHub показывает mergeable=true для всех проверенных PR. Профиль секционного улья не активирован.
- Итоговый diff #152 относительно main содержит 28 файлов: 13 документационных/проектных и 15 файлов приложения/тестов. Цепочка зависимостей и merge-base подтверждены; PR #152 опережает main без отставания.
- PR #152 code/test SHA `94dd47ea6b904b9336f1adb4aa962233a163e4d6`: 609/609 tests, 0 failed (run #44160434256); Android Debug APK build/upload успешны (runs #44160451891 и #44160435353). После этого в #152 добавлены только 15 документационных коммитов до HEAD `a82d...`; сравнение подтверждает, что code/test SHA не изменился.
- PR #153 синхронизирован с текущим base #152. Сравнение refs `feat/full-installed-corpus-frame-capacity-2026-11-17` → `docs/varroa-treatment-sublimation-2026-11-17`: 0 commits behind, изменены ровно 9 документов, код и тесты отсутствуют. Текущий HEAD #153: `4beec099169eef39d4d36560905fca4ac0583c91`; GitHub mergeable=true.
- Открытый технологический вопрос: P41–P42 говорят «примерно около 12 дней» после установки второго ряда, но не задают допустимое отклонение. Текущая positive-only проверка не является строгой проверкой диапазона. Требуется пользовательское решение; до него не вводить числовой допуск.
- P42 отдельно разрешает выполнить установку решёток и медовых корпусов сразу вместе со вторыми корпусами. Это альтернативный вариант, не обязательная задержка.
- Остальные ограничения: позднее добавление второй пары медовых корпусов по P37 не реализовано; двухматочная ветвь OP-06 остаётся fail-closed; порамочная история осмотров/содержимого — отдельная задача.
- Varroa: пользователь подтвердил сублиматор щавелевой кислоты; параметры дозы, подготовки, интервалов, температуры и безопасности неизвестны. PR #153 документирует только подтверждённый метод и отделяет лечение от мониторинга.
- Lovable: агент `needs_attention / out_of_credits`; последний Lovable commit не найден в GitHub Pasekaapp, синхронизация не подтверждена.
- Изменения не затрагивают production, пользовательские данные и production deployment. Все PR остаются Draft.

---

## Подтверждённое уточнение пользователя — обработка Varroa (2026-11-17)

- Способ обработки от клеща: сублиматор щавелевой кислоты. Это прямое подтверждение пользователя, а не требование из DOCX.
- Текущий `js/varroa-monitor.js` фиксирует наблюдения (пробы взрослых пчёл и контрольный поддон), но не фактически выполненные обработки.
- Будущий журнал обработок должен быть отдельным от мониторинга и создавать запись только после явного подтверждения реально выполненной операции.
- Доза/масса кислоты, подготовка/концентрация, число и интервалы обработок, температура/погодные ограничения, ограничения по расплоду/маткам и меры безопасности не подтверждены. Не автозаполнять и не рекомендовать их по догадке.

---

# Актуальное состояние проекта — 2026-11-17

## Контрольная точка — 2026-11-17: аудит истории операций и времени завершения

- Актуальный GitHub main: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0` (проверен через branch endpoint; не использовать устаревший документальный SHA PR #146).
- Основная цепочка #148 → #149 → #87 → #150 → #151 → #152 остаётся Draft и не объединена; PR #153 — отдельный docs-only Draft поверх #152. Профиль секционного улья не активирован.
- Актуальный code/test SHA PR #152: `94dd47ea6b904b9336f1adb4aa962233a163e4d6`. Fast quality checks #44160434256 — **609/609 tests passed, 0 failed**. Android Debug APK push run #44160451891 и PR run #44160435353 — **success**. Artifact #14362223647, 3 409 708 bytes, SHA-256 `3d4b5dcc88a01f2eac80d23a40aa5863f89158ee5f224419ed43dd0d57916965`, срок хранения до 2026-12-01.
- Интеграционный дефект OP-05 исправлен: все три app-level вызова `PasekaSectionalOperationCoordinator.inspect()` передают `PasekaFamilyLineage` и `PasekaSectionalPhysicalLayout`; добавлен тест на все call-sites.
- Исправлена проверка истории OP-05 после OP-06: инспектор теперь проверяет события установки по историческому списку всех восьми снятых/установленных заглушек, а не только по тем, которые остаются в раскладке. Добавлен тест, удаляющий исходное событие установки после OP-06 и проверяющий обнаружение повреждения.
- Все пять критических completion API OP-04, второго ряда OP-04, OP-05, OP-06 и OP-07 теперь отклоняют будущую дату завершения. Добавлен единый тест на все пять путей; тестовый clock внедрён через зависимость, production использует системное время.
- Открытый технологический вопрос: P41–P42 описывают «примерно 12 дней» для альтернативного срока OP-07, но не задают допустимый диапазон. Код пока принимает любой положительный интервал; это не строгая проверка соответствия источнику. Нужен ответ пользователя.
- Остальные границы: последующее добавление второй пары медовых корпусов по P37 не реализовано; двухматочная ветвь OP-06 остаётся fail-closed; порамочная история осмотров/содержимого — отдельная задача.
- Varroa: пользователь подтвердил сублиматор щавелевой кислоты; параметры дозы, числа/интервал обработок, температуры и безопасности не заданы. PR #153 документирует только подтверждённый метод и отделяет лечение от мониторинга.
- Lovable: агент `needs_attention / out_of_credits`; последний Lovable commit не найден в GitHub Pasekaapp, синхронизация не подтверждена.
- Эти изменения не затрагивают IndexedDB schema, миграции, backup format, пользовательские данные или production. Merge, production deployment и публикация не выполнялись.

## Следующий приоритет

Завершить независимую проверку diff всей цепочки и подтвердить, что PR #153 остаётся документационным: без изменений кода и тестов относительно актуального #152. До признания технологической цепочки готовой к интеграции запросить у пользователя допустимый диапазон дней для формулировки «примерно 12 дней» P41–P42.

# Предыдущая контрольная точка — до реализации PR #152 (2026-11-17)

- Подтверждённый SHA основной ветки `main`: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Main не изменялась.
- Основная открытая технологическая цепочка остаётся Draft и не объединена: PR #148 (`27cb4de3f8bf8848475aa9877bb84affb7a51a83`) → #149 (`f8053b9a91e873ecfd61c07f5f8657ca53b42a02`) → #87 (`92bcb926a6aff9ed2a05c555ab9841fe31adddc2`) → #150 (`70583dc435674de5984640b727cc3f6064c2ca17`) → #151.
- PR #151 Draft, head `31299ab5fe556d08c6604f27a70d666839dcc7c7`; последний code/test head до документационных уточнений — `481fdd956fa040e1f5038fe975fbf461a23eea89`. Workflow #44148886358: **599/599 regression tests passed**, Android Debug APK build и artifact upload — success. Проверка относится к указанному code/test head; после него в ветку добавлялись только документационные изменения, повторный CI на docs-only head не запускался.
- Предыдущий workflow #44147147221 на более раннем SHA был отменён во время Android build; успешный run #44148886358 является более поздней проверкой PR #151.
- Пользователь закрыл вопрос о «пустых корпусах»: P57 — временный корпус без рамок для стряхивания пчёл, который не учитывается приложением; P77 — незаселённый корпус с рамками, который учитывается как обычный установленный корпус. Каждый установленный и учитываемый корпус должен иметь ровно полную вместимость рамок.
- В PR #150 пока остаётся разрешение неполной медовой рамки/корпуса и тест, допускающий 9/10 рамок. Это теперь противоречит решению пользователя. PR #152 должен исправить OP-07 и общий валидатор комплектности до интеграции этой цепочки.
- Профиль секционного улья не активирован. Production, пользовательские данные, IndexedDB и production deployment не менялись.

## Следующий приоритет

Создать PR #152 поверх PR #151: единая проверка полного количества рамок для всех учитываемых установленных гнездовых и медовых корпусов; убрать разрешение 9/10 рамок из OP-07; сохранить вне учёта временный корпус P57; добавить регрессионные тесты и отдельную историю наблюдений содержимого каждой рамки (не смешивать с типом сота). До прохождения интеграционных проверок не объединять цепочку и не активировать профиль.

## Контрольная точка — 2026-11-17: исправление привязки гнездовых рамок секционного улья

- В ходе аудита PR #151 выявлено: реестр рамок распознавал установленные корпуса только через `honeyStack.bodyIds`, но не через `sections[].broodBodyIds`. Из-за этого рамки гнездовых корпусов секционного улья могли отображаться как складские.
- Исправлен поиск физического расположения: рамки из `sections[].broodBodyIds` теперь относятся к соответствующему улью и секции; добавлен регрессионный тест.
- Изменения кода: `fd14c306890bf6976eb849e3df9b668ad3994365`; тест: `62b8e6f7d3e07a0c96816bb23e2af4c8e6194c38`.
- Android workflow #44147147221 на тестовом HEAD `62b8e6f7d3e07a0c96816bb23e2af4c8e6194c38` выполняется. До завершения не считать новую правку проверенной. Ранее 598/598 и APK success относятся к предыдущему code/test SHA `9677657799af28f5caaa6ee242c3f7186e694003`.
- `main`, пользовательская база, production и активность профиля не изменялись.

---

## Контрольная точка — 2026-11-17: идентификация и история оборудования

- PR #151 Draft. Код/тесты SHA: `9677657799af28f5caaa6ee242c3f7186e694003`; полный регрессионный набор: **598/598 passed**, 0 failed (run #44144631787). Android Debug APK build/upload успешны (run #44144644403).
- Документационный HEAD PR #151: `aef79c41c87a14a0cbe8b51616bf9942398186fd`; Android build check #44145100531 и Cloudflare preview check завершились успешно. Preview не является production deployment.
- Реализованы постоянные коды и UID всех фактических рамок, миграция ID старых событий, проверка дубликатов, единый обработчик истории перемещений и append-only журналы рамок/корпусов без обрезания 300/1000 событий.
- Пользователь подтвердил: каждый корпус и каждая рамка имеют постоянную идентификацию; любое перемещение сохраняется в истории.
- Полная вместимость корпусов и порамочный учёт содержимого пока не реализованы; следующий этап остаётся заблокирован до уточнения технологического исключения ниже.
- В DOCX P57 и P77 описаны намеренно пустые корпуса в технологических операциях. Нужно подтвердить, распространяется ли правило полной вместимости на эти корпуса. Складские корпуса, не установленные в улей, не следует автоматически считать установленными.
- PR #148 → #149 → #87 → #150 → #151 остаются открытыми Draft и не объединены. Main не менялась; production не изменялся.

---

## Контрольная точка — 2026-11-17: постоянная идентификация рамок и корпусов

- Пользователь подтвердил: каждый физический корпус и каждая рамка должны иметь постоянную уникальную идентификацию; все перемещения фиксируются с исходным и конечным местом. ID не меняется при переносе.
- Ранее коды корпусов/рамок уже существовали, но UID назначался только маркированным рамкам, а журналы обрезались после 300 событий корпуса и 1000 общих событий.
- PR #151 (Draft, base PR #150) расширяет миграцию на все фактические рамки, назначает короткий код и UID, сохраняет прежние коды, добавляет ID старым событиям без выдумывания времени, проверяет дубликаты и повреждённые записи.
- Новые события рамок содержат ID и timestamp; все основные пути перемещения используют общий обработчик. Журналы рамок и корпусов больше не обрезаются. Проверка состояния/сохранения отклоняет отсутствие идентификации и повреждённые журналы.
- CI на актуальном HEAD PR #151 ещё не подтверждён; не заявлять успешную проверку до завершения.
- Полная вместимость каждого установленного корпуса пока не реализована в этой ветке. Следующий этап должен запретить установку неполного корпуса и заменить прежний тест OP-07, допускавший 9/10 рамок.
- Следующий этап модели: по каждой рамке отдельно хранить тип сота (сушь/вощина) и историю осмотров/содержимого (расплод, яйца/личинки, перга, нектар, мёд и т. п.). Содержимое не угадывать; неизвестное обозначать как не осмотренное.
- Требование идентификации/истории/полной вместимости — пользовательские решения, а не цитаты DOCX. PR #148 → #149 → #87 → #150 → #151 открыты, Draft PR #151; main не менялась. Профиль секционного улья не активировать.

---

## Контрольная точка — 2026-11-17: правило рамок раннего медосбора подтверждено

- PR #150 остаётся Draft, base PR #87; code/test SHA: `482e086f8b2ca81abc343e94989dcc2e0baba617`. Цепочка PR: #148 → #149 → #87 → #150. Main SHA: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Android workflow #44134181352 на точном docs HEAD `a314ba2da92274fe91310077980cde1552d31a8f` завершился успешно: **589/589 tests passed**, 0 failed; Android Debug APK build/upload успешны. Artifact #14351931133, 3,406,838 bytes, SHA-256 `fd5edbc7097a39f898d1d07485a11e5cc8c4340210937b5e2f58e07aca0c8b8f`.
- Пользовательское уточнение P80: в каждом медовом корпусе допускается не более двух рамок с вощиной; каждая такая рамка должна быть строго между рамками суши, соседние рамки с вощиной запрещены. Ограничение считается отдельно для каждого корпуса, не для пары.
- OP-07 валидирует упорядоченные `body.frames[]`: каждый установленный медовый корпус содержит ровно 10 рамок; в раннем медовом корпусе должна присутствовать сушь. `combType` обязателен (`drawn_comb` или `wax_foundation`); не более двух `wax_foundation` на корпус; у каждой такой рамки непосредственные соседи с обеих сторон должны быть `drawn_comb`. Неполный/переполненный корпус отклоняется до commit с полным rollback. История рамок сохраняется в записи корпуса и связывается с фактическим местом установки.
- Регрессионные тесты проверяют точную комплектность (в том числе отказ для 9/10), превышение лимита, соседние и крайние рамки вощины, неизвестный тип и разрешённые две рамки вощины на каждом корпусе.
- Остаются два неразрешённых вопроса OP-07: допустимый диапазон для «примерно 12 дней» P42 и отдельная операция поздней установки второй пары корпусов по P37. OP-06 остаётся fail-closed для двухматочного сценария.
- После документационных изменений требуется проверка CI на их новом HEAD SHA. UI, профиль активации, IndexedDB schema, Service Worker/cache, пользовательские и production-данные не изменялись. Слияний и публикаций не выполнялось.
- Merge PR, публикация PWA и production deployment требуют отдельного явного подтверждения пользователя.

---
---
---
---
---
---
## Контрольная точка — 2026-11-17: OP-06 проверен на полном CI

- Code/test SHA PR #87: ec3da5ee26d159bd2d7e71feac02c5a0b8f61d94.
- Android workflow run #44122663248 на точном SHA завершился success: 577/577 tests passed, Android Debug APK build и upload успешны. Artifact #14345074070, 3,402,199 bytes, SHA-256 a2b33cb34030537ba82b7229afaec0a918c80851effc4694ac03113e95c5caed, expires 2026-12-01.
- В процессе проверки исправлены ошибки TDZ в проверке исторической установки OP-05, тестового ID generator и несоответствие реального event type moved_to_storage при снятии заглушек. Финальный CI на SHA ec3da5e — зелёный.
- OP-06: append-only laying_observed для каждой матки; три идентифицированные действующие матки; 20–21 день от OP-04.startedAt; снятие всех 8 реальных заглушек либо явное подтверждение, что optional OP-05 не выполнялась; partial/reduced two-queen branch блокируются.
- PR #87 Draft, base PR #149 (base SHA f8053b9a91e873ecfd61c07f5f8657ca53b42a02); PR #149 Draft stacked на PR #148. Mergeable PR #87 = true. Main SHA d8fd021a3a6ab4ed9613dbd558205bdf24e96be0 не менялась.
- UI/профиль, IndexedDB/schemaVersion/backup, пользовательские данные и production не менялись.
- Следующий этап: отдельный аудит OP-07 и реальных предусловий установки двух больших разделительных решёток и медовых корпусов. Не объединять PR автоматически: сначала проверить всю цепочку #148→#149→#87 и открытые конкурирующие ветки.

---

## Контрольная точка — 2026-11-17: OP-06 реализован в отдельном stacked PR; CI ожидается

- Исходный DOCX повторно открыт: P20 описывает снятие временных сетчатых заглушек через 20–21 день от первоначального разделения, когда все матки вернулись с облёта и начали откладывать яйца. P21 допускает дополнительное открытие летков/вкладышей, но не делает его частью обязательного OP-06. P22–P23 относятся к следующему этапу.
- Прежняя ветка PR #87 была основана на устаревшей цепочке #84. Её рабочая ветка переведена на актуальную основу PR #149; PR #87 теперь stacked поверх #149 и остаётся Draft.
- В js/family-lineage.js добавлено append-only queenEvents.laying_observed для текущей идентифицированной матки, семьи, split event OP-04, techProcessId и времени наблюдения; требуется явное подтверждение пчеловода.
- В js/sectional-operation-coordinator.js добавлен completeOP06(): 20–21 календарный день от OP-04.startedAt; обязательны три текущие идентифицированные матки и наблюдение яйцекладки каждой. При наличии OP-05 снимаются все 8 реальных заглушек через equipment registry. Если OP-05 пропущена, требуется явное подтверждение отсутствия заглушек. Частичное покрытие и двухматочная ветвь блокируются.
- OP-05 остаётся в истории после снятия: валидатор проверяет историческое покрытие и события установки/снятия. Остальные элементы раскладки не меняются; перемещения, физическое состояние, технологическая запись и auditLog коммитятся атомарно.
- Добавлены тесты append-only наблюдений, снятия 8 заглушек, пропуска OP-05, отсутствующего наблюдения, неправильного срока и rollback. Первый CI run #44121261362 на промежуточном SHA d80a0b1 завершился 568/577 passed, 9 failed; ошибки TDZ и тестового ID-generator исправлены. Повторный CI на актуальном HEAD пока не подтверждён; Android build в первом run не запускался из-за провала тестового шага.
- Main SHA d8fd021a3a6ab4ed9613dbd558205bdf24e96be0 не менялась; PR #148/#149/#87 остаются Draft. UI/профиль, IndexedDB/schemaVersion/backup, пользовательские данные и production не менялись.
- Следующий шаг: получить полный Android workflow на актуальном HEAD PR #87, исправить оставшиеся ошибки, затем проверить stacked PR diff/base/head SHA. Не объединять до проверки всей цепочки.

---

## Контрольная точка — 2026-11-17: OP-05 и двухрядная геометрия реализованы; CI проверен

- По DOCX P17–P18 металлические сетчатые заглушки рекомендуется установить на 8–11-й день после разделения; P18 прямо допускает не выполнять эту операцию. Поэтому OP-05 — необязательная рекомендуемая операция: её отсутствие не блокирует состояние после OP-04. Число заглушек определяется фактическими отверстиями. OP-06 остаётся отдельной операцией.
- В Draft PR [#149](https://github.com/250oisr-eng/Pasekaapp/pull/149) добавлен `completeOP05()`: требует завершённого OP-04, неизменной физической раскладки, явного подтверждения, пригодных реальных заглушек на складе и полного покрытия всех фактических `openingId`. Отдельно требуется явное подтверждение ровной подставки (DOCX P17); подтверждение сохраняется в evidence и auditLog. Проверяются окно 8–11 календарных дней от начала разделения и порядок относительно завершения OP-04.
- Планировщик перемещений учитывает `temporaryQueenIsolation`. В одной транзакции фиксируются раскладка, перемещения предметов и их события, запись OP-05 и auditLog. Ошибка на любом шаге оставляет исходное состояние неизменным.
- `inspect()` проверяет статус OP-05, соответствие доказательств реальным заглушкам/отверстиям, полноту покрытия, подтверждение ровной подставки, ID событий перемещения в индивидуальном и общем журналах и временную последовательность. Добавлено 14 регрессионных тестов: 12 для coordinator OP-05 и 2 для полноты двухрядной физической раскладки.
- После детальной сверки P10–P11 физическая модель исправлена: каждый ряд имеет схему 1+2+1; первый ряд — 4 отверстия, двухрядная конфигурация — 8. Валидатор требует по одному отверстию на корпус крайних секций и по два на корпус средней секции, все отверстия связаны с реальными техническими решётками; при установке второго ряда первые 4 решётки остаются на месте, ещё 4 ставятся из склада.
- Code/test SHA PR #149: `e5f4c78ecedd3da50be70a7e66962bc54c6dbb28`; последний проверенный docs HEAD: `1a2b796a692a0880b1d3547d65d19928238bf643`. Android workflow run [#44107389196](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44107389196) на точном HEAD завершился **success**: 572/572 tests, Android Debug APK build и upload — success. Artifact #14338499255, 3,399,950 bytes, SHA-256 `29efb2909cf3d1d13a36c4da3c54ff025ca455c035ab3928881cf5f7754fcb3f`, expires 2026-12-01. Combined status не вернул отдельных status contexts; подтверждён именно workflow run. Этот status-коммит сдвинет branch HEAD; при следующем сеансе получать актуальный SHA из GitHub branch ref.
- PR #149 остаётся Draft и основан на PR #148 (base SHA `27cb4de3f8bf8848475aa9877bb84affb7a51a83`). PR #148 остаётся Draft. Main SHA `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0` не менялась.
- IndexedDB, schemaVersion, backup format, пользовательские данные, production и UI не менялись; профиль не активирован.

### Проверка отдельного проекта Lovable — read-only, 2026-11-17

- В workspace Lovable обнаружен отдельный проект **Apiary Family Atlas**. Он связан с репозиторием `250oisr-eng/apiary-family-atlas`, а не с текущим `250oisr-eng/Pasekaapp`; его latest commit `2196e3fd478fbb58810d6a78317c0ddd056dfdef` существует в первом репозитории и отсутствует во втором.
- Lovable сообщает: workspace Free, проект `needs_attention / out_of_credits`, агент завершил работу; `is_published=true`, audience `public`, последняя правка 2026-11-17 08:52 UTC. Project knowledge пустой.
- Это отдельная кодовая база с другим стеком и собственной историей PR. Не синхронизировать её с `Pasekaapp` и не изменять без отдельного решения о выборе единственного источника истины.
- Никакие изменения, публикация, деплой или расходование кредитов Lovable в ходе этой проверки не выполнялись. Текущая разработка продолжается в `Pasekaapp` согласно паспорту проекта.
- PR #149 остаётся Draft, основан на PR #148; mergeable=true, behind_by=0. PR #148 Android workflow run #44097595158 завершился success. Main `d8fd021a...` не менялась. Следующий этап — отдельная реализация OP-06: append-only подтверждение яйцекладки каждой из трёх маток, проверка 20–21 дня от `OP-04.startedAt`, атомарное снятие 8 заглушек или подтверждение их отсутствия при пропуске OP-05. Двухматочная ветвь остаётся fail-closed; P20 и действия P21 не смешивать с OP-06.
---

## Контрольная точка — 2026-11-17: атомарный OP-04 теперь поддерживает оба ряда

- Подтверждённая геометрия первого ряда: три корпуса в один ряд, каждый на отдельном днище; в каждом из трёх стеков по одному днищу, подкрышнику и крыше. DOCX P10 упоминает два днища; прямое уточнение пользователя о трёх имеет приоритет и отдельно отражено как расхождение.
- `completeOP04()` поддерживает начало разделения с `broodRows: 1`: запись OP-04 остаётся `IN_PROGRESS`, событие аудита фиксирует начало.
- Добавлен `completeOP04SecondRow()`: явное подтверждение, три новых корпуса со склада, согласованные технические отверстия/принадлежности, временная последовательность, журнал перемещений и один атомарный commit. После проверки OP-04 становится `DONE`; при ошибке исходное состояние не меняется.
- `inspect()` проверяет согласованность `broodRows`, `rowStage` и статуса операции; старые записи без новых полей сохраняют двухрядную трактовку.
- Code/test SHA `0d81b2f6f9452932f67b99bda98bca02f7d4f602`: Fast quality checks run [#44097238313](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44097238313) — **558/558 tests passed**; Android Debug APK run [#44097235721](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44097235721) — **success**, regression tests, APK build и upload завершены.
- Документация модели, ТЗ, сверки источника, плана, состояния, журнала, передачи и карты PR обновлена. Перед статусным коммитом branch HEAD был `614b29f1dc5082abd866aea10b441840c9df08d7`; после записи получать актуальный SHA из GitHub branch ref.
- `main` остаётся `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #148 остаётся Draft и не объединён. UI и профиль не активированы.
- Следующий этап: аудит и атомарная реализация OP-05; не переходить к OP-06/UI до подтверждения предусловий и тестов rollback.

---

## Контрольная точка — 2026-11-17: пользователь подтвердил первоначальную раскладку OP-04; валидатор поддерживает один ряд

- Подтверждено пользователем: три гнездовых корпуса стоят в один ряд, каждый на отдельном днище; уже на этой стадии используются три подкрышника и три крыши. Во всех рабочих состояниях остаётся комплект 3+3 для подкрышников/крыш.
- DOCX P10 говорит о двух днищах. Это расхождение с прямым подтверждением пользователя сохранено в `docs/СВЕРКА-ТЕХПРОЦЕССА-С-ИСТОЧНИКОМ.md`; модель использует три днища. DOCX P11 разрешает установить второй ряд сразу или через несколько дней.
- Изменён `js/sectional-physical-layout.js`: `broodRows: 1|2` для SIDE_BY_SIDE; старые записи без поля остаются двухрядными. Изменены `tests/sectional-physical-layout.test.mjs` и `tests/sectional-operation-coordinator.test.mjs`: тест первого ряда и запрет считать его завершённым OP-04.
- Code/test SHA `2a70452abf256f0571206894c19e13e04553ffba`: Fast quality checks run [#44096138371](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44096138371) — **556/556 tests passed**; Android Debug APK PR run [#44096148887](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44096148887) — **success**, включая regression tests и сборку APK. Отдельный Android push run #44096138401 на момент проверки ещё выполнялся.
- Документы модели, ТЗ, сверки источника, плана, состояния, журнала, передачи и карты PR обновлены. Рабочая ветка PR #148; до статусного обновления её последний известный HEAD `788fe306ac3fe05a2333e6d08c0bdd4b234785a0`. После обновления получать HEAD непосредственно из GitHub branch ref. `main` остаётся `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`.
- Открыто: атомарный переход `broodRows: 1` → `broodRows: 2`; профиль/UI не активировать до его реализации и проверки. PR #148 остаётся Draft, не объединён.

---

## Восстановление после обрыва — 2026-11-17: проверен PR #148 и исходный DOCX

- Последняя операция до восстановления: документационный коммит `3507e1738c33dfdc4789827c8d9c62f0450d6fe3`. Журнал восстановлен коммитом `afc5cec22fc608c83e94e3aa0f6cb4f61832a6e9`, затем уточнён коммитом `550cda98e7e74bfe37150f011e9929b0a934bc35`. Текущий HEAD всегда получать из GitHub branch ref при начале сеанса: сам этот файл фиксируется отдельным коммитом и поэтому не должен быть источником собственного SHA.
- Репозиторий `250oisr-eng/Pasekaapp`; default branch `main`. Фактический main HEAD: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Он совпадает с base PR #148. Main после этой контрольной точки не менялся.
- PR [#148](https://github.com/250oisr-eng/Pasekaapp/pull/148) открыт, Draft, не объединён; base `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`. Текущий head брать из branch ref `feat/sectional-op04-atomic-coordinator-2026-11-17`, не из сохранённого здесь SHA. Последняя проверка PR: mergeable=true.
- Сравнение `27537227774ac8b6a6f0ad6236559b2ce0da0202...3507e1738c33dfdc4789827c8d9c62f0450d6fe3` подтверждает: после code/test SHA изменялись только 8 документационных файлов; код и тесты не изменялись. Изменения PR относительно main: 15 файлов (код coordinator, runtime, SW, тесты и документы).
- Проверки: code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202` — Fast quality checks run #44089591987: 553/553 tests passed; Android Debug APK runs #44089591824 и #44089600740 успешны. Для предыдущего HEAD `3507e173...` Android Debug APK pull_request run [#44092265152](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44092265152) завершился success; все шаги, включая regression tests и APK build/upload, успешны. Cloudflare Workers preview check для него также success. Это preview build, не подтверждение production deployment. Для status-only HEAD `afc5cec...` run #44094653314 завершился success. Следующий status-only HEAD `550cda9...`: run #44094791631 был запущен; при последней проверке workflow выполнялся. Текущий коммит этой записи также запускает CI; перед следующими кодовыми изменениями обязательно получить актуальный branch SHA и дождаться его проверок. Отдельный Fast quality checks run для HEAD `3507e17...` не найден; тестовый результат относится к неизменённому code/test SHA `275372...`.
- Проверен текущий PR diff и рабочая ветка: удалённых/неучтённых незавершённых удалённых изменений не обнаружено. GitHub отражает коммиты ветки; локальное рабочее дерево через GitHub API недоступно и не утверждается как проверенное.
- Исходный пользовательский DOCX повторно прочитан непосредственно из загруженного файла. P10 (абзац 11) буквально говорит об установке двух днищ; пользователь отдельно подтвердил три отдельных днища под тремя корпусами первоначального ряда. Это расхождение явно зафиксировано; для модели OP-04 действует прямое подтверждение пользователя. P11 допускает установку второго ряда сразу или через несколько дней; P12 описывает установку трёх подкрышников и крышек после второго ряда.
- Подтверждено пользователем 2026-11-17: во всех рабочих состояниях используются ровно три подкрышника и три крыши; временные элементы не применяются. Для первоначального ряда дополнительно подтверждены три корпуса в линию на трёх отдельных днищах. Это пользовательские уточнения, а не вывод из DOCX.
- В `js/sectional-physical-layout.js` добавлено поле `broodRows`: `1` валидирует промежуточный один ряд (по одному корпусу на секцию), `2` — итоговые два ряда; для старых записей без поля сохраняется прежняя трактовка двух корпусов на секцию. В каждом из трёх стеков обязательны собственные bottom, topRiser и cover. Coordinator `completeOP04()` по-прежнему принимает только два корпуса на секцию и не позволяет отметить первый ряд как завершённый OP-04.
- Добавлены тесты промежуточной раскладки и блокировки завершения OP-04 на одном ряду. Fast quality checks на code/test SHA `2a70452abf256f0571206894c19e13e04553ffba` — 556/556 tests passed (run #44096138371); Android Debug APK PR run #44096148887 — success, включая regression tests, сборку и загрузку APK. На последнем code/test SHA профиль и UI не активируются; OP-05/OP-06 не реализованы, reduced two-queen ветвь OP-06 остаётся fail-closed.
- Main не изменялся. Production database, production deployment, пользовательские данные и локальные записи пасеки не затрагивались.
- Следующий конкретный шаг: реализовать атомарный переход `broodRows: 1` → `broodRows: 2` с перемещением трёх дополнительных корпусов, обновлением журналов оборудования и полным rollback; затем покрыть немедленный и отложенный сценарии тестами. PR #148 остаётся Draft; `main` не изменялась.

---

# Контрольная точка — 2026-11-17: подтверждён постоянный комплект из трёх подкрышников и трёх крышек

- Пользователь подтвердил количество для всех рабочих состояний: один ряд, два ряда, два ряда с медовыми корпусами — всегда 3 подкрышника + 3 крышки; временные элементы не используются.
- Это отдельное подтверждение пользователя, не утверждение DOCX. В DOCX перечислены 3+3 в комплекте (стр. 1), но P10–P12 не полностью описывают промежуточную конфигурацию одного ряда.
- В текущей модели SIDE_BY_SIDE валидатор уже требует topRiserItemId и coverItemId для каждого из трёх стеков; coordinator PR #148 работает с тремя стеками. Проверка, что те же 3+3 сохраняются в будущих staged transitions и в медовой конфигурации, ещё требуется.
- Блокер временных подкрышников/крышек закрыт. Следующий шаг — спроектировать промежуточную физическую раскладку одного ряда и безопасный переход к двум рядам, не меняя количество 3+3.
- PR #148 остаётся Draft. Code/test SHA 27537227774ac8b6a6f0ad6236559b2ce0da0202; документационные изменения после него не меняют код. Текущий HEAD до этого документального обновления: bea4c8e74fc337f07a27641d035ec5c4c6c7405a. CI для нового HEAD после обновления ещё не проверен.

---

## Контрольная точка — 2026-11-17: Draft PR #148, атомарное завершение OP-04

- Актуальный `main`: `d8fd021a3a6ab4ed9613dbd558205bdf24e96be0`; PR #145 и #146 уже объединены.
- Рабочий PR [#148](https://github.com/250oisr-eng/Pasekaapp/pull/148), base `main`, branch `feat/sectional-op04-atomic-coordinator-2026-11-17`; code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202`, последующие коммиты ветки после code/test SHA содержат только документацию; это подтверждено сравнением GitHub. Актуальный PR HEAD сверяется напрямую перед любым следующим действием.. Сравнение подтверждает, что после code/test SHA менялись только документы. PR остаётся Draft, не объединён.
- Fast quality checks на code/test SHA `27537227774ac8b6a6f0ad6236559b2ce0da0202`: run #44089591987 — **553/553 tests passed**. Android Debug APK: push run #44089591824 и pull_request run #44089600740 — **success**. Artifact #14330024531, 3,394,753 bytes, SHA-256 `c8bffeabc272de8b189d44abd14552401367e782c57e4bdd31e7835f914e67e6`, expires 2026-12-01.
- PR добавляет `PasekaSectionalOperationCoordinator.completeOP04()`: clone → split lineage → physical layout → explicit accessory/body movement → full validation → one commit. При любой ошибке исходное состояние остаётся неизменным.
- Все четыре исходные пластиковые заглушки учитываются при тестировании по DOCX P10. Перемещения шести гнездовых корпусов записываются в историю корпуса и общий журнал оборудования; OP-04 получает отдельную запись в `auditLog`.
- App schemaVersion повышается 14→15; IndexedDB object-store version остаётся 3. Добавлена `sectionalTechProcesses`, её проверка в startup/save/backup/snapshot; Service Worker v313. Старые schema14 backups остаются совместимыми.
- **Открытый источник-зависимый вопрос:** DOCX P11 допускает установить второй ряд из трёх корпусов не сразу, а через несколько дней; P12 описывает установку подкрышников и крышек после этого. Текущий coordinator завершает только итоговую раскладку из шести корпусов и не моделирует промежуточное физическое состояние после первого ряда. Источник не уточняет все детали временного укрытия/фиксации этой промежуточной конфигурации. До отдельной модели этого состояния нельзя активировать профиль или UI технологического процесса и нельзя считать промежуточный этап завершённым.
- OP-05/OP-06, UI, активация профиля и реальные операции не входят в PR #148. OP-06 reduced two-queen branch остаётся fail-closed: правило снятия сетчатых заглушек источником не задано.
- Следующий шаг: отдельно спроектировать промежуточное физическое состояние OP-04 после первого ряда из трёх корпусов и до установки второго ряда. До подтверждения/реализации этого состояния не переводить PR из Draft, не объединять его и не активировать профиль.

---

## Контрольная точка — 2026-11-17: PR #146 merged; core family lineage runtime integrated

- Актуальный main SHA: `a1798b0bc47f8f4642c42ac4ab363a98cc1c3e59` — merge commit PR #146. PR #145 и PR #146 объединены.
- PR #146 интегрировал `js/family-lineage.js` в runtime, root `familyEvents`, migration app schema 12→14, lineage validation в startup/save/raw backup, snapshot history, backup compatibility и Service Worker v312.
- На точном code/test SHA `ffbf931453868208460e59d274e09d6c557b8297` GitHub Actions run #44084558765: **545/545 tests passed**, 0 failed; Android Debug APK build/upload — **success**. Artifact #14329575117, 3,387,913 bytes, SHA-256 `c71c7bbd74e26b0c750d33776fd401bf3afde22811fe7da258cc49916446a4cb`, expiry 2026-12-01.
- Для merge commit `a1798b0bc47f8f4642c42ac4ab363a98cc1c3e59` отдельные workflow runs/combined status не представлены. Успешные проверки относятся к точному code/test SHA `ffbf931453868208460e59d274e09d6c557b8297`, не к merge commit.
- IndexedDB object-store version остаётся 3. Прикладная схема 14: legacy schema 1–12 мигрирует добавлением пустого журнала; schema13 поддерживается как переходная; schema14 требует корректный `familyEvents`. Повреждённый существующий журнал или отсутствующий журнал schema14 блокирует миграцию до изменения состояния. Save gate также не восстанавливает отсутствующий журнал schema14 автоматически.
- Исторические семьи/матки и неизвестные разделения не реконструируются. Новая модель lineage проверяется, но UI и OP coordinator пока не подключены.
- Следующий приоритет: спроектировать и реализовать отдельный атомарный coordinator OP-04/05/06 (clone-and-commit/rollback) поверх lineage + sectional layout + inventory + audit. Сначала OP-04, затем OP-05, затем OP-06. До этого не активировать профиль секционного улья и не добавлять UI.
- Открытые старые PR #101/#104 (lineage), #87 (queen laying / OP-06), #105/#106 (sectional layout) и PR #54–58 не объединять напрямую: провести selective diff audit относительно main. PR #145/#146 merged; PR #143/#144 superseded.
- Уточнение по DOCX: описан продуктивный сценарий с двумя матками, если одна из трёх не вернулась, и необязательный перенос двух рамок с яйцами из семьи с исходной маткой в два других отсека (P28–P33). Однако точное правило снятия сетчатых заглушек для reduced two-queen branch в источнике не определено; этот переход должен оставаться fail-closed до отдельного решения.

---

## Контрольная точка — 2026-11-17: PR #145 интегрирован; lineage runtime в PR #146

- Актуальный GitHub main: `d73d9523c1c566624ac372ef768f0253aa8faee6` — merge commit PR #145. PR #145 закрыт слиянием; физический ownership bridge, sectional inventory invariants и подтверждение двух больших решёток теперь входят в main.
- Проверенный кодовый SHA PR #145: `7975abb6cd2084d8eee003e325b3e05cbebaf0f7`; Fast quality checks **536/536 tests passed** (run #44081137150), Android Debug APK build/upload **success** (run #44081137033). После code SHA были только документационные коммиты. Для merge commit `d73d9523c1c566624ac372ef768f0253aa8faee6` GitHub Actions workflow runs и combined status не представлены; это не записывается как успешный CI на merge SHA.
- Следующий технический блок выполняется в Draft PR [#146](https://github.com/250oisr-eng/Pasekaapp/pull/146), ветка `feat/family-events-runtime-integration-2026-11-17`, base `d73d9523c1c566624ac372ef768f0253aa8faee6`, текущий HEAD `19bc270b4f726201e1c18432190092ee552fe235`.
- PR #146 подключает `js/family-lineage.js` к runtime, добавляет `familyEvents`, additive migration прикладной схемы 12→14, lineage integrity в startup/save/raw-backup validation, сохранение событий в snapshot history, совместимость старых backup и Service Worker cache v312.
- IndexedDB object-store version остаётся 3. Схема 13 принимается как переходная: если массив событий уже присутствует, он сохраняется; если отсутствует, создаётся пустой массив. Для схемы 14 массив обязателен. Некорректный существующий массив не заменяется и должен блокировать миграцию до изменения других данных.
- PR #146 проверяется. Android workflow run #44083460821 на HEAD `19bc270b4f726201e1c18432190092ee552fe235` был запущен; на момент записи выполнялся. Результат тестов/сборки пока не подтверждён. Не считать отсутствие отдельного combined status прохождением проверок.
- UI, coordinator OP-04/05/06, активация профиля секционного улья, реальные операции, production и публикация не выполняются этим PR.
- Следующий шаг: дождаться и разобрать CI PR #146 на актуальном HEAD; исправить выявленные ошибки, затем проверить документацию и полную обратную совместимость backup/snapshot.

---

# PROJECT_STATUS — Пасека 2.0

> Главный оперативный журнал состояния разработки и точка восстановления после обрыва связи.
> Последняя сверка: **2026-11-17, после merge PR #146; lineage runtime подключён, OP coordinator следующий**.
> Источник фактического состояния: GitHub main, PR и Actions. Переписка ChatGPT не заменяет этот файл.


## Новая контрольная точка — 2026-11-17: физические инварианты инвентаря секционного улья

- PR #142 уже объединён в main: `02d91ef1cc57c61cbc7789b1b61eda03c8923122`. Событие `queen_absence_confirmed` доступно в изолированном `js/family-lineage.js`; runtime/save/backup/SW интеграция lineage ещё не выполнена.
- Из PR #144 перенесены изменения физического инвентаря в новую независимую ветку `fix/sectional-inventory-location-main-2026-11-17`, основанную непосредственно на актуальном main. Это устраняет stacked-зависимость от PR #143 и исключает потерю изменений PR #142.
- Перенесены `index.html`, `js/equipment-inventory.js`, `js/sectional-physical-layout.js`, `sw.js` и три регрессионных файла. Добавлены derived location для `sectionalLayouts`, проверка инвентаря в save gate, обязательные ссылки на три днища/крышки/подкрышника, максимум одна фактическая feeder location, запрет пластиковых заглушек в SIDE_BY_SIDE и helper полного покрытия OP-05.
- Из PR #143 перенесено подтверждение пользователя: две большие разделительные решётки на весь улей. Оно отделено от двух технических решёток на соединение и временных сетчатых заглушек.
- P10 описывает 4 отверстия первого ряда (1+2+1), P11 повторяет схему во втором ряду; двухрядная раскладка требует 8 отверстий и 8 технических решёток. Валидатор теперь проверяет каждое тело и все связи; OP-05 покрывает все 8 фактических openingId. Диаметр 50 мм подтверждён пользователем.
- На точном PR #145 HEAD `7975abb6cd2084d8eee003e325b3e05cbebaf0f7` Fast quality checks прошли **536/536 tests** (run #44081137150); Android Debug APK build и upload — **success** (run #44081137033). Artifact #14326877819, 3,387,491 bytes, SHA-256 `7c61565660ff61d6d0f79b451300006fe3c92cf5810e808b2c5e85e4239fa69b`, expiry 2026-12-01.
- PR [#145](https://github.com/250oisr-eng/Pasekaapp/pull/145) открыт для review от main, mergeable=true. PR #143 и #144 закрыты как superseded; их изменения перенесены в #145. Merge PR #145 требует отдельного подтверждения пользователя.
- Следующий шаг: выполнить CI на новой ветке, проверить diff относительно main и завершить независимый PR. Затем отдельным этапом интегрировать `familyEvents` в runtime, миграцию, save/snapshot, backup/restore и Service Worker. UI и активацию профиля не начинать.

## Новая контрольная точка — 2026-11-17: две большие разделительные решётки

- Пользователь подтвердил: для трёхсекционного улья используются **две большие разделительные решётки на весь улей**, а не три. Это пользовательское уточнение; DOCX на стр. 3 описывает установку первой и второй решёток, но не задаёт полную геометрию.
- Технические решётки в боковых отверстиях и временные сетчатые заглушки — другие предметы; их число не определяется этим подтверждением.
- Актуальный `main` после merge PR #142: `02d91ef1cc57c61cbc7789b1b61eda03c8923122`.
- PR #142 объединён в main squash-коммитом `02d91ef1cc57c61cbc7789b1b61eda03c8923122`. Code SHA `aa6677d5657a06bdd0a4cf86fd487f0513090223`: 519/519 tests passed; Android Debug APK build/upload success. Добавлен `queen_absence_confirmed`, явное время наблюдения, запрет будущей даты и split OP-04 без поиска исходной матки.
- Следующий главный блок: атомарная доменная интеграция OP-04/05/06 поверх согласованной модели queen absence; синхронизация family lineage, sectionalLayouts, physical equipment, audit и techprocess с полным rollback. UI и активацию профиля не начинать.
- Важный блокер перед реализацией: старые PR #54–58 образуют устаревшую stacked-цепочку. `docs/АУДИТ-PR-54-58-2026-11-16.md` фиксирует критические обходы DONE для OP-04/05 и неверную последовательность OP-14. Не объединять и не переносить их целиком; использовать только после выборочного аудита. В текущем main techprocess registry отсутствует, `index.html` не содержит `S.sectionalTechProcesses`/`techProcesses`; сохранение работает через текущие `records`.

## 1. Проект и текущее состояние

- **Проект:** «Пасека» / Pasekaapp.
- **Репозиторий:** https://github.com/250oisr-eng/Pasekaapp
- **Основная ветка:** main.
- **Последний подтверждённый main SHA:** `02d91ef1cc57c61cbc7789b1b61eda03c8923122`.
- **Состояние:** активная разработка; физическая модель секционного улья и реестр оборудования интегрированы как проверяемые доменные компоненты. Новый профиль ещё не активирован; пользовательские технологические операции OP-04/05/06 не интегрированы с физической раскладкой и lineage.
- **Главный источник технологии:** пользовательский DOCX «улей для каждого техпроцесс.docx» (9 страниц) и последующие явно подтверждённые пользователем уточнения. Неизвестные параметры не додумывать.
- **Бесплатность:** обязательное ограничение проекта; платные API, тарифы, модели, хостинги и опции запрещены.

## 2. Последний завершённый этап

**Этап непрерывности разработки:** корневой PROJECT_STATUS.md создан и обязательность его чтения/обновления закреплена PR [#139](https://github.com/250oisr-eng/Pasekaapp/pull/139), merge commit 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec.

**Этап:** отдельная физическая модель sectionalLayouts и фиксация её интеграции.

- PR [#134](https://github.com/250oisr-eng/Pasekaapp/pull/134) — добавлен доменный реестр физических принадлежностей js/equipment-items.js; merge commit 16b906b97f8dcdfbffe629a5ad6330884768a92d.
- PR [#136](https://github.com/250oisr-eng/Pasekaapp/pull/136) — реестр подключён к runtime-приложению, backup validation и Service Worker; merge commit febff4547e996fbec00f7d56b61fb5b20d6d9b4b.
- PR [#137](https://github.com/250oisr-eng/Pasekaapp/pull/137) — добавлен отдельный валидатор js/sectional-physical-layout.js и root-коллекция sectionalLayouts; merge commit f3de349a5018c557bfdb580071cf235018dd2dfd.
- PR [#138](https://github.com/250oisr-eng/Pasekaapp/pull/138) — обновлены документы состояния и передачи; merge commit 6e31d5b3f1183275037f7f357f52e791e64d1f34.

### Что реализовано

- equipmentInventory.items — отдельный реестр физических принадлежностей с доменной проверкой.
- sectionalLayouts — отдельное текущее физическое состояние секционного улья; не дублируется внутри techprocess record.
- Проверки физической раскладки включены в save(), диагностику пасеки, проверку backup/raw-backup и snapshot history.
- Поддерживаются режимы SIDE_BY_SIDE, ALTERNATIVE_WINTERING_COLUMN, SINGLE_FAMILY.
- Для SIDE_BY_SIDE проверяются три секции по два гнездовых корпуса и две технические связи; каждая связь требует две технические решётки и буферный коридор.
- Для R4 проверяются ровно две большие решётки FULL/HALF по явным верхним корпусам.
- Альтернативная зимовка проверяет распределение [2,1,1] без фиксации сильной семьи в нижней позиции и требует две сетчатые диафрагмы.
- SINGLE_FAMILY поддерживает три или четыре гнездовых корпуса.
- Старые записи без sectionalLayouts остаются допустимыми.

## 3. Изменённые файлы последнего этапа

### PR #134
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- js/equipment-items.js
- tests/equipment-items.test.mjs

### PR #136
- index.html
- sw.js
- tests/regression.test.mjs

### PR #137
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- index.html
- js/sectional-physical-layout.js
- sw.js
- tests/plant-module.test.mjs
- tests/regression.test.mjs
- tests/sectional-physical-layout.test.mjs

### PR #138
- docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md
- docs/КАРТА-ОТКРЫТЫХ-PR-2026-11-17.md
- docs/МОДЕЛЬ-СЕМЕЙ-И-ФИЗИЧЕСКОЙ-РАСКЛАДКИ.md
- docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md
- docs/ПЛАН-РАЗРАБОТКИ.md
- docs/СОСТОЯНИЕ-ПРОЕКТА.md

### PR #139 — постоянный журнал состояния
- AGENTS.md
- PROJECT_STATUS.md
- docs/PROJECT-CONTROL.md
- docs/ПРАВИЛА-РАЗРАБОТКИ.md

### PR #140 — фиксация интеграции журнала
- PROJECT_STATUS.md
- docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md
- docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md
- docs/СОСТОЯНИЕ-ПРОЕКТА.md

## 4. Проверки и подтверждённые результаты

Проверки выполнены на точном PR HEAD aa18cc00c1aa5a6e98c31486df104b54b8e49046 для PR #137:

- Fast quality checks, run [#44040678772](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040678772): **510/510 тестов пройдены**.
- Android Debug APK, push run [#44040678865](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040678865): сборка и загрузка артефакта успешны.
- Android Debug APK, pull_request run [#44040686014](https://github.com/250oisr-eng/Pasekaapp/actions/runs/44040686014): сборка и загрузка артефакта успешны.
- Артефакт #14309540416, 3 384 494 bytes, SHA-256 c0fe22078d00f4607f1ffbb8610b63b7179884737bd9c1d82b8cac64eccf940f; срок хранения, зафиксированный при создании: 2026-12-01 07:42:45 UTC.
- Физическое тестирование на Android-устройстве **не проводилось**.
- Для документационного merge PR #138 (SHA 6e31d5b3f1183275037f7f357f52e791e64d1f34) GitHub workflow runs и combined status не вернули записей.
- PR #139 — документационный; для его merge SHA 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec workflow runs и combined status не вернули записей.
- PR #140 — документационный; для его merge SHA 562c3a7794e0b0c1dc5fda46bb89169274fc5446 workflow runs и combined status также не вернули записей. Это означает «CI для этих документационных commits не представлен», а не «CI прошёл».

## 5. Совместимость, данные и границы

- IndexedDB version остаётся **3**; прикладная schemaVersion остаётся **12**.
- Миграции не добавлялись.
- Формат backup не менялся.
- Старые записи без sectionalLayouts допустимы.
- Пользовательские данные не изменялись.
- Production database и production deployment в рамках PR #134/#136/#137/#138/#139 не изменялись.
- Новый профиль секционного улья **не активирован**.
- UI создания/редактирования физической раскладки и реальные физические перемещения не добавлены.
- Технологические переходы OP-04/05/06 не синхронизированы атомарно с lineage, layout, inventory, audit и techprocess.

## 6. Известные проблемы и открытые ограничения

1. **Подтверждение отсутствия матки реализовано только в открытом PR #142.** В main событие пока отсутствует. DOCX P29 допускает продуктивную двухматочную ветвь, если одна матка не вернулась с облёта. Отсутствие currentQueenId само по себе не является подтверждением потери матки.
2. **OP-06 для двухматочной ветви не определён источником.** DOCX допускает работу двух маток, если одна не вернулась, но не объясняет, когда снимать сетчатые заглушки в этом случае. Событие queen_absence_confirmed не должно автоматически разрешать OP-06; до решения пользователя ветвь должна блокироваться.
2. **Нет атомарного перехода OP-04/05/06 и принятой runtime-модели техпроцесса.** Изменения семей/маток, физической раскладки, принадлежностей, аудита и записи техпроцесса пока не выполняются одной согласованной транзакцией/операцией с rollback. Старые PR #54–58 имеют критические дефекты по аудиту и не могут быть объединены как есть.
3. **Family lineage остаётся изолированным доменным модулем.** Не подключать его к реальным операциям/UI до синхронизации с sectionalLayouts, equipmentInventory.items, audit и techprocess.
4. **Профиль секционного улья не активировать** до полной поддержки всех затрагиваемых модулей и локальных проверок.
5. PR #101/#104/#105/#106 остаются открытыми Draft-кандидатами на старых stacked base/head. Они не являются готовыми к прямому merge; требуется selective port после проверки diff и зависимостей.
6. PR #89/#95 также остаются открытыми Draft на старых базовых ветках. Их нельзя считать актуальным источником реестра оборудования или R4 без сравнения с уже интегрированными #134/#136/#137.
7. Физическое Android-устройство не тестировалось.
8. **Lovable:** проект Apiary Family Atlas найден в workspace. Последнее изменение — 2026-11-16 21:36:50 UTC; опубликован. Текущий статус агента — needs_attention, причина out_of_credits; последний Lovable commit f9fb8025a286949e5858ffe32dea91bc7c80ecdb. Этот SHA не найден как commit репозитория Pasekaapp; синхронизация Lovable с GitHub main не подтверждена. GitHub main остаётся источником истины для кода.

## 7. Текущая незавершённая задача

**Подготовить атомарный доменный переход OP-04/05/06, использующий отдельное событие queen absence из PR #142 после его интеграции.**

Событие queen absence реализовано в PR #142 и прошло CI на его HEAD, но PR остаётся Draft и не входит в main. Атомарный переход OP-04/05/06 ещё не реализован. UI не начинать до определения транзакционной границы и rollback.

## 8. Следующий конкретный шаг

1. Повторно сверить старую технологическую цепочку PR #54–58 с текущим main и аудитом `docs/АУДИТ-PR-54-58-2026-11-16.md`; не объединять её напрямую.
2. Определить безопасную модель хранения техпроцесса и совместимость с текущими `records`, IndexedDB schemaVersion 12, backup/restore и offline.
3. Проверить PR #142 и его зависимость для queen absence; не считать событие интегрированным в main.
4. Спроектировать атомарную границу OP-04/05/06: lineage + sectionalLayouts + equipment inventory + audit + techprocess, включая rollback.
5. Реализовать доменный переход и тесты отказов/повторов; UI и активацию профиля отложить до приёмки модели.

## 9. История важных контрольных точек

| Дата | Этап | Подтверждённый результат |
|---|---|---|
| 2026-11-17 | PR #134 | Реестр физических принадлежностей добавлен; merge 16b906b9… |
| 2026-11-17 | PR #136 | Runtime/backup/SW integration; merge febff454… |
| 2026-11-17 | PR #137 | Валидируемая sectionalLayouts; 510/510 tests и Android Debug APK; merge f3de349a… |
| 2026-11-17 | PR #138 | Документы и план обновлены; merge 6e31d5b3… |
| 2026-11-17 | PR #139 | Создан корневой PROJECT_STATUS.md; правила чтения и обновления закреплены в AGENTS.md, PROJECT-CONTROL.md и ПРАВИЛА-РАЗРАБОТКИ.md; merge 0cfb2632… |
| 2026-11-17 | PR #140 | Факт интеграции журнала внесён в состояние, журнал и передачу между чатами; merge 562c3a77… |
| 2026-11-17 | Текущая сверка | Lovable найден, но статус out_of_credits; SHA не совпадает с подтверждённым GitHub main |

## 10. Правила обновления этого файла

- Читать этот файл первым при каждом возобновлении работы, затем проверять фактический GitHub main/PR/CI и Lovable.
- После каждого логически завершённого этапа обновлять этот файл **в том же PR/изменении**, что и соответствующий этап.
- Не записывать предположения как факты. Для каждого CI-результата указывать точный SHA и ссылку на run.
- Не указывать merge/сохранение/публикацию как завершённые без подтверждения соответствующего сервиса.
- Не удалять старые записи из раздела истории; новые контрольные точки добавлять сверху или в конец, сохраняя хронологию.
- При расхождении этого файла с GitHub сначала проверить фактическое состояние и исправить журнал отдельной записью; файл не является основанием игнорировать реальный GitHub.
- В конце каждого этапа указывать один следующий шаг и конкретные незавершённые блокеры.


## 11. Подтверждение внедрения постоянного журнала

- PR #139 merged в GitHub main: 0cfb2632e82b6b7d7da80503c65b2cd1093e13ec.
- После merge повторно проверены наличие PROJECT_STATUS.md в main и статус PR #139.
- PR #139 изменил только документацию и правила управления; код, IndexedDB, backup, пользовательские данные, Lovable и production не менялись.
- CI для документационного merge SHA не представлен; это не трактуется как успешная проверка приложения.


## 12. Контрольная точка PR #140

- PR #140 merged в main: 562c3a7794e0b0c1dc5fda46bb89169274fc5446.
- PROJECT_STATUS.md и документы состояния/журнала/передачи содержат запись об интеграции PR #139.
- PR #140 был документационным; workflow runs и combined status для merge SHA отсутствуют. Кодовые проверки не заявляются.


## Решение пользователя — учёт пустых корпусов и комплектности рамок (2026-11-17)

Пользователь уточнил два состояния из DOCX:
- P57: временный корпус без рамок используется только для стряхивания пчёл с рамок в общую семью, после чего корпус убирается. Эта вспомогательная операция и временное использование корпуса **не учитываются в приложении**: не создают установленный корпус, запись инвентарного перемещения или технологическое событие.
- P77: «пустой корпус» означает **незаселённый корпус с рамками**. Это реальный установленный корпус, он учитывается в физической раскладке, инвентаре и истории оборудования.

Следствие: правило полной комплектности не имеет исключения для установленных корпусов. Каждый учитываемый установленный корпус должен содержать ровно число рамок, соответствующее его вместимости. «Пустой» по заселённости корпус не означает отсутствие рамок. Временный корпус P57 находится вне модели учёта приложения.
